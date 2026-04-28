export type GhPullRequest = {
  number: number;
  title: string;
  state: "open" | "closed";
  merged: boolean;
  merged_at: string | null;
  updated_at: string;
  html_url: string;
  head: { ref: string };
  user: { login: string } | null;
};

export type GhCommit = {
  sha: string;
  commit: {
    message: string;
    author: { name: string; date: string } | null;
  };
  html_url: string;
  author: { login: string } | null;
};

const BASE = "https://api.github.com";

function authHeaders(): Record<string, string> {
  const token = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    "User-Agent": "agenticcollaboration",
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function listPullRequests(repo: string): Promise<GhPullRequest[]> {
  const res = await fetch(
    `${BASE}/repos/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=15`,
    { headers: authHeaders(), cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`github pulls ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as GhPullRequest[];
}

export async function listRecentCommits(
  repo: string,
  since?: Date,
): Promise<GhCommit[]> {
  const params = new URLSearchParams({ per_page: "15" });
  if (since) params.set("since", since.toISOString());
  const res = await fetch(`${BASE}/repos/${repo}/commits?${params}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`github commits ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as GhCommit[];
}
