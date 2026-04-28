"use client";

import type { MessageBlock } from "@/db/schema";
import type { PersonaId } from "@/lib/personas";
import { PERSONAS } from "@/lib/personas";
import { PersonaBadge } from "./PersonaBadge";
import { formatTime } from "@/lib/utils";
import { CommitRef } from "./blocks/CommitRef";
import { SignalCard } from "./blocks/SignalCard";
import { EditCard } from "./blocks/EditCard";
import { FileRef } from "./blocks/FileRef";
import { MessageBody } from "./MessageBody";

export type MessageView = {
  id: string;
  authorKind: "user" | "agent" | "system";
  authorPersona: PersonaId;
  authorLabel: string;
  bodyMd: string;
  blocks: MessageBlock[];
  createdAt: string;
  pending?: boolean;
};

const ROLE_LABEL: Record<PersonaId, string> = {
  pm: "PM",
  engineer: "Engineer",
  designer: "Designer",
  agent: "peer",
  system: "system",
  user: "End user",
};

export function Message({ message }: { message: MessageView }) {
  const p = PERSONAS[message.authorPersona] ?? PERSONAS.system;
  const isAgent = message.authorPersona === "agent";
  return (
    <div className="grid grid-cols-[36px_1fr] gap-3 px-[18px] py-[6px] hover:bg-[var(--surface)]/50 transition-colors">
      <PersonaBadge persona={message.authorPersona} />
      <div className="min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span
            className="text-[13px] font-semibold"
            style={{ color: p.colorVar }}
          >
            {message.authorLabel || p.label}
          </span>
          <span
            className={`text-[10px] uppercase tracking-[0.06em] font-semibold border rounded-[3px] px-[5px] py-px ${
              isAgent ? "text-[var(--agent)]" : "text-[var(--muted)]"
            }`}
            style={
              isAgent
                ? {
                    borderColor:
                      "color-mix(in srgb,var(--agent) 40%,transparent)",
                    background:
                      "color-mix(in srgb,var(--agent) 10%,transparent)",
                  }
                : {
                    borderColor: "var(--border)",
                    background: "var(--surface-2)",
                  }
            }
          >
            {ROLE_LABEL[message.authorPersona] ?? "·"}
          </span>
          <span className="text-[11px] text-[var(--muted)]">
            {formatTime(message.createdAt)}
          </span>
          {message.pending && (
            <span className="text-[11px] text-[var(--muted)] italic">
              thinking…
            </span>
          )}
        </div>
        {message.bodyMd && <MessageBody>{message.bodyMd}</MessageBody>}
        {message.blocks.length > 0 && (
          <div className="mt-2 space-y-2">
            {message.blocks.map((b, i) => (
              <BlockRenderer key={i} block={b} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BlockRenderer({ block }: { block: MessageBlock }) {
  switch (block.type) {
    case "commit_ref":
      return <CommitRef block={block} />;
    case "signal_card":
      return <SignalCard block={block} />;
    case "edit_card":
      return <EditCard editId={block.editId} />;
    case "file_ref":
      return <FileRef block={block} />;
    default:
      return null;
  }
}
