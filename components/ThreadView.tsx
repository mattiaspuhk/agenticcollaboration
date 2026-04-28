"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Message, type MessageView } from "./Message";
import { Composer } from "./Composer";
import { onEditDecision } from "./blocks/EditCard";
import { dispatchAgentEvent } from "./AgentContext";

type ThreadPayload = {
  thread: { id: string; title: string };
  messages: MessageView[];
};

export function ThreadView({ threadId }: { threadId: string }) {
  const [data, setData] = useState<ThreadPayload | null>(null);
  const [agentBuffer, setAgentBuffer] = useState<MessageView | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/threads/${threadId}`);
    if (res.ok) setData(await res.json());
  }, [threadId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // After an edit is decided, the GOLD B reflect agent may post a new message
  // a few seconds later. Re-poll the thread several times to pick it up.
  useEffect(() => {
    return onEditDecision(() => {
      const delays = [800, 2500, 5000, 9000, 14000];
      delays.forEach((d) => setTimeout(refresh, d));
    });
  }, [refresh]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [data, agentBuffer]);

  const onSent = useCallback(async () => {
    await refresh();
    runAgent();
  }, [refresh]);

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
    dispatchAgentEvent({ kind: "run_start" });

    const es = new EventSource(`/api/agent/run?threadId=${threadId}`);

    es.addEventListener("token", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      setAgentBuffer((prev) =>
        prev
          ? { ...prev, bodyMd: prev.bodyMd + data.text, pending: true }
          : prev,
      );
    });

    es.addEventListener("tool_call", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      dispatchAgentEvent({ kind: "tool_call", name: data.name });
      setAgentBuffer((prev) =>
        prev
          ? {
              ...prev,
              bodyMd:
                prev.bodyMd +
                (prev.bodyMd ? "\n" : "") +
                `· calling ${data.name}…`,
              pending: true,
            }
          : prev,
      );
    });

    es.addEventListener("done", () => {
      es.close();
      dispatchAgentEvent({ kind: "run_end" });
      setAgentBuffer(null);
      refresh();
    });

    es.addEventListener("error", () => {
      es.close();
      dispatchAgentEvent({ kind: "run_end" });
      setAgentBuffer(null);
      refresh();
    });
  }, [threadId, refresh]);

  if (!data) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-[var(--muted)]">
        Loading thread…
      </div>
    );
  }

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <section className="flex-1 flex flex-col min-w-0 bg-[var(--background)]">
      <header className="flex items-center gap-3 px-[18px] py-[10px] border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="text-[14px] font-semibold flex items-center gap-2">
          <span className="text-[var(--muted)]">›</span>
          {data.thread.title}
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
      </header>
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-2">
        <div className="flex items-center gap-2.5 px-[18px] py-2 text-[10px] uppercase tracking-[0.08em] text-[var(--muted)] font-semibold">
          <span className="flex-1 h-px bg-[var(--border)]" />
          {today}
          <span className="flex-1 h-px bg-[var(--border)]" />
        </div>
        {data.messages.map((m) => (
          <Message key={m.id} message={m} />
        ))}
        {agentBuffer && <Message message={agentBuffer} />}
      </div>
      <Composer threadId={threadId} onSent={onSent} />
    </section>
  );
}
