import type Anthropic from "@anthropic-ai/sdk";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { listProjectDir, readProjectFile, safeJoin } from "@/lib/git";
import { searchCodebase } from "@/lib/agent/tools/searchCodebase";
import { searchDocs } from "@/lib/agent/tools/searchDocs";
import type { CodeChange } from "@/db/schema";

export type FinalizeIntent = {
  summary: string;
  prTitle: string;
  prBody: string;
};

export type BuildCtx = {
  runId: string;
  featureId: string;
  projectId: string;
  rootPath: string;
  /**
   * Path -> shadow content. `null` means the file is marked for deletion.
   * If a path is absent, the agent has not edited it (read falls back to disk).
   */
  shadow: Map<string, string | null>;
  /** Original on-disk content cached on first read for diffing. */
  baseline: Map<string, string | null>;
  finalize: FinalizeIntent | null;
};

export type BuildToolResult = { text: string };

export type BuildToolHandler = (
  args: Record<string, unknown>,
  ctx: BuildCtx,
) => Promise<BuildToolResult>;

const MAX_FILE_BYTES = 200_000;
const MAX_LIST_ENTRIES = 200;
const MAX_PATCH_OUTPUT = 4_000;

async function loadFromShadowOrDisk(
  ctx: BuildCtx,
  relPath: string,
): Promise<string | null> {
  if (ctx.shadow.has(relPath)) {
    return ctx.shadow.get(relPath) ?? null;
  }
  if (!ctx.baseline.has(relPath)) {
    const disk = await readProjectFile(ctx.rootPath, relPath);
    ctx.baseline.set(relPath, disk);
  }
  return ctx.baseline.get(relPath) ?? null;
}

function recordChange(ctx: BuildCtx, relPath: string, next: string | null) {
  ctx.shadow.set(relPath, next);
}

async function persistChanges(ctx: BuildCtx) {
  const changes: CodeChange[] = [];
  for (const [path, next] of ctx.shadow.entries()) {
    const baseline = ctx.baseline.has(path)
      ? (ctx.baseline.get(path) ?? null)
      : await readProjectFile(ctx.rootPath, path);
    ctx.baseline.set(path, baseline);
    if (baseline === null && next === null) continue;
    if (baseline !== null && next !== null && baseline === next) continue;
    let kind: CodeChange["kind"];
    if (baseline === null) kind = "add";
    else if (next === null) kind = "delete";
    else kind = "modify";
    changes.push({ path, kind, oldContent: baseline, newContent: next });
  }
  await db
    .update(schema.codeRuns)
    .set({ changes })
    .where(eq(schema.codeRuns.id, ctx.runId));
}

const readFile: BuildToolHandler = async (args, ctx) => {
  const relPath = String(args.path ?? "");
  if (!relPath) return { text: "read_file: missing path" };
  try {
    safeJoin(ctx.rootPath, relPath);
  } catch (err) {
    return { text: `read_file: ${(err as Error).message}` };
  }
  const content = await loadFromShadowOrDisk(ctx, relPath);
  if (content === null) {
    return { text: `read_file: ${relPath} does not exist (or has been deleted in this run).` };
  }
  if (content.length > MAX_FILE_BYTES) {
    return {
      text: `--- ${relPath} (truncated to ${MAX_FILE_BYTES} bytes of ${content.length}) ---\n${content.slice(0, MAX_FILE_BYTES)}`,
    };
  }
  return { text: `--- ${relPath} ---\n${content}` };
};

const listDir: BuildToolHandler = async (args, ctx) => {
  const relPath = String(args.path ?? "");
  try {
    const entries = await listProjectDir(ctx.rootPath, relPath);
    const trimmed = entries.slice(0, MAX_LIST_ENTRIES);
    const lines = trimmed.map(
      (e) => `${e.kind === "dir" ? "d" : "f"} ${e.name}`,
    );
    if (entries.length > MAX_LIST_ENTRIES) {
      lines.push(`… ${entries.length - MAX_LIST_ENTRIES} more`);
    }
    return { text: lines.join("\n") || "(empty)" };
  } catch (err) {
    return { text: `list_dir: ${(err as Error).message}` };
  }
};

const writeFile: BuildToolHandler = async (args, ctx) => {
  const relPath = String(args.path ?? "");
  const content = String(args.content ?? "");
  if (!relPath) return { text: "write_file: missing path" };
  try {
    safeJoin(ctx.rootPath, relPath);
  } catch (err) {
    return { text: `write_file: ${(err as Error).message}` };
  }
  // Cache baseline before mutating.
  await loadFromShadowOrDisk(ctx, relPath);
  recordChange(ctx, relPath, content);
  await persistChanges(ctx);
  return {
    text: `Wrote ${relPath} (${content.length} bytes).`,
  };
};

const applyPatch: BuildToolHandler = async (args, ctx) => {
  const relPath = String(args.path ?? "");
  const search = String(args.search ?? "");
  const replace = String(args.replace ?? "");
  if (!relPath) return { text: "apply_patch: missing path" };
  if (!search) return { text: "apply_patch: missing search string" };
  try {
    safeJoin(ctx.rootPath, relPath);
  } catch (err) {
    return { text: `apply_patch: ${(err as Error).message}` };
  }
  const current = await loadFromShadowOrDisk(ctx, relPath);
  if (current === null) {
    return { text: `apply_patch: ${relPath} does not exist.` };
  }
  const idx = current.indexOf(search);
  if (idx === -1) {
    return {
      text: `apply_patch: search string not found in ${relPath}. The file's exact content matters; consider read_file first.`,
    };
  }
  const second = current.indexOf(search, idx + 1);
  if (second !== -1) {
    return {
      text: `apply_patch: search string is not unique in ${relPath} (found at offsets ${idx} and ${second}). Add more surrounding context.`,
    };
  }
  const next =
    current.slice(0, idx) + replace + current.slice(idx + search.length);
  recordChange(ctx, relPath, next);
  await persistChanges(ctx);
  const preview = next.length > MAX_PATCH_OUTPUT ? next.slice(0, MAX_PATCH_OUTPUT) + "\n…" : next;
  return {
    text: `Patched ${relPath}.\n--- new content ---\n${preview}`,
  };
};

const deleteFile: BuildToolHandler = async (args, ctx) => {
  const relPath = String(args.path ?? "");
  if (!relPath) return { text: "delete_file: missing path" };
  try {
    safeJoin(ctx.rootPath, relPath);
  } catch (err) {
    return { text: `delete_file: ${(err as Error).message}` };
  }
  const current = await loadFromShadowOrDisk(ctx, relPath);
  if (current === null) {
    return { text: `delete_file: ${relPath} does not exist (or already deleted).` };
  }
  recordChange(ctx, relPath, null);
  await persistChanges(ctx);
  return { text: `Marked ${relPath} for deletion.` };
};

const finalizeBuild: BuildToolHandler = async (args, ctx) => {
  const summary = String(args.summary ?? "").trim();
  const prTitle = String(args.pr_title ?? "").trim();
  const prBody = String(args.pr_body ?? "").trim();
  if (!summary || !prTitle || !prBody) {
    return {
      text: "finalize_build: summary, pr_title, and pr_body are all required.",
    };
  }
  ctx.finalize = { summary, prTitle, prBody };
  return {
    text: `Finalized. Summary recorded; PR title: ${prTitle}. The user will now review the diff.`,
  };
};

/**
 * Reuse the existing search_codebase handler. Its ToolContext shape
 * (projectId, threadId, agentMessageId) is partially applicable — we only
 * need projectId for the search.
 */
const searchCodebaseAdapter: BuildToolHandler = async (args, ctx) => {
  const r = await searchCodebase(args, {
    projectId: ctx.projectId,
    threadId: "",
    agentMessageId: "",
  });
  return { text: r.text };
};

const searchDocsAdapter: BuildToolHandler = async (args, ctx) => {
  const r = await searchDocs(args, {
    projectId: ctx.projectId,
    threadId: "",
    agentMessageId: "",
  });
  return { text: r.text };
};

export const BUILD_TOOL_DEFS: Anthropic.Messages.Tool[] = [
  {
    name: "read_file",
    description:
      "Read a file from the project working tree (relative path from project root). Reflects any edits this run has already made.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative path from project root, e.g. 'components/Foo.tsx'.",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "list_dir",
    description:
      "List entries in a directory under the project root. Returns lines like 'd <name>' or 'f <name>'. Use '' or '.' for the root.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string" },
      },
    },
  },
  {
    name: "write_file",
    description:
      "Create or overwrite a file in the shadow workspace. Use this only for creating new files or full rewrites; for targeted edits to existing files prefer apply_patch.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "apply_patch",
    description:
      "Replace exactly one occurrence of `search` with `replace` in the given file. The search string must be unique. Always read_file the target first.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        search: {
          type: "string",
          description: "Exact substring to replace. Must occur exactly once.",
        },
        replace: { type: "string" },
      },
      required: ["path", "search", "replace"],
    },
  },
  {
    name: "delete_file",
    description: "Mark a file for deletion in the shadow workspace.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  {
    name: "search_codebase",
    description:
      "Vector search over the indexed codebase. Returns matching code chunks with file paths and line numbers. Use BEFORE editing to confirm the right files.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "integer" },
      },
      required: ["query"],
    },
  },
  {
    name: "search_docs",
    description:
      "Vector search over indexed product/engineering docs (markdown). Use for product context.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "integer" },
      },
      required: ["query"],
    },
  },
  {
    name: "finalize_build",
    description:
      "Call this exactly once when the implementation is complete. Provides the human-readable summary plus the PR title and body that will be used when the user approves and the branch is pushed.",
    input_schema: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description:
            "1–3 sentence summary of what changed and why. Shown to the user above the diff.",
        },
        pr_title: {
          type: "string",
          description:
            "Conventional-style PR title, e.g. 'feat(auth): add 2FA recovery codes'.",
        },
        pr_body: {
          type: "string",
          description:
            "Markdown PR body. Include rationale, key changes, and any follow-ups.",
        },
      },
      required: ["summary", "pr_title", "pr_body"],
    },
  },
];

export const BUILD_TOOL_HANDLERS: Record<string, BuildToolHandler> = {
  read_file: readFile,
  list_dir: listDir,
  write_file: writeFile,
  apply_patch: applyPatch,
  delete_file: deleteFile,
  search_codebase: searchCodebaseAdapter,
  search_docs: searchDocsAdapter,
  finalize_build: finalizeBuild,
};

export async function runBuildTool(
  name: string,
  args: Record<string, unknown>,
  ctx: BuildCtx,
): Promise<BuildToolResult> {
  const handler = BUILD_TOOL_HANDLERS[name];
  if (!handler) return { text: `Unknown tool: ${name}` };
  try {
    return await handler(args, ctx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { text: `Tool ${name} failed: ${msg}` };
  }
}
