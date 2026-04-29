import Anthropic from "@anthropic-ai/sdk";
import { db, schema } from "@/db/client";
import { and, eq, lt } from "drizzle-orm";
import { anthropic, MODEL, loadPromptByName } from "./anthropic";
import { loadContainerMessages } from "@/lib/containerMessages";
import { formatProjectFacts } from "@/lib/ingest/projectFacts";
import {
  BUILD_TOOL_DEFS,
  runBuildTool,
  type BuildCtx,
} from "./buildTools";
import type { BuildLogEntry, CodeChange, LinkedPr } from "@/db/schema";
import { ensureGitRepo } from "@/lib/git";

const MAX_TURNS = 20;
const MAX_TOKENS = 4096;
const STALE_RUN_MS = 10 * 60 * 1000;

export type BuildEvent =
  | { event: "run"; data: { runId: string } }
  | { event: "token"; data: { text: string } }
  | { event: "tool_call"; data: { name: string; arg: string } }
  | { event: "tool_result"; data: { name: string; ok: boolean; preview: string } }
  | { event: "status"; data: { status: (typeof schema.codeRuns.$inferSelect)["status"] } }
  | { event: "done"; data: { runId: string; status: string; changeCount: number } }
  | { event: "error"; data: { message: string } };

export type BuildEmit = (e: BuildEvent) => void;

function renderFeatureContext(
  feature: typeof schema.features.$inferSelect,
): string {
  const digest = feature.discoveryDigest;
  const blockers = feature.blockers ?? [];
  const prs = (feature.linkedPrIds as LinkedPr[]) ?? [];
  const parts: string[] = [];
  parts.push(
    `## Feature record\nTitle: ${feature.title}\nSlug: ${feature.slug}\nStatus: ${feature.status}${feature.statusNote ? ` — ${feature.statusNote}` : ""}\nBranch: ${feature.branchName ?? "(unset — will default to agentic/<slug>)"}\nGitHub: ${feature.githubRepo ?? "(none)"}`,
  );
  if (digest) {
    parts.push(
      `## Discovery digest\nFramed problem: ${digest.framedProblem}` +
        (digest.keyContext.length
          ? `\nKey context:\n- ${digest.keyContext.join("\n- ")}`
          : "") +
        (digest.sourceQuotes.length
          ? `\nSource quotes:\n- ${digest.sourceQuotes.map((q) => `"${q}"`).join("\n- ")}`
          : ""),
    );
  }
  if (blockers.length) {
    parts.push(`## Blockers\n- ${blockers.map((b) => b.body).join("\n- ")}`);
  }
  if (prs.length) {
    parts.push(
      `## Existing linked PRs\n${prs.map((pr) => `#${pr.number} (${pr.state}) ${pr.title}`).join("\n")}`,
    );
  }
  return parts.join("\n\n");
}

function renderThread(
  rows: Awaited<ReturnType<typeof loadContainerMessages>>,
): string {
  const lines: string[] = [];
  for (const r of rows) {
    if (!r.bodyMd?.trim()) continue;
    const who =
      r.authorKind === "agent"
        ? r.agentRole === "feature-chat"
          ? "Agent"
          : `Agent (${r.agentRole ?? "system"})`
        : r.authorLabel || r.authorPersona;
    lines.push(`### ${who}\n${r.bodyMd.trim()}`);
  }
  return lines.join("\n\n");
}

async function appendLog(runId: string, entry: BuildLogEntry) {
  const row = await db.query.codeRuns.findFirst({
    where: eq(schema.codeRuns.id, runId),
  });
  if (!row) return;
  const next = [...(row.log ?? []), entry];
  await db
    .update(schema.codeRuns)
    .set({ log: next })
    .where(eq(schema.codeRuns.id, runId));
}

export async function reapStaleRuns(featureId: string) {
  const cutoff = new Date(Date.now() - STALE_RUN_MS);
  await db
    .update(schema.codeRuns)
    .set({
      status: "error",
      errorMessage: "stale: server restart or runner crashed",
      finishedAt: new Date(),
    })
    .where(
      and(
        eq(schema.codeRuns.featureId, featureId),
        eq(schema.codeRuns.status, "running"),
        lt(schema.codeRuns.createdAt, cutoff),
      ),
    );
}

export async function runBuildAgent(opts: {
  featureId: string;
  emit: BuildEmit;
}) {
  const { featureId, emit } = opts;

  const feature = await db.query.features.findFirst({
    where: eq(schema.features.id, featureId),
  });
  if (!feature) {
    emit({ event: "error", data: { message: "feature not found" } });
    return null;
  }

  const project = await db.query.projects.findFirst({
    where: eq(schema.projects.id, feature.projectId),
  });
  if (!project) {
    emit({ event: "error", data: { message: "project not found" } });
    return null;
  }

  if (!project.rootPath) {
    emit({
      event: "error",
      data: { message: "project has no rootPath; cannot edit files" },
    });
    return null;
  }

  try {
    await ensureGitRepo(project.rootPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    emit({ event: "error", data: { message: msg } });
    return null;
  }

  await reapStaleRuns(featureId);

  // Concurrency guard.
  const existing = await db.query.codeRuns.findFirst({
    where: and(
      eq(schema.codeRuns.featureId, featureId),
      eq(schema.codeRuns.status, "running"),
    ),
  });
  if (existing) {
    emit({
      event: "error",
      data: { message: "a build is already running for this feature" },
    });
    return null;
  }

  const branchName =
    feature.branchName?.trim() || `agentic/${feature.slug}`;

  const [run] = await db
    .insert(schema.codeRuns)
    .values({
      featureId,
      branchName,
      baseBranch: "main",
      status: "running",
      changes: [],
      log: [],
    })
    .returning();

  emit({ event: "run", data: { runId: run.id } });

  // Persist a placeholder agent message in the feature thread to anchor the run.
  const [agentMsg] = await db
    .insert(schema.messages)
    .values({
      threadKind: "feature",
      containerId: featureId,
      authorKind: "agent",
      authorPersona: "agent",
      agentRole: "build",
      authorLabel: "Agent (build)",
      bodyMd: "Starting build…",
      blocks: [],
    })
    .returning();
  await db
    .update(schema.codeRuns)
    .set({ agentMessageId: agentMsg.id })
    .where(eq(schema.codeRuns.id, run.id));

  const ctx: BuildCtx = {
    runId: run.id,
    featureId,
    projectId: feature.projectId,
    rootPath: project.rootPath,
    shadow: new Map(),
    baseline: new Map(),
    finalize: null,
  };

  const baseSystem = await loadPromptByName("build-agent");
  const facts = project.facts ? formatProjectFacts(project.facts) : null;
  const featureContext = renderFeatureContext(feature);
  const threadRows = await loadContainerMessages("feature", featureId);
  const thread = renderThread(threadRows.filter((r) => r.id !== agentMsg.id));

  const systemParts = [baseSystem];
  if (facts) systemParts.push(facts);
  systemParts.push(`# Feature context\n\n${featureContext}`);
  systemParts.push(`# Feature thread (in order)\n\n${thread || "(empty)"}`);
  const system = systemParts.join("\n\n");

  const a = anthropic();
  const messages: Anthropic.Messages.MessageParam[] = [
    {
      role: "user",
      content:
        "Implement the agreed plan from the feature thread above. Read first, then edit. When complete, call finalize_build exactly once and stop.",
    },
  ];

  let assistantTextRunning = "";

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      let assistantText = "";
      const toolUses: {
        id: string;
        name: string;
        input: Record<string, unknown>;
      }[] = [];

      const stream = a.messages.stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: [
          {
            type: "text",
            text: system,
            cache_control: { type: "ephemeral" },
          },
        ],
        tools: BUILD_TOOL_DEFS,
        messages,
      });

      for await (const evt of stream) {
        if (
          evt.type === "content_block_delta" &&
          evt.delta.type === "text_delta"
        ) {
          assistantText += evt.delta.text;
          assistantTextRunning += evt.delta.text;
          emit({ event: "token", data: { text: evt.delta.text } });
        } else if (
          evt.type === "content_block_start" &&
          evt.content_block.type === "tool_use"
        ) {
          // Tool args fully arrive in finalMessage; we'll emit then.
        }
      }

      const finalMsg = await stream.finalMessage();

      for (const block of finalMsg.content) {
        if (block.type === "tool_use") {
          toolUses.push({
            id: block.id,
            name: block.name,
            input: (block.input as Record<string, unknown>) ?? {},
          });
        }
      }

      if (assistantText.trim()) {
        await appendLog(run.id, {
          type: "text",
          text: assistantText,
          at: new Date().toISOString(),
        });
      }

      if (
        finalMsg.stop_reason === "tool_use" &&
        toolUses.length > 0
      ) {
        messages.push({ role: "assistant", content: finalMsg.content });
        const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
        for (const tu of toolUses) {
          const arg = summarizeArg(tu.name, tu.input);
          emit({
            event: "tool_call",
            data: { name: tu.name, arg },
          });
          const result = await runBuildTool(tu.name, tu.input, ctx);
          const ok = !result.text.startsWith(`${tu.name}:`);
          await appendLog(run.id, {
            type: "tool",
            name: tu.name,
            arg,
            ok,
            at: new Date().toISOString(),
          });
          emit({
            event: "tool_result",
            data: {
              name: tu.name,
              ok,
              preview: result.text.slice(0, 240),
            },
          });
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: truncate(result.text, 6000),
          });
        }
        messages.push({ role: "user", content: toolResults });

        if (ctx.finalize) {
          // Agent signaled it's done. Don't loop further.
          break;
        }
        continue;
      }

      // No tool calls — agent is done (or stuck talking).
      break;
    }

    if (!ctx.finalize) {
      // Agent never called finalize_build. Mark error but keep changes for inspection.
      await db
        .update(schema.codeRuns)
        .set({
          status: "error",
          errorMessage:
            "Agent did not call finalize_build (turn cap reached or model gave up).",
          finishedAt: new Date(),
        })
        .where(eq(schema.codeRuns.id, run.id));
      await db
        .update(schema.messages)
        .set({
          bodyMd:
            assistantTextRunning.trim() ||
            "Build agent ran but did not finalize.",
        })
        .where(eq(schema.messages.id, agentMsg.id));
      emit({ event: "status", data: { status: "error" } });
      emit({
        event: "done",
        data: { runId: run.id, status: "error", changeCount: 0 },
      });
      return run.id;
    }

    const finalRow = await db.query.codeRuns.findFirst({
      where: eq(schema.codeRuns.id, run.id),
    });
    const changeCount = (finalRow?.changes as CodeChange[] | undefined)?.length ?? 0;

    if (changeCount === 0) {
      await db
        .update(schema.codeRuns)
        .set({
          status: "error",
          errorMessage:
            ctx.finalize.summary || "Agent finalized with zero file changes.",
          prTitle: ctx.finalize.prTitle,
          prBody: ctx.finalize.prBody,
          finishedAt: new Date(),
        })
        .where(eq(schema.codeRuns.id, run.id));
      await db
        .update(schema.messages)
        .set({
          bodyMd: `Build finalized with no file changes.\n\n${ctx.finalize.summary}`,
        })
        .where(eq(schema.messages.id, agentMsg.id));
      emit({ event: "status", data: { status: "error" } });
      emit({
        event: "done",
        data: { runId: run.id, status: "error", changeCount: 0 },
      });
      return run.id;
    }

    await db
      .update(schema.codeRuns)
      .set({
        status: "awaiting_review",
        prTitle: ctx.finalize.prTitle,
        prBody: ctx.finalize.prBody,
        finishedAt: new Date(),
      })
      .where(eq(schema.codeRuns.id, run.id));

    const summaryBody = `Build ready for review — ${changeCount} file${changeCount === 1 ? "" : "s"} changed.\n\n${ctx.finalize.summary}\n\n**Proposed PR:** ${ctx.finalize.prTitle}`;
    await db
      .update(schema.messages)
      .set({ bodyMd: summaryBody })
      .where(eq(schema.messages.id, agentMsg.id));

    emit({ event: "status", data: { status: "awaiting_review" } });
    emit({
      event: "done",
      data: {
        runId: run.id,
        status: "awaiting_review",
        changeCount,
      },
    });
    return run.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(schema.codeRuns)
      .set({
        status: "error",
        errorMessage: msg,
        finishedAt: new Date(),
      })
      .where(eq(schema.codeRuns.id, run.id));
    await db
      .update(schema.messages)
      .set({ bodyMd: `Build failed: ${msg}` })
      .where(eq(schema.messages.id, agentMsg.id));
    emit({ event: "error", data: { message: msg } });
    return run.id;
  }
}

function summarizeArg(name: string, input: Record<string, unknown>): string {
  if (name === "read_file" || name === "list_dir" || name === "delete_file") {
    return String(input.path ?? "");
  }
  if (name === "write_file") {
    const path = String(input.path ?? "");
    const len = String(input.content ?? "").length;
    return `${path} (${len} bytes)`;
  }
  if (name === "apply_patch") {
    return String(input.path ?? "");
  }
  if (name === "search_codebase" || name === "search_docs") {
    return String(input.query ?? "");
  }
  if (name === "finalize_build") {
    return String(input.pr_title ?? "");
  }
  return "";
}

function truncate(s: string, max: number) {
  return s.length <= max ? s : s.slice(0, max) + "\n…[truncated]";
}
