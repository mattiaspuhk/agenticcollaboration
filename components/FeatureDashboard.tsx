"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { RoleSwitcher } from "./RoleSwitcher";
import { Message, type MessageView } from "./Message";
import { FeatureComposer } from "./FeatureComposer";
import type {
  ChatTilePayload,
  FeatureCardTilePayload,
  FeedbackTilePayload,
  Role,
  StatusTilePayload,
} from "@/lib/tiles";
import { TILE_MATRIX } from "@/lib/tiles";
import type {
  DiscoveryDigest,
  FeatureBlocker,
  LinkedPr,
} from "@/db/schema";

type Tile = { payload: unknown; generatedAt: string };
type FeaturePayload = {
  feature: {
    id: string;
    projectId: string;
    slug: string;
    title: string;
    description: string;
    status: string;
    statusNote: string;
    branchName: string | null;
    githubRepo: string | null;
    blockers: FeatureBlocker[];
    linkedPrIds: LinkedPr[];
    sourceDiscussionId: string | null;
    discoveryDigest: DiscoveryDigest | null;
    lastAgentSummaryAt: string | null;
    lastGithubPollAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  role: Role;
  tiles: Record<string, Tile>;
  decisions: {
    id: string;
    body: string;
    resolvedAt: string | null;
    createdAt: string;
  }[];
  messages: MessageView[];
};

const TILE_REFRESH_MS = 30_000;
const POLL_REFRESH_MS = 60_000;

export function FeatureDashboard({
  featureId,
  role,
}: {
  featureId: string;
  role: Role;
}) {
  const [data, setData] = useState<FeaturePayload | null>(null);
  const [agentBuffer, setAgentBuffer] = useState<MessageView | null>(null);
  const [polling, setPolling] = useState(false);
  const tilesTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/features/${featureId}?role=${role}`);
    if (res.ok) setData(await res.json());
  }, [featureId, role]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (tilesTimer.current) clearInterval(tilesTimer.current);
    tilesTimer.current = setInterval(refresh, TILE_REFRESH_MS);
    return () => {
      if (tilesTimer.current) clearInterval(tilesTimer.current);
    };
  }, [refresh]);

  useEffect(() => {
    if (!data?.feature.githubRepo) return;
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = setInterval(async () => {
      await fetch(`/api/features/${featureId}/poll`, { method: "POST" });
      refresh();
    }, POLL_REFRESH_MS);
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [data?.feature.githubRepo, featureId, refresh]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [data, agentBuffer]);

  const runAgent = useCallback(() => {
    setAgentBuffer({
      id: "pending",
      authorKind: "agent",
      authorPersona: "agent",
      authorLabel: "Agent",
      bodyMd: "",
      blocks: [],
      createdAt: new Date().toISOString(),
      pending: true,
    });
    const es = new EventSource(
      `/api/agent/feature-chat?featureId=${featureId}`,
    );
    es.addEventListener("token", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      setAgentBuffer((prev) =>
        prev
          ? { ...prev, bodyMd: prev.bodyMd + data.text, pending: true }
          : prev,
      );
    });
    es.addEventListener("done", () => {
      es.close();
      setAgentBuffer(null);
      refresh();
      setTimeout(refresh, 7000);
    });
    es.addEventListener("error", () => {
      es.close();
      setAgentBuffer(null);
      refresh();
    });
  }, [featureId, refresh]);

  const onSent = useCallback(async () => {
    await refresh();
    runAgent();
  }, [refresh, runAgent]);

  const triggerPoll = useCallback(async () => {
    setPolling(true);
    try {
      await fetch(`/api/features/${featureId}/poll`, {
        method: "POST",
      });
      await refresh();
    } finally {
      setPolling(false);
    }
  }, [featureId, refresh]);

  const triggerSummarize = useCallback(async () => {
    await fetch(`/api/features/${featureId}/summarize`, { method: "POST" });
    await refresh();
  }, [featureId, refresh]);

  const userMessages = useMemo(
    () =>
      (data?.messages ?? []).filter((m) => m.authorPersona === "user"),
    [data],
  );

  if (!data) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-[var(--muted)]">
        Loading feature…
      </div>
    );
  }

  const f = data.feature;
  const tiles = data.tiles;

  const visibleMessages = filterMessagesForRole(data.messages, role);

  return (
    <section className="flex-1 flex min-w-0 bg-[var(--background)] overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0 border-r border-[var(--border)]">
        <header className="flex items-center gap-3 px-5 py-2.5 border-b border-[var(--border)] bg-[var(--surface)]">
          <span
            className="text-[10px] uppercase tracking-[0.08em] font-semibold px-1.5 py-px rounded border"
            style={{
              color: "var(--accent)",
              borderColor:
                "color-mix(in srgb,var(--accent) 40%,transparent)",
              background:
                "color-mix(in srgb,var(--accent) 10%,transparent)",
            }}
          >
            Feature
          </span>
          <div className="text-[14px] font-semibold truncate">{f.title}</div>
          <code className="text-[11px] font-mono text-[var(--muted)] bg-[var(--surface-2)] border border-[var(--border)] rounded px-1.5 py-px truncate">
            {f.slug}
          </code>
          {agentBuffer && (
            <span className="ml-2 inline-flex items-center gap-1 text-[var(--agent)] text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--agent)]" />
              agent thinking
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={triggerSummarize}
              className="text-[11px] text-[var(--muted)] hover:text-[var(--foreground)] px-2 py-1 rounded hover:bg-[var(--surface-2)]"
              title="Re-run tile summarizer"
            >
              ↻ tiles
            </button>
            <button
              onClick={triggerPoll}
              disabled={polling || !f.githubRepo}
              className="text-[11px] text-[var(--muted)] hover:text-[var(--foreground)] px-2 py-1 rounded hover:bg-[var(--surface-2)] disabled:opacity-40"
              title="Poll GitHub for PRs and commits"
            >
              {polling ? "polling…" : "↻ github"}
            </button>
            <RoleSwitcher role={role} />
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto py-3">
          {visibleMessages.length === 0 && !agentBuffer && (
            <div className="px-6 py-8 text-[12.5px] text-[var(--muted)] leading-relaxed max-w-xl mx-auto">
              <p className="mb-2 font-medium text-[var(--foreground)]">
                {role === "user"
                  ? "Welcome — this is your live feature thread."
                  : "Feature thread is open."}
              </p>
              <p>
                {role === "user"
                  ? "Drop feedback below as it comes up. The team will see it here, and the agent will translate it for engineering."
                  : "The agent has read the discovery digest and will respond as a peer. Pick a persona below and start the thread."}
              </p>
            </div>
          )}
          {visibleMessages.map((m) => (
            <Message key={m.id} message={m} />
          ))}
          {agentBuffer && <Message message={agentBuffer} />}
        </div>

        <FeatureComposer
          featureId={featureId}
          role={role}
          onSent={onSent}
          large
        />
      </div>

      <aside className="w-[360px] shrink-0 flex flex-col bg-[var(--surface-2)]/40 overflow-hidden">
        <header className="flex items-center justify-between px-5 py-2.5 border-b border-[var(--border)] bg-[var(--surface)]">
          <div className="text-[12px] text-[var(--muted)]">
            Showing as{" "}
            <span className="text-[var(--foreground)] font-medium">
              {roleLabel(role)}
            </span>
          </div>
          <div className="text-[10.5px] text-[var(--muted-2)]">
            refreshes 30s
          </div>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <TieredRail
            feature={f}
            tiles={tiles}
            decisions={data.decisions}
            userMessages={userMessages}
            role={role}
          />
        </div>
      </aside>
    </section>
  );
}

function filterMessagesForRole(
  messages: MessageView[],
  role: Role,
): MessageView[] {
  if (role !== "user") return messages;
  return messages.filter((m) => {
    if (m.authorKind === "user") {
      return m.authorPersona === "user" || m.authorPersona === "pm";
    }
    if (m.authorKind === "agent") return true;
    if (m.authorKind === "system") return true;
    return true;
  });
}

function roleLabel(r: Role): string {
  if (r === "pm") return "PM";
  if (r === "eng") return "Engineer";
  return "End user";
}

function TieredRail({
  feature,
  tiles,
  decisions,
  userMessages,
  role,
}: {
  feature: FeaturePayload["feature"];
  tiles: Record<string, Tile>;
  decisions: FeaturePayload["decisions"];
  userMessages: MessageView[];
  role: Role;
}) {
  const digest = feature.discoveryDigest;
  const status =
    (tiles.StatusTile?.payload as StatusTilePayload | undefined) ?? null;
  const feedback =
    (tiles.FeedbackTile?.payload as FeedbackTilePayload | undefined) ?? null;
  const chat =
    (tiles.ChatTile?.payload as ChatTilePayload | undefined) ?? null;
  const featureCard =
    (tiles.FeatureCardTile?.payload as FeatureCardTilePayload | undefined) ??
    null;

  const blockers = feature.blockers;
  const prs = feature.linkedPrIds;
  const openPrs = prs.filter((p) => p.state === "open").length;
  const mergedPrs = prs.filter((p) => p.state === "merged").length;

  const showStatus = role !== "user";
  const showSmallStates = role !== "user";

  return (
    <div className="space-y-5">
      {/* TIER 1 — User-facing: feature card hero. Otherwise: digest hero. */}
      {role === "user" ? (
        <UserFeatureHero
          payload={featureCard}
          fallbackTitle={feature.title}
          digest={digest}
        />
      ) : (
        <DigestHero digest={digest} />
      )}

      {/* TIER 1.5 + TIER 2 — current state strip: status + pills together */}
      {(showStatus || showSmallStates) && (
        <div className="space-y-3 py-1">
          {showStatus && (
            <StatusStrip
              payload={status}
              status={feature.status}
              statusNote={feature.statusNote}
            />
          )}
          {showSmallStates && (
            <SmallStatesStrip
              blockers={blockers.length}
              decisions={decisions.length}
              openPrs={openPrs}
              mergedPrs={mergedPrs}
              hasRepo={!!feature.githubRepo}
            />
          )}
        </div>
      )}

      {/* TIER 2-expanded — show details only if a small-state has content */}
      {showSmallStates && blockers.length > 0 && (
        <ContentCard title="Blockers" accent="var(--err)" count={blockers.length}>
          <ul className="space-y-1.5">
            {blockers.map((b) => (
              <li
                key={b.id}
                className="text-[13px] border-l-2 pl-2.5 leading-snug"
                style={{ borderColor: "var(--err)" }}
              >
                {b.body}
              </li>
            ))}
          </ul>
        </ContentCard>
      )}

      {showSmallStates && decisions.length > 0 && (
        <ContentCard title="Decisions" count={decisions.length}>
          <ul className="space-y-2">
            {decisions.slice(0, 6).map((d) => (
              <li key={d.id} className="text-[13px] flex items-start gap-2">
                <span
                  className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                  style={{
                    background: d.resolvedAt ? "var(--ok)" : "var(--warn)",
                  }}
                />
                <span className="leading-snug">
                  {d.body}
                  {d.resolvedAt && (
                    <span className="text-[11px] text-[var(--muted)] ml-1.5">
                      resolved
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </ContentCard>
      )}

      {showSmallStates && prs.length > 0 && (
        <ContentCard
          title="Linked PRs"
          accent="var(--eng)"
          count={prs.length}
        >
          <ul className="space-y-1.5">
            {prs.map((pr) => (
              <li key={pr.number} className="flex items-center gap-2 text-[13px]">
                <span
                  className="text-[10px] font-semibold uppercase px-1.5 py-px rounded"
                  style={prStyle(pr.state)}
                >
                  {pr.state}
                </span>
                <a
                  href={pr.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--accent)] hover:underline truncate flex-1"
                >
                  #{pr.number} {pr.title}
                </a>
              </li>
            ))}
          </ul>
        </ContentCard>
      )}

      {/* TIER 3 — rolling content (only when populated) */}
      <FeedbackSection
        payload={feedback}
        userMessages={userMessages}
        role={role}
      />

      <ChatSummarySection payload={chat} role={role} />

      <RailFooter
        lastSummaryAt={feature.lastAgentSummaryAt}
        lastPollAt={feature.lastGithubPollAt}
      />
    </div>
  );
}

function DigestHero({
  digest,
}: {
  digest: FeaturePayload["feature"]["discoveryDigest"];
}) {
  if (!digest) {
    return (
      <section
        className="rounded-lg p-4 border-l-[3px]"
        style={{
          background: "color-mix(in srgb,var(--agent) 5%,var(--surface))",
          borderLeftColor: "color-mix(in srgb,var(--agent) 60%,transparent)",
          borderTop: "1px solid var(--border)",
          borderRight: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <RailEyebrow agent>Discovery digest</RailEyebrow>
        <p className="text-[13px] text-[var(--muted)] italic mt-2">
          This feature was created without graduating from a discovery thread.
        </p>
      </section>
    );
  }
  return (
    <section
      className="rounded-lg p-4 border-l-[3px]"
      style={{
        background: "color-mix(in srgb,var(--agent) 5%,var(--surface))",
        borderLeftColor: "color-mix(in srgb,var(--agent) 60%,transparent)",
        borderTop: "1px solid var(--border)",
        borderRight: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <RailEyebrow agent>Why we&apos;re building this</RailEyebrow>
      <p className="text-[14.5px] font-semibold leading-snug mt-2 text-[var(--foreground)]">
        {digest.framedProblem}
      </p>
      {digest.keyContext.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {digest.keyContext.slice(0, 4).map((ctx, i) => (
            <li
              key={i}
              className="text-[12.5px] leading-snug text-[var(--foreground)]/85 flex gap-2"
            >
              <span className="text-[var(--muted-2)] shrink-0">·</span>
              <span>{ctx}</span>
            </li>
          ))}
        </ul>
      )}
      {digest.sourceQuotes.length > 0 && (
        <details className="mt-3 group">
          <summary className="cursor-pointer text-[11.5px] text-[var(--muted)] hover:text-[var(--foreground)] select-none flex items-center gap-1.5">
            <span className="text-[10px] transition-transform group-open:rotate-90">
              ▸
            </span>
            <span>
              {digest.sourceQuotes.length} source{" "}
              {digest.sourceQuotes.length === 1 ? "quote" : "quotes"}
            </span>
          </summary>
          <div className="mt-2 space-y-2">
            {digest.sourceQuotes.map((q, i) => (
              <blockquote
                key={i}
                className="text-[12px] italic leading-snug text-[var(--foreground)]/70 border-l-2 pl-3 border-[var(--border-strong)]"
              >
                &ldquo;{q}&rdquo;
              </blockquote>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function UserFeatureHero({
  payload,
  fallbackTitle,
  digest,
}: {
  payload: FeatureCardTilePayload | null;
  fallbackTitle: string;
  digest: FeaturePayload["feature"]["discoveryDigest"];
}) {
  return (
    <section>
      <RailEyebrow>What we&apos;re building for you</RailEyebrow>
      <p className="text-[15px] font-semibold leading-snug mt-2">
        {payload?.headline ?? `We're building: ${fallbackTitle}`}
      </p>
      {payload?.currentlyDoing && (
        <div className="mt-3">
          <div className="text-[11px] text-[var(--muted)] font-medium mb-0.5">
            Right now
          </div>
          <p className="text-[13px] leading-snug">{payload.currentlyDoing}</p>
        </div>
      )}
      {payload?.whatsNext && (
        <div className="mt-3">
          <div className="text-[11px] text-[var(--muted)] font-medium mb-0.5">
            What&apos;s next
          </div>
          <p className="text-[13px] leading-snug">{payload.whatsNext}</p>
        </div>
      )}
      {payload?.tryIt && (
        <div className="mt-3 pt-3 border-t border-[var(--border)]">
          <div className="text-[11px] text-[var(--muted)] font-medium mb-0.5">
            Try it
          </div>
          <p className="text-[13px] leading-snug text-[var(--accent)]">
            {payload.tryIt}
          </p>
        </div>
      )}
      {!payload && digest?.framedProblem && (
        <p className="text-[12.5px] text-[var(--muted)] mt-3 leading-snug">
          {digest.framedProblem}
        </p>
      )}
    </section>
  );
}

function StatusStrip({
  payload,
  status,
  statusNote,
}: {
  payload: StatusTilePayload | null;
  status: string;
  statusNote: string;
}) {
  const headline =
    payload?.headline ??
    (statusNote
      ? `${prettyStatus(status)} — ${statusNote}`
      : prettyStatus(status));
  const tone = payload?.tone ?? toneForStatus(status);
  const color = TONE_COLOR[tone];

  return (
    <div className="flex items-start gap-2.5 px-1">
      <span
        className="w-2 h-2 rounded-full mt-[7px] shrink-0"
        style={{ background: color }}
      />
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted)] font-medium mb-0.5">
          Status · {tone}
        </div>
        <div className="text-[13px] font-medium leading-snug">{headline}</div>
        {payload?.lastUpdate && (
          <div className="text-[11.5px] text-[var(--muted)] mt-1 leading-snug">
            {payload.lastUpdate}
          </div>
        )}
      </div>
    </div>
  );
}

function SmallStatesStrip({
  blockers,
  decisions,
  openPrs,
  mergedPrs,
  hasRepo,
}: {
  blockers: number;
  decisions: number;
  openPrs: number;
  mergedPrs: number;
  hasRepo: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-[11.5px] px-1">
      <Pill color={blockers > 0 ? "var(--err)" : "var(--muted-2)"}>
        {blockers === 0 ? "0 blockers" : `${blockers} blocker${blockers === 1 ? "" : "s"}`}
      </Pill>
      <Pill color={decisions > 0 ? "var(--ok)" : "var(--muted-2)"}>
        {decisions === 0
          ? "0 decisions"
          : `${decisions} decision${decisions === 1 ? "" : "s"}`}
      </Pill>
      <Pill color={hasRepo ? "var(--eng)" : "var(--muted-2)"}>
        {!hasRepo
          ? "no repo"
          : openPrs + mergedPrs === 0
            ? "0 PRs"
            : `${openPrs} open · ${mergedPrs} merged`}
      </Pill>
    </div>
  );
}

function Pill({
  color,
  children,
}: {
  color: string;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[var(--muted)]">
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: color }}
      />
      {children}
    </span>
  );
}

function ContentCard({
  title,
  accent,
  count,
  children,
}: {
  title: string;
  accent?: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <header className="px-4 py-2 border-b border-[var(--border)] flex items-center gap-2">
        <h3 className="text-[12px] font-semibold text-[var(--foreground)]">
          {title}
        </h3>
        {count !== undefined && (
          <span
            className="text-[11px] font-medium text-[var(--muted)] tabular-nums"
            style={accent ? { color: accent } : undefined}
          >
            {count}
          </span>
        )}
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

function FeedbackSection({
  payload,
  userMessages,
  role,
}: {
  payload: FeedbackTilePayload | null;
  userMessages: MessageView[];
  role: Role;
}) {
  const hasContent =
    !!payload?.summary || userMessages.length > 0 || (payload?.themes?.length ?? 0) > 0;
  if (!hasContent) return null;

  const title = role === "user" ? "Your input" : "User feedback";
  const summary = payload?.summary;

  return (
    <ContentCard title={title}>
      {summary && (
        <p className="text-[13px] leading-snug whitespace-pre-wrap">
          {summary}
        </p>
      )}
      {payload?.themes && payload.themes.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {payload.themes.map((t, i) => (
            <span
              key={i}
              className="text-[10.5px] text-[var(--design)] rounded-full px-2 py-px"
              style={{
                background: "color-mix(in srgb,var(--design) 10%,transparent)",
              }}
            >
              {t}
            </span>
          ))}
        </div>
      )}
      {role !== "user" && userMessages.length > 0 && (
        <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
          {userMessages.slice(-4).map((m) => (
            <div
              key={m.id}
              className="text-[12px] border-l-2 border-[var(--border-strong)] pl-2.5 italic text-[var(--foreground)]/85"
            >
              <div className="text-[10.5px] text-[var(--muted)] mb-0.5 not-italic font-medium">
                {m.authorLabel}
              </div>
              {m.bodyMd}
            </div>
          ))}
        </div>
      )}
    </ContentCard>
  );
}

function ChatSummarySection({
  payload,
  role,
}: {
  payload: ChatTilePayload | null;
  role: Role;
}) {
  if (!payload) return null;
  const visualForRole = TILE_MATRIX.ChatTile[role];
  if (visualForRole === "hidden") return null;

  return (
    <ContentCard title="Chat summary">
      <p className="text-[13px] leading-snug whitespace-pre-wrap">
        {payload.summary}
      </p>
      {payload.openQuestions && payload.openQuestions.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] font-medium text-[var(--muted)] mb-1">
            Open questions
          </div>
          <ul className="list-disc pl-4 space-y-0.5">
            {payload.openQuestions.map((q, i) => (
              <li key={i} className="text-[12.5px] leading-snug">
                {q}
              </li>
            ))}
          </ul>
        </div>
      )}
    </ContentCard>
  );
}

function RailEyebrow({
  children,
  agent,
}: {
  children: React.ReactNode;
  agent?: boolean;
}) {
  if (agent) {
    return (
      <div className="inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.06em] font-semibold">
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: "var(--agent)" }}
        />
        <span style={{ color: "var(--agent)" }}>Agent · {children}</span>
      </div>
    );
  }
  return (
    <div className="text-[11px] font-medium text-[var(--muted)]">{children}</div>
  );
}

function RailFooter({
  lastSummaryAt,
  lastPollAt,
}: {
  lastSummaryAt: string | null;
  lastPollAt: string | null;
}) {
  return (
    <div className="text-[10.5px] text-[var(--muted-2)] pt-2 border-t border-[var(--border)]">
      {lastSummaryAt
        ? `Summary ${new Date(lastSummaryAt).toLocaleTimeString()}`
        : "No summary yet"}
      {" · "}
      {lastPollAt
        ? `polled ${new Date(lastPollAt).toLocaleTimeString()}`
        : "no poll"}
    </div>
  );
}

const TONE_COLOR: Record<"ok" | "warn" | "err", string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  err: "var(--err)",
};

function prettyStatus(s: string) {
  return s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function toneForStatus(s: string): "ok" | "warn" | "err" {
  if (s === "blocked") return "err";
  if (s === "in_review" || s === "scoping") return "warn";
  return "ok";
}

function prStyle(state: "open" | "merged" | "closed") {
  if (state === "merged") {
    return {
      color: "var(--agent)",
      background: "color-mix(in srgb,var(--agent) 12%,transparent)",
    };
  }
  if (state === "open") {
    return {
      color: "var(--ok)",
      background: "color-mix(in srgb,var(--ok) 12%,transparent)",
    };
  }
  return {
    color: "var(--muted)",
    background: "var(--surface-2)",
  };
}
