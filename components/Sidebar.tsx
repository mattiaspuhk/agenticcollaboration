import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";
import { NewDiscussionButton } from "./NewDiscussionButton";
import { SidebarLink } from "./SidebarLink";
import { getSidebarLists } from "@/lib/data";

export async function Sidebar({
  projectId,
  projectSlug,
  projectName,
}: {
  projectId: string;
  projectSlug: string;
  projectName: string;
}) {
  const { discussions, features } = await getSidebarLists(projectId);

  const initials =
    projectName
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "·";

  return (
    <aside className="w-64 shrink-0 border-r border-[var(--border)] bg-[var(--surface)] flex flex-col">
      <div className="px-3 py-3 border-b border-[var(--border)] flex items-center gap-2.5">
        <Link
          href="/"
          className="w-7 h-7 rounded-md grid place-items-center text-[11px] font-bold text-[var(--accent-fg,#1a1410)] shrink-0"
          style={{
            background:
              "linear-gradient(135deg,var(--accent),color-mix(in srgb,var(--accent) 70%,#dc2626))",
          }}
          title="All projects"
          aria-label="All projects"
        >
          {initials}
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            href={`/projects/${projectSlug}`}
            className="block text-[13px] font-semibold tracking-tight truncate text-[var(--foreground)] hover:underline"
          >
            {projectName}
          </Link>
          <div className="text-[11px] text-[var(--muted)] mt-0.5 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--ok)]" />
            agent online
          </div>
        </div>
        <ThemeToggle />
      </div>

      <nav className="flex-1 overflow-y-auto px-1.5 py-2">
        <SectionHeader label="Discoveries" />
        <NewDiscussionButton projectSlug={projectSlug} />
        <ul className="space-y-px mb-3">
          {discussions.length === 0 && (
            <li className="text-[11px] text-[var(--muted)] px-2 py-1 italic">
              No open discoveries
            </li>
          )}
          {discussions.map((d) => {
            const dropped = d.state === "dropped";
            return (
              <li key={d.id}>
                <SidebarLink
                  href={`/projects/${projectSlug}/d/${d.id}`}
                  className={`flex items-center gap-2 px-2 py-[5px] rounded-[5px] text-[12.5px] transition-colors ${dropped ? "opacity-50" : ""}`}
                  activeClassName="bg-[var(--surface-2)] text-[var(--foreground)]"
                  inactiveClassName="text-[var(--foreground)]/80 hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
                >
                  <span
                    className={
                      d.framingState?.converged
                        ? "text-[var(--ok)]"
                        : "text-[var(--muted)]"
                    }
                    title={
                      d.framingState?.converged
                        ? "framing converged"
                        : "framing in progress"
                    }
                  >
                    {dropped ? "✕" : d.framingState?.converged ? "◆" : "◇"}
                  </span>
                  <span className="truncate flex-1">{d.title}</span>
                </SidebarLink>
              </li>
            );
          })}
        </ul>

        <SectionHeader label="Features" />
        <ul className="space-y-px mb-3">
          {features.length === 0 && (
            <li className="text-[11px] text-[var(--muted)] px-2 py-1 italic">
              No features yet — graduate a discovery
            </li>
          )}
          {features.map((f) => {
            const dot = STATUS_DOT[f.status] ?? "var(--muted)";
            return (
              <li key={f.id}>
                <SidebarLink
                  href={`/projects/${projectSlug}/f/${f.slug}`}
                  match="prefix"
                  className="flex items-center gap-2 px-2 py-[5px] rounded-[5px] text-[12.5px] transition-colors"
                  activeClassName="bg-[var(--surface-2)] text-[var(--foreground)]"
                  inactiveClassName="text-[var(--foreground)]/80 hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: dot }}
                  />
                  <span className="truncate flex-1">{f.title}</span>
                </SidebarLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="px-3 py-2.5 border-t border-[var(--border)]">
        <div className="flex items-center justify-between text-[11px] text-[var(--muted)] mb-1">
          <span>Indexed sources</span>
          <span className="text-[var(--ok)] font-semibold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--ok)]" />
            synced
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {["codebase", "docs", "git", "github"].map((s) => (
            <span
              key={s}
              className="text-[10px] text-[var(--muted)] bg-[var(--surface-2)] border border-[var(--border)] px-1.5 py-px rounded-full"
            >
              {s}
            </span>
          ))}
        </div>
      </div>
    </aside>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)] px-2 mb-1 flex items-center justify-between">
      <span>{label}</span>
    </div>
  );
}

const STATUS_DOT: Record<string, string> = {
  scoping: "var(--muted)",
  in_progress: "var(--accent)",
  blocked: "var(--err)",
  in_review: "var(--warn)",
  shipped: "var(--ok)",
};
