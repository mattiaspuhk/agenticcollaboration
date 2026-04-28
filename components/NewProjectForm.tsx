"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewProjectForm() {
  const router = useRouter();
  const [rootPath, setRootPath] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rootPath.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rootPath: rootPath.trim(),
          name: name.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `Request failed (${res.status})`);
        return;
      }
      const { slug } = await res.json();
      router.push(`/projects/${slug}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="text-xs text-[var(--muted)] mb-1 block">
          Absolute path to the project root
        </label>
        <input
          value={rootPath}
          onChange={(e) => setRootPath(e.target.value)}
          placeholder="/Users/you/code/my-app"
          className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-[var(--accent)]"
          required
          autoFocus
        />
        <div className="text-[11px] text-[var(--muted)] mt-1">
          The agent will index code files, then look for{" "}
          <code className="text-[var(--foreground)]">wiki/</code> and{" "}
          <code className="text-[var(--foreground)]">docs/</code> for markdown,
          then read up to 200 commits if it's a git repo.
        </div>
      </div>
      <div>
        <label className="text-xs text-[var(--muted)] mb-1 block">
          Display name (optional)
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="(defaults to folder name)"
          className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
        />
      </div>
      {error && (
        <div className="text-xs text-red-400 border border-red-500/40 bg-red-500/10 rounded px-3 py-2">
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={busy || !rootPath.trim()}
        className="px-4 py-2 text-sm font-medium rounded bg-[var(--accent)] text-white disabled:opacity-50"
      >
        {busy ? "Starting…" : "Index project"}
      </button>
    </form>
  );
}
