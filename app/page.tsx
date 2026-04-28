import Link from "next/link";
import { db, schema } from "@/db/client";
import { desc } from "drizzle-orm";
import { NewProjectForm } from "@/components/NewProjectForm";

export default async function Home() {
  const projects = await db.query.projects.findMany({
    orderBy: [desc(schema.projects.createdAt)],
  });

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <header className="mb-8">
          <div className="text-xs uppercase tracking-wider text-[var(--muted)] mb-2">
            Agentic Collaboration
          </div>
          <h1 className="text-2xl font-semibold">
            Pick a project, or index a new one.
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Point at a folder on this machine. The agent indexes the codebase,
            wiki, docs, and git history, then joins as a peer.
          </p>
        </header>

        {projects.length > 0 && (
          <section className="mb-8">
            <div className="text-xs uppercase tracking-wider text-[var(--muted)] mb-2">
              Your projects
            </div>
            <ul className="space-y-2">
              {projects.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/projects/${p.slug}`}
                    className="block border border-[var(--border)] rounded-md p-3 bg-[var(--surface)] hover:border-[var(--accent)] transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{p.name}</div>
                      <StatusPill status={p.status} />
                    </div>
                    <div className="text-xs text-[var(--muted)] mt-1 font-mono truncate">
                      {p.rootPath}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <div className="text-xs uppercase tracking-wider text-[var(--muted)] mb-2">
            New project
          </div>
          <NewProjectForm />
        </section>
      </div>
    </main>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    new: { label: "Not indexed", cls: "bg-[var(--surface-2)] text-[var(--muted)]" },
    indexing: { label: "Indexing…", cls: "bg-[var(--accent)]/20 text-[var(--accent)]" },
    ready: { label: "Ready", cls: "bg-[var(--color-eng)]/20 text-[var(--color-eng)]" },
    error: { label: "Error", cls: "bg-red-500/20 text-red-400" },
  };
  const v = map[status] ?? map.new;
  return (
    <span
      className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${v.cls}`}
    >
      {v.label}
    </span>
  );
}
