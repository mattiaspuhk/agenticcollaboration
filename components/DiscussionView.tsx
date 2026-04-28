"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Message, type MessageView } from "./Message";
import { GraduateBanner } from "./GraduateBanner";
import { FramingCriteriaTile } from "./FramingCriteriaTile";
import type { FramingState } from "@/db/schema";
import { POSTABLE_PERSONAS, PERSONAS, type PersonaId } from "@/lib/personas";
import { PersonaBadge } from "./PersonaBadge";

export type DiscussionPayload = {
  discussion: {
    id: string;
    projectId: string;
    title: string;
    state: "open" | "graduated" | "dropped";
    framingState: FramingState;
    graduatedToFeatureId: string | null;
  };
  messages: MessageView[];
};

export function DiscussionView({
  discussionId,
  projectSlug,
  initialData,
}: {
  discussionId: string;
  projectSlug: string;
  initialData?: DiscussionPayload;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<DiscussionPayload | null>(initialData ?? null);
  const autoStartedRef = useRef(false);
  const [agentBuffer, setAgentBuffer] = useState<MessageView | null>(null);
  const [persona, setPersona] = useState<PersonaId>("pm");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [graduating, setGraduating] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/discussions/${discussionId}`);
    if (res.ok) setData(await res.json());
  }, [discussionId]);

  useEffect(() => {
    if (!initialData) refresh();
  }, [refresh, initialData]);

  useEffect(() => {
    if (autoStartedRef.current) return;
    if (!data) return;
    if (searchParams.get("autostart") !== "1") return;
    if (data.discussion.state !== "open") return;
    const hasAgentReply = data.messages.some((m) => m.authorKind === "agent");
    const hasUserMessage = data.messages.some((m) => m.authorKind === "user");
    if (hasUserMessage && !hasAgentReply) {
      autoStartedRef.current = true;
      runSocratic();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, searchParams]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [data, agentBuffer]);

  const runSocratic = useCallback(() => {
    setAgentBuffer({
      id: "pending",
      authorKind: "agent",
      authorPersona: "agent",
      authorLabel: "Socratic agent",
      bodyMd: "",
      blocks: [],
      createdAt: new Date().toISOString(),
      pending: true,
    });

    const es = new EventSource(
      `/api/agent/socratic?discussionId=${discussionId}`,
    );
    es.addEventListener("token", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      setAgentBuffer((prev) =>
        prev ? { ...prev, bodyMd: prev.bodyMd + data.text, pending: true } : prev,
      );
    });
    es.addEventListener("done", () => {
      setAgentBuffer(null);
      refresh();
    });
    es.addEventListener("framing", () => {
      refresh();
      es.close();
    });
    es.addEventListener("error", () => {
      es.close();
      setAgentBuffer(null);
      refresh();
    });
  }, [discussionId, refresh]);

  const send = useCallback(async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadKind: "discussion",
          containerId: discussionId,
          persona,
          body,
        }),
      });
      if (res.ok) {
        setText("");
        await refresh();
        runSocratic();
      }
    } finally {
      setBusy(false);
    }
  }, [text, busy, discussionId, persona, refresh, runSocratic]);

  const graduate = useCallback(async () => {
    if (graduating) return;
    setGraduating(true);
    try {
      const res = await fetch(`/api/discussions/${discussionId}/graduate`, {
        method: "POST",
      });
      if (res.ok) {
        const json = await res.json();
        router.push(`/projects/${projectSlug}/f/${json.slug}`);
      } else {
        setGraduating(false);
      }
    } catch {
      setGraduating(false);
    }
  }, [graduating, discussionId, projectSlug, router]);

  const drop = useCallback(async () => {
    const reason = window.prompt(
      "Why are you dropping this? (one line; helps later if it comes back up)",
      "",
    );
    if (reason === null) return;
    await fetch("/api/discussions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: discussionId,
        state: "dropped",
        droppedReason: reason || "no reason given",
      }),
    });
    await refresh();
  }, [discussionId, refresh]);

  if (!data) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-[var(--muted)]">
        Loading discussion…
      </div>
    );
  }

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const converged = data.discussion.framingState?.converged === true;
  const graduated = data.discussion.state === "graduated";
  const dropped = data.discussion.state === "dropped";

  return (
    <section className="flex-1 flex flex-col min-w-0 bg-[var(--background)]">
      <header className="flex items-center gap-3 px-[18px] py-[10px] border-b border-[var(--border)] bg-[var(--surface)]">
        <span
          className="text-[10px] uppercase tracking-[0.08em] font-semibold px-1.5 py-px rounded border"
          style={{
            color: "var(--agent)",
            borderColor: "color-mix(in srgb,var(--agent) 40%,transparent)",
            background: "color-mix(in srgb,var(--agent) 10%,transparent)",
          }}
        >
          Discovery
        </span>
        <div className="text-[14px] font-semibold flex items-center gap-2 min-w-0">
          <span className="truncate">{data.discussion.title}</span>
        </div>
        <div className="text-[12px] text-[var(--muted)] border-l border-[var(--border)] pl-3 ml-1">
          {data.messages.length} message
          {data.messages.length === 1 ? "" : "s"}
          {agentBuffer && (
            <span className="ml-2 inline-flex items-center gap-1 text-[var(--agent)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--agent)]" />
              agent thinking
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {!graduated && !dropped && (
            <button
              onClick={drop}
              className="text-[11px] text-[var(--muted)] hover:text-[var(--err)] px-2 py-1 rounded"
              title="Drop this discovery"
            >
              Drop
            </button>
          )}
        </div>
      </header>

      <GraduateBanner
        state={data.discussion.state}
        framing={data.discussion.framingState}
        graduating={graduating}
        onGraduate={graduate}
        graduatedFeatureSlug={
          graduated && data.discussion.graduatedToFeatureId ? "feature" : null
        }
        projectSlug={projectSlug}
        graduatedFeatureId={data.discussion.graduatedToFeatureId}
      />

      {!graduated && !dropped && (
        <FramingCriteriaTile framing={data.discussion.framingState} />
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto py-2">
        <div className="flex items-center gap-2.5 px-[18px] py-2 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)] font-semibold">
          <span className="flex-1 h-px bg-[var(--border)]" />
          {today}
          <span className="flex-1 h-px bg-[var(--border)]" />
        </div>
        {data.messages.length === 0 && (
          <div className="px-[18px] py-6 text-[13px] text-[var(--muted)] leading-relaxed">
            <p className="mb-2 font-medium text-[var(--foreground)]">
              This is a discovery thread.
            </p>
            <p>
              Drop in a piece of user feedback, a half-formed idea, or a
              complaint. The Socratic agent will push back until the framing is
              sharp — or refuse to graduate it.
            </p>
          </div>
        )}
        {data.messages.map((m) => (
          <Message key={m.id} message={m} />
        ))}
        {agentBuffer && <Message message={agentBuffer} />}
      </div>

      {!graduated && !dropped && (
        <div className="px-[18px] pt-3 pb-4 bg-gradient-to-b from-transparent to-[var(--background)]">
          <div className="border border-[var(--border-strong)] bg-[var(--surface)] rounded-lg shadow-sm">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)]">
              <span className="text-[11px] text-[var(--muted)]">Post as</span>
              <div className="flex gap-1">
                {POSTABLE_PERSONAS.map((id) => {
                  const active = id === persona;
                  return (
                    <button
                      key={id}
                      onClick={() => setPersona(id)}
                      className={`flex items-center gap-1.5 px-1.5 py-1 rounded text-[11px] transition-all ${
                        active
                          ? "bg-[var(--surface-2)] ring-1 ring-[var(--border-strong)]"
                          : "opacity-50 hover:opacity-100"
                      }`}
                    >
                      <PersonaBadge persona={id} size="sm" />
                      <span>{PERSONAS[id].label}</span>
                    </button>
                  );
                })}
              </div>
              <span className="ml-auto text-[11px] text-[var(--muted)]">
                {converged ? (
                  <span className="text-[var(--ok)] font-medium">
                    framing converged · graduate when ready
                  </span>
                ) : (
                  <span>keep pressure-testing</span>
                )}
              </span>
            </div>
            <div className="px-3 py-2.5 flex gap-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={2}
                placeholder={`Pressure-test your idea — paste feedback, name a workflow, or sketch the problem.`}
                className="flex-1 resize-none bg-transparent border-0 px-0 py-1 text-[13px] leading-relaxed focus:outline-none placeholder:text-[var(--muted)]"
              />
              <button
                onClick={send}
                disabled={busy || !text.trim()}
                className="self-end px-3 py-1.5 text-[12px] font-semibold rounded transition-colors disabled:opacity-40"
                style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
              >
                {busy ? "…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
