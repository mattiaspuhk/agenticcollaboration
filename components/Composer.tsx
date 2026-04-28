"use client";

import { useState } from "react";
import { POSTABLE_PERSONAS, PERSONAS, type PersonaId } from "@/lib/personas";
import { PersonaBadge } from "./PersonaBadge";

export function Composer({
  threadId,
  onSent,
}: {
  threadId: string;
  onSent: () => void;
}) {
  const [persona, setPersona] = useState<PersonaId>("pm");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, persona, body }),
      });
      if (res.ok) {
        setText("");
        onSent();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
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
          <span className="ml-auto font-mono text-[10px] text-[var(--muted)] bg-[var(--surface-2)] border border-[var(--border)] rounded px-1.5 py-px">
            ⌘↵
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
            placeholder={`Message as ${PERSONAS[persona].label} — @agent to ask`}
            className="flex-1 resize-none bg-transparent border-0 px-0 py-1 text-[13px] leading-relaxed focus:outline-none placeholder:text-[var(--muted)]"
          />
          <button
            onClick={send}
            disabled={busy || !text.trim()}
            className="self-end px-3 py-1.5 text-[12px] font-semibold rounded transition-colors disabled:opacity-40"
            style={{
              background: "var(--accent)",
              color: "var(--accent-fg)",
            }}
          >
            {busy ? "…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
