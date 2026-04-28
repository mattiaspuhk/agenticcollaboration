"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { IngestProgress } from "@/db/schema";

type Project = {
  status: "new" | "indexing" | "ready" | "error";
  progress: IngestProgress;
  ingestError: string | null;
};

const STAGE_LABELS: Record<IngestProgress["stage"], string> = {
  idle: "Waiting…",
  scanning_code: "Scanning codebase",
  embedding_code: "Embedding code chunks",
  scanning_docs: "Scanning docs and wiki",
  embedding_docs: "Embedding doc chunks",
  reading_git: "Reading git history",
  embedding_git: "Embedding commits",
  done: "Done",
};

export function ProjectHome({
  slug,
  name,
  rootPath,
  docsPaths,
  initialStatus,
  initialProgress,
  ingestError,
}: {
  slug: string;
  name: string;
  rootPath: string;
  docsPaths: string[];
  initialStatus: "new" | "indexing" | "ready" | "error";
  initialProgress: IngestProgress;
  ingestError: string | null;
}) {
  const router = useRouter();
  const [proj, setProj] = useState<Project>({
    status: initialStatus,
    progress: initialProgress,
    ingestError,
  });

  useEffect(() => {
    if (proj.status === "ready") {
      router.refresh();
      return;
    }
    if (proj.status !== "indexing" && proj.status !== "new") return;
    const id = setInterval(async () => {
      const res = await fetch(`/api/projects/${slug}`);
      if (!res.ok) return;
      const data = await res.json();
      setProj({
        status: data.status,
        progress: data.progress,
        ingestError: data.ingestError ?? null,
      });
      if (data.status === "ready") router.refresh();
    }, 1500);
    return () => clearInterval(id);
  }, [proj.status, slug, router]);

  async function reindex() {
    await fetch(`/api/projects/${slug}/ingest`, { method: "POST" });
    setProj((p) => ({ ...p, status: "indexing" }));
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <header className="mb-6">
          <div className="text-xs uppercase tracking-wider text-[var(--muted)] mb-1">
            Project
          </div>
          <h1 className="text-xl font-semibold">{name}</h1>
          <div className="text-xs text-[var(--muted)] font-mono mt-1">
            {rootPath}
          </div>
          {docsPaths.length > 0 && (
            <div className="text-xs text-[var(--muted)] mt-1">
              Docs: {docsPaths.join(", ")}
            </div>
          )}
        </header>

        <section className="border border-[var(--border)] rounded-md bg-[var(--surface)] p-5">
          {proj.status === "error" && (
            <>
              <div className="text-sm font-medium text-red-400 mb-2">
                Indexing failed
              </div>
              <pre className="text-xs text-[var(--muted)] whitespace-pre-wrap mb-3">
                {proj.ingestError}
              </pre>
              <button
                onClick={reindex}
                className="px-3 py-1.5 text-xs font-medium rounded bg-[var(--accent)] text-white"
              >
                Retry indexing
              </button>
            </>
          )}

          {(proj.status === "new" || proj.status === "indexing") && (
            <>
              <div className="text-sm font-medium mb-3">
                {STAGE_LABELS[proj.progress.stage]}
              </div>
              <div className="space-y-2 text-xs">
                <ProgressRow
                  label="Code"
                  done={proj.progress.codeChunksEmbedded}
                  total={proj.progress.codeChunks}
                  detail={`${proj.progress.codeFilesSeen} files seen`}
                />
                <ProgressRow
                  label="Docs"
                  done={proj.progress.docChunksEmbedded}
                  total={proj.progress.docChunks}
                  detail={`${proj.progress.docFiles} files`}
                />
                <ProgressRow
                  label="Commits"
                  done={proj.progress.commitsEmbedded}
                  total={proj.progress.commits}
                />
              </div>
              <div className="text-[11px] text-[var(--muted)] mt-4">
                Indexing runs server-side. Safe to keep this tab open. Total
                time depends on repo size — typically 1–3 minutes per ~5k code
                chunks.
              </div>
            </>
          )}

          {proj.status === "ready" && (
            <div className="text-sm">
              Ready. Redirecting to the chat…
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function ProgressRow({
  label,
  done,
  total,
  detail,
}: {
  label: string;
  done: number;
  total: number;
  detail?: string;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-[var(--muted)] mb-0.5">
        <span>
          {label}
          {detail ? ` · ${detail}` : ""}
        </span>
        <span>
          {done}/{total || "—"}
        </span>
      </div>
      <div className="h-1 bg-[var(--surface-2)] rounded overflow-hidden">
        <div
          className="h-full bg-[var(--accent)] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
