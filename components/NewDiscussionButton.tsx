"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewDiscussionButton({ projectSlug }: { projectSlug: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function create() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/discussions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectSlug }),
      });
      if (res.ok) {
        const json = await res.json();
        router.push(`/projects/${projectSlug}/d/${json.id}`);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={create}
      disabled={busy}
      className="w-full flex items-center gap-2 px-2 py-[5px] rounded-[5px] text-[12px] text-[var(--accent)] hover:bg-[var(--surface-2)] mb-1 disabled:opacity-50"
    >
      <span>＋</span>
      <span>{busy ? "Starting…" : "New discovery"}</span>
    </button>
  );
}
