import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import { listPullRequests, listRecentCommits, type GhCommit } from "@/lib/github";
import type { LinkedPr } from "@/db/schema";

const inFlight = new Map<string, Promise<PollResult>>();

export type PollResult = {
  ok: boolean;
  message: string;
  newCommits?: GhCommit[];
  prs?: LinkedPr[];
};

export function pollFeature(featureId: string): Promise<PollResult> {
  const existing = inFlight.get(featureId);
  if (existing) return existing;
  const p = (async () => {
    try {
      return await pollOnce(featureId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, message };
    } finally {
      inFlight.delete(featureId);
    }
  })();
  inFlight.set(featureId, p);
  return p;
}

async function pollOnce(featureId: string): Promise<PollResult> {
  const feature = await db.query.features.findFirst({
    where: eq(schema.features.id, featureId),
  });
  if (!feature) return { ok: false, message: "feature not found" };
  if (!feature.githubRepo) {
    return { ok: false, message: "feature has no github_repo" };
  }

  const repo = feature.githubRepo;
  const since = feature.lastGithubPollAt
    ? new Date(feature.lastGithubPollAt)
    : new Date(Date.now() - 7 * 24 * 3600 * 1000);

  const [allPrs, commits] = await Promise.all([
    listPullRequests(repo).catch((err) => {
      throw new Error(`pulls: ${err.message}`);
    }),
    listRecentCommits(repo, since).catch((err) => {
      throw new Error(`commits: ${err.message}`);
    }),
  ]);

  const branchName = feature.branchName?.trim();
  const featureSlug = feature.slug;
  const prs = allPrs.filter((pr) => {
    const head = pr.head?.ref ?? "";
    if (branchName && head === branchName) return true;
    if (head.includes(featureSlug)) return true;
    if (pr.title.toLowerCase().includes(featureSlug.replace(/-/g, " "))) return true;
    return false;
  });

  const linked: LinkedPr[] = prs.map((pr) => ({
    number: pr.number,
    title: pr.title,
    state: pr.merged ? "merged" : pr.state,
    url: pr.html_url,
    mergedAt: pr.merged_at ?? undefined,
    updatedAt: pr.updated_at,
  }));

  const status = inferStatus(linked, feature.status);

  await db
    .update(schema.features)
    .set({
      linkedPrIds: linked,
      status: status.next,
      statusNote: status.note,
      lastGithubPollAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.features.id, featureId));

  if (commits.length) {
    await postCommitsAsSystem(featureId, commits);
  }

  return { ok: true, message: `polled ${repo}: ${linked.length} pr(s), ${commits.length} commit(s)`, newCommits: commits, prs: linked };
}

function inferStatus(
  prs: LinkedPr[],
  current: typeof schema.features.$inferSelect["status"],
): { next: typeof schema.features.$inferSelect["status"]; note: string } {
  if (prs.length === 0) {
    return { next: current === "shipped" ? "shipped" : current, note: "" };
  }
  const merged = prs.filter((p) => p.state === "merged");
  const open = prs.filter((p) => p.state === "open");
  if (merged.length && open.length === 0 && prs.every((p) => p.state !== "open")) {
    return { next: "shipped", note: `${merged.length} PR(s) merged.` };
  }
  if (open.length) {
    return {
      next: "in_review",
      note: `${open.length} PR(s) open${
        merged.length ? `, ${merged.length} merged` : ""
      }.`,
    };
  }
  return { next: "in_progress", note: `${prs.length} PR(s) tracked.` };
}

async function postCommitsAsSystem(featureId: string, commits: GhCommit[]) {
  const lines = commits
    .slice(0, 6)
    .map((c) => {
      const author = c.author?.login || c.commit.author?.name || "someone";
      const subject = c.commit.message.split("\n")[0];
      const sha = c.sha.slice(0, 7);
      return `· [\`${sha}\`](${c.html_url}) ${subject} — ${author}`;
    })
    .join("\n");

  await db.insert(schema.messages).values({
    threadKind: "feature",
    containerId: featureId,
    authorKind: "system",
    authorPersona: "system",
    authorLabel: "GitHub",
    bodyMd: `New commits on this branch:\n\n${lines}`,
    blocks: [],
  });
}
