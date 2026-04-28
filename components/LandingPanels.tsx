"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

type DiscoveryKind = "feedback" | "idea" | "bug";

type FeatureSummary = {
  id: string;
  title: string;
  slug: string;
  status: string;
  framedProblem: string | null;
  statusHeadline: string | null;
  statusTone: "ok" | "warn" | "err" | null;
  updatedAt: string;
  lastSummaryAt: string | null;
};

type DiscussionSummary = {
  id: string;
  title: string;
  state: "open" | "dropped";
  converged: boolean;
  reason: string | null;
  updatedAt: string;
};

const KINDS: {
  id: DiscoveryKind;
  label: string;
  hint: string;
  placeholder: string;
  prefix: string;
  authorPersona: "pm" | "engineer" | "user";
  authorLabel: string;
}[] = [
  {
    id: "feedback",
    label: "User feedback",
    hint: "Paste a complaint, ticket, or quote — Socratic will ask who, what workflow, what they expected.",
    placeholder:
      "Paste the customer message verbatim. Include who said it and what they were trying to do, if you have it.",
    prefix: "Feedback",
    authorPersona: "user",
    authorLabel: "Forwarded feedback",
  },
  {
    id: "idea",
    label: "Feature idea",
    hint: "Pitch the half-formed idea. Socratic will pressure-test the underlying problem before you build.",
    placeholder:
      "Describe the idea in your own words. Don't worry about polish — Socratic will push back until the problem is sharp.",
    prefix: "Idea",
    authorPersona: "pm",
    authorLabel: "Sam (PM)",
  },
  {
    id: "bug",
    label: "Bug report",
    hint: "Describe the unexpected behavior. Socratic will ask for repro, scope, and the workflow it breaks.",
    placeholder:
      "What did you (or a user) try to do? What happened? What did you expect? Any error messages or steps to reproduce?",
    prefix: "Bug",
    authorPersona: "engineer",
    authorLabel: "Daniel (Eng)",
  },
];

export function LandingPanels({
  projectSlug,
  projectName,
  features,
  discussions,
}: {
  projectSlug: string;
  projectName: string;
  features: FeatureSummary[];
  discussions: DiscussionSummary[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState<DiscoveryKind>("feedback");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = KINDS.find((k) => k.id === kind)!;

  async function start() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      const titleSeed = body.split(/\s+/).slice(0, 8).join(" ");
      const title = `${active.prefix} · ${titleSeed}${
        body.split(/\s+/).length > 8 ? "…" : ""
      }`;
      const create = await fetch("/api/discussions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectSlug, title }),
      });
      if (!create.ok) {
        setError("Failed to create discovery.");
        return;
      }
      const { id } = await create.json();

      const post = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadKind: "discussion",
          containerId: id,
          persona: active.authorPersona,
          authorLabel: active.authorLabel,
          body,
        }),
      });
      if (!post.ok) {
        setError("Created discovery but failed to post first message.");
        router.push(`/projects/${projectSlug}/d/${id}`);
        return;
      }
      router.push(`/projects/${projectSlug}/d/${id}?autostart=1`);
    } finally {
      setBusy(false);
    }
  }

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="max-w-6xl mx-auto px-8 pt-12 pb-16 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-x-12 gap-y-10">
      <div className="min-w-0 max-w-2xl">
        <header className="mb-6">
          <div className="text-[11px] text-[var(--muted)] font-medium mb-1">
            {projectName}
          </div>
          <h1 className="text-[26px] font-semibold tracking-tight leading-tight">
            What&apos;s nagging you?
          </h1>
          <p className="text-[14px] text-[var(--muted)] mt-2 leading-relaxed">
            Drop in a complaint, an idea, or a bug. The Socratic agent will
            pressure-test it. Half-baked work never reaches engineering.
          </p>
        </header>

        <div className="flex items-center gap-1 border-b border-[var(--border)] mb-4">
          {KINDS.map((k) => {
            const a = k.id === kind;
            return (
              <button
                key={k.id}
                onClick={() => setKind(k.id)}
                className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
                  a
                    ? "border-[var(--foreground)] text-[var(--foreground)]"
                    : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {k.label}
              </button>
            );
          })}
        </div>

        <p className="text-[13px] text-[var(--muted)] mb-3 leading-relaxed">
          {active.hint}
        </p>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              start();
            }
          }}
          rows={8}
          placeholder={active.placeholder}
          className="w-full bg-[var(--surface)] border border-[var(--border-strong)] rounded-lg px-4 py-3 text-[14px] leading-relaxed focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] placeholder:text-[var(--muted-2)] resize-none"
        />

        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={start}
            disabled={busy || !text.trim()}
            className="px-4 py-2 text-[13px] font-semibold rounded-md transition-colors disabled:opacity-40 shadow-sm"
            style={{
              background: "var(--accent)",
              color: "var(--accent-fg)",
            }}
          >
            {busy ? "Starting…" : "Start discovery →"}
          </button>
          <span className="font-mono text-[11px] text-[var(--muted)]">
            ⌘↵
          </span>
          <span className="text-[12px] text-[var(--muted)] ml-auto">
            {wordCount} {wordCount === 1 ? "word" : "words"}
          </span>
        </div>
        {error && (
          <div className="mt-2 text-[12px] text-[var(--err)]">{error}</div>
        )}
      </div>

      <aside className="min-w-0 lg:border-l lg:border-[var(--border)] lg:pl-8 -ml-4 lg:ml-0">
        <header className="mb-6">
          <h2 className="text-[16px] font-semibold tracking-tight leading-tight">
            Pick up where you left off
          </h2>
          <p className="text-[12.5px] text-[var(--muted)] mt-1.5 leading-snug">
            Open feature threads and live discoveries.
          </p>
        </header>
        <RecentThreads
          features={features}
          discussions={discussions}
          projectSlug={projectSlug}
        />
      </aside>
    </div>
  );
}

function RecentThreads({
  features,
  discussions,
  projectSlug,
}: {
  features: FeatureSummary[];
  discussions: DiscussionSummary[];
  projectSlug: string;
}) {
  const hasNothing = features.length === 0 && discussions.length === 0;

  if (hasNothing) {
    return (
      <div className="text-[13px] text-[var(--muted)]">
        No threads yet. Start one on the left.
      </div>
    );
  }

  return (
    <div>
      {features.length > 0 && (
        <section className="mb-6">
          <SectionLabel>
            Features
            <SectionCount>{features.length}</SectionCount>
          </SectionLabel>
          <ul className="space-y-px">
            {features.map((f) => (
              <li key={f.id}>
                <Link
                  href={`/projects/${projectSlug}/f/${f.id}`}
                  className="group flex items-start gap-2.5 px-3 py-2.5 -mx-3 rounded-md hover:bg-[var(--surface)] transition-colors"
                >
                  <FeatureDot status={f.status} tone={f.statusTone} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-semibold leading-snug">
                      {f.title}
                    </div>
                    {f.statusHeadline && (
                      <div className="text-[12px] text-[var(--muted)] leading-snug mt-0.5 line-clamp-2">
                        {f.statusHeadline}
                      </div>
                    )}
                    <div className="text-[10.5px] text-[var(--muted-2)] mt-1 font-mono truncate">
                      {f.slug} · {humanTime(f.updatedAt)}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {discussions.length > 0 && (
        <section>
          <SectionLabel>
            Discoveries
            <SectionCount>{discussions.length}</SectionCount>
          </SectionLabel>
          <ul className="space-y-px">
            {discussions.slice(0, 10).map((d) => (
              <li key={d.id}>
                <Link
                  href={`/projects/${projectSlug}/d/${d.id}`}
                  className="group flex items-start gap-2.5 px-3 py-2 -mx-3 rounded-md hover:bg-[var(--surface)] transition-colors"
                >
                  <span className="text-[var(--muted-2)] shrink-0 mt-[2px]">◇</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] text-[var(--foreground)]/85 leading-snug line-clamp-2">
                      {d.title}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {d.converged && (
                        <span
                          className="text-[9.5px] font-semibold uppercase tracking-wide px-1 py-px rounded"
                          style={{
                            color: "var(--ok)",
                            background:
                              "color-mix(in srgb,var(--ok) 12%,transparent)",
                          }}
                        >
                          ready
                        </span>
                      )}
                      <span className="text-[10.5px] text-[var(--muted-2)]">
                        {humanTime(d.updatedAt)}
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between mb-2 px-1">
      <h2 className="text-[10.5px] uppercase tracking-[0.08em] text-[var(--muted)] font-semibold">
        {children}
      </h2>
    </div>
  );
}

function SectionCount({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-1.5 text-[var(--muted-2)] tabular-nums normal-case tracking-normal font-medium">
      {children}
    </span>
  );
}

function FeatureDot({
  status,
  tone,
}: {
  status: string;
  tone: "ok" | "warn" | "err" | null;
}) {
  const color = tone
    ? { ok: "var(--ok)", warn: "var(--warn)", err: "var(--err)" }[tone]
    : STATUS_COLOR[status] ?? "var(--muted)";
  return (
    <span
      className="w-1.5 h-1.5 rounded-full shrink-0 mt-[7px]"
      style={{ background: color }}
      title={status}
    />
  );
}

const STATUS_COLOR: Record<string, string> = {
  scoping: "var(--muted)",
  in_progress: "var(--accent)",
  blocked: "var(--err)",
  in_review: "var(--warn)",
  shipped: "var(--ok)",
};

function humanTime(iso: string) {
  const t = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - t);
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d`;
  return new Date(iso).toLocaleDateString();
}
