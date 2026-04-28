"use client";

import Link from "next/link";
import type { FramingState } from "@/db/schema";

export function GraduateBanner({
  state,
  framing,
  graduating,
  onGraduate,
  projectSlug,
  graduatedFeatureId,
}: {
  state: "open" | "graduated" | "dropped";
  framing: FramingState;
  graduating: boolean;
  onGraduate: () => void;
  projectSlug: string;
  graduatedFeatureId: string | null;
  graduatedFeatureSlug: string | null;
}) {
  if (state === "dropped") {
    return (
      <div className="px-[18px] py-2 border-b border-[var(--border)] bg-[var(--surface-2)] text-[12px] text-[var(--muted)]">
        This discovery was dropped. The framing didn&apos;t hold up — or the
        signal wasn&apos;t there yet. Re-open isn&apos;t wired in v1; start a
        new discovery if it comes back.
      </div>
    );
  }

  if (state === "graduated") {
    return (
      <div className="px-[18px] py-2 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] text-[12px] flex items-center gap-2">
        <span className="text-[var(--ok)] font-semibold">Graduated.</span>
        {graduatedFeatureId && (
          <Link
            href={`/projects/${projectSlug}/f/${graduatedFeatureId}`}
            className="text-[var(--accent)] hover:underline font-medium"
          >
            Open the feature thread →
          </Link>
        )}
      </div>
    );
  }

  if (!framing?.converged) return null;

  return (
    <div
      className="px-[18px] py-3 border-b flex items-center gap-3"
      style={{
        borderColor: "color-mix(in srgb,var(--ok) 35%,var(--border))",
        background: "color-mix(in srgb,var(--ok) 8%,transparent)",
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold text-[var(--ok)] mb-0.5">
          Framing has converged.
        </div>
        <div className="text-[12px] text-[var(--foreground)]/80 leading-snug">
          {framing.reason ||
            "The framed problem looks specific, justified, and falsifiable."}
          {framing.suggestedTitle && (
            <>
              {" "}
              Suggested title:{" "}
              <code className="text-[11px] bg-[var(--surface-2)] border border-[var(--border)] rounded px-1 py-px font-mono">
                {framing.suggestedTitle}
              </code>
            </>
          )}
        </div>
      </div>
      <button
        onClick={onGraduate}
        disabled={graduating}
        className="px-3 py-1.5 text-[12px] font-semibold rounded transition-colors disabled:opacity-50 shrink-0"
        style={{ background: "var(--ok)", color: "white" }}
      >
        {graduating ? "Graduating…" : "Graduate to feature thread"}
      </button>
    </div>
  );
}
