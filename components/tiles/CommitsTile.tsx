import { Tile } from "./Tile";
import type { TileVisual } from "@/lib/tiles";
import type { LinkedPr } from "@/db/schema";

export function CommitsTile({
  prs,
  visual,
  githubRepo,
  branchName,
}: {
  prs: LinkedPr[];
  visual: TileVisual;
  githubRepo: string | null;
  branchName: string | null;
}) {
  if (visual === "hidden") return null;
  const collapsedSummary =
    prs.length > 0
      ? `${prs.length} linked PR${prs.length === 1 ? "" : "s"} (${
          prs.filter((p) => p.state === "open").length
        } open · ${prs.filter((p) => p.state === "merged").length} merged)`
      : `no linked PRs`;

  return (
    <Tile
      title="Commits & PRs"
      badge={githubRepo ?? "no repo"}
      visual={visual}
      accent="var(--eng)"
      collapsedSummary={collapsedSummary}
    >
      {!githubRepo && (
        <p className="text-[12px] text-[var(--muted)] italic">
          Set a GitHub repo on this feature (top of the dashboard) to start
          polling PRs and commits.
        </p>
      )}
      {githubRepo && prs.length === 0 && (
        <p className="text-[12px] text-[var(--muted)] italic">
          No PRs yet for branch{" "}
          <code className="font-mono text-[11px] bg-[var(--surface-2)] px-1 rounded">
            {branchName ?? "(any matching)"}
          </code>
          .
        </p>
      )}
      {prs.length > 0 && (
        <ul className="space-y-1.5">
          {prs.map((pr) => (
            <li
              key={pr.number}
              className="flex items-center gap-2 text-[12px]"
            >
              <span
                className="text-[10px] font-semibold uppercase px-1.5 py-px rounded border"
                style={prStyle(pr.state)}
              >
                {pr.state}
              </span>
              <a
                href={pr.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent)] hover:underline truncate flex-1"
              >
                #{pr.number} {pr.title}
              </a>
            </li>
          ))}
        </ul>
      )}
    </Tile>
  );
}

function prStyle(state: LinkedPr["state"]) {
  if (state === "merged") {
    return {
      color: "var(--agent)",
      borderColor: "color-mix(in srgb,var(--agent) 35%,transparent)",
      background: "color-mix(in srgb,var(--agent) 10%,transparent)",
    };
  }
  if (state === "open") {
    return {
      color: "var(--ok)",
      borderColor: "color-mix(in srgb,var(--ok) 35%,transparent)",
      background: "color-mix(in srgb,var(--ok) 10%,transparent)",
    };
  }
  return {
    color: "var(--muted)",
    borderColor: "var(--border)",
    background: "var(--surface-2)",
  };
}
