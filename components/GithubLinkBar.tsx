"use client";

import { useState } from "react";

export function GithubLinkBar({
  featureId,
  githubRepo,
  branchName,
  lastGithubPollAt,
  pollMessage,
  onChanged,
}: {
  featureId: string;
  githubRepo: string | null;
  branchName: string | null;
  lastGithubPollAt: string | null;
  pollMessage: string | null;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(!githubRepo);
  const [repoInput, setRepoInput] = useState(githubRepo ?? "");
  const [branchInput, setBranchInput] = useState(branchName ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/features/${featureId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          githubRepo: repoInput.trim() || null,
          branchName: branchInput.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "save failed");
        return;
      }
      setEditing(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (!editing && githubRepo) {
    return (
      <div className="px-5 py-1.5 border-b border-[var(--border)] bg-[var(--surface-2)] text-[11px] text-[var(--muted)] flex items-center gap-3">
        <span>
          GitHub:{" "}
          <a
            href={`https://github.com/${githubRepo}`}
            target="_blank"
            rel="noreferrer"
            className="text-[var(--accent)] font-mono hover:underline"
          >
            {githubRepo}
          </a>
        </span>
        {branchName && (
          <span className="font-mono">
            branch <code className="bg-[var(--surface)] border border-[var(--border)] px-1 rounded">{branchName}</code>
          </span>
        )}
        {lastGithubPollAt && (
          <span className="text-[10px]">
            polled {new Date(lastGithubPollAt).toLocaleTimeString()}
          </span>
        )}
        {pollMessage && <span className="text-[10px]">· {pollMessage}</span>}
        <button
          onClick={() => setEditing(true)}
          className="ml-auto text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          edit
        </button>
      </div>
    );
  }

  return (
    <div className="px-5 py-2 border-b border-[var(--border)] bg-[var(--surface-2)] text-[11px] flex items-center gap-2 flex-wrap">
      <span className="text-[var(--muted)]">GitHub repo</span>
      <input
        value={repoInput}
        onChange={(e) => setRepoInput(e.target.value)}
        placeholder="owner/repo"
        className="font-mono text-[11.5px] bg-[var(--surface)] border border-[var(--border-strong)] rounded px-2 py-0.5 w-48"
      />
      <span className="text-[var(--muted)]">branch</span>
      <input
        value={branchInput}
        onChange={(e) => setBranchInput(e.target.value)}
        placeholder="(optional, slug-match if blank)"
        className="font-mono text-[11.5px] bg-[var(--surface)] border border-[var(--border-strong)] rounded px-2 py-0.5 w-56"
      />
      <button
        onClick={save}
        disabled={busy}
        className="px-2 py-0.5 text-[11px] font-semibold rounded transition-colors disabled:opacity-40"
        style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
      >
        {busy ? "…" : "Save"}
      </button>
      {githubRepo && (
        <button
          onClick={() => {
            setEditing(false);
            setRepoInput(githubRepo);
            setBranchInput(branchName ?? "");
          }}
          className="text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          cancel
        </button>
      )}
      {error && <span className="text-[var(--err)]">{error}</span>}
      <span className="text-[10px] text-[var(--muted)] basis-full mt-1">
        Set <code className="font-mono">GITHUB_PAT</code> or{" "}
        <code className="font-mono">GITHUB_TOKEN</code> in <code className="font-mono">.env</code> for private repos.
      </span>
    </div>
  );
}
