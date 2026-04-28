"use client";

import { useState } from "react";
import type { Role } from "@/lib/tiles";

type Persona = "pm" | "engineer" | "designer" | "user";

const ROLE_DEFAULTS: Record<Role, Persona> = {
  pm: "pm",
  eng: "engineer",
  user: "user",
};

const PERSONA_LABEL: Record<Persona, string> = {
  pm: "PM",
  engineer: "Engineer",
  designer: "Designer",
  user: "End user",
};

const ROLE_AUTHOR_LABEL: Record<Role, string> = {
  pm: "Sam (PM)",
  eng: "Daniel (Eng)",
  user: "Morgan (Customer)",
};

const POSTABLE_BY_ROLE: Record<Role, Persona[]> = {
  pm: ["pm", "engineer", "designer"],
  eng: ["engineer", "pm", "designer"],
  user: ["user"],
};

export function FeatureComposer({
  featureId,
  role,
  onSent,
  large = false,
}: {
  featureId: string;
  role: Role;
  onSent: () => void;
  large?: boolean;
}) {
  const [persona, setPersona] = useState<Persona>(ROLE_DEFAULTS[role]);
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
        body: JSON.stringify({
          threadKind: "feature",
          containerId: featureId,
          persona,
          body,
          authorLabel: ROLE_AUTHOR_LABEL[role],
        }),
      });
      if (res.ok) {
        setText("");
        onSent();
      }
    } finally {
      setBusy(false);
    }
  }

  const personas = POSTABLE_BY_ROLE[role];
  const showPersonaPicker = personas.length > 1;
  const placeholder =
    role === "user"
      ? "Add feedback — what did you try, what happened, what did you expect?"
      : `Message as ${PERSONA_LABEL[persona]} — the agent will reply (⌘↵ to send)`;

  return (
    <div
      className={`px-5 ${large ? "pt-3 pb-4" : "pt-2 pb-2"} bg-gradient-to-b from-transparent to-[var(--background)]`}
    >
      <div className="border border-[var(--border-strong)] bg-[var(--surface)] rounded-lg shadow-sm">
        {showPersonaPicker && (
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)]">
            <span className="text-[11px] text-[var(--muted)]">Post as</span>
            <div className="flex gap-1">
              {personas.map((p) => {
                const a = p === persona;
                return (
                  <button
                    key={p}
                    onClick={() => setPersona(p)}
                    className={`text-[11px] px-2 py-1 rounded transition-all ${
                      a
                        ? "bg-[var(--surface-2)] ring-1 ring-[var(--border-strong)] font-medium"
                        : "opacity-55 hover:opacity-100"
                    }`}
                  >
                    {PERSONA_LABEL[p]}
                  </button>
                );
              })}
            </div>
            <span className="ml-auto font-mono text-[10px] text-[var(--muted)] bg-[var(--surface-2)] border border-[var(--border)] rounded px-1.5 py-px">
              ⌘↵
            </span>
          </div>
        )}
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
            rows={large ? 4 : 2}
            placeholder={placeholder}
            className="flex-1 resize-none bg-transparent border-0 px-0 py-1 text-[13px] leading-relaxed focus:outline-none placeholder:text-[var(--muted)]"
          />
          <button
            onClick={send}
            disabled={busy || !text.trim()}
            className="self-end px-3.5 py-2 text-[12px] font-semibold rounded transition-colors disabled:opacity-40"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            {busy ? "…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
