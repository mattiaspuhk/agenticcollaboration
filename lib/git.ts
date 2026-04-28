import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";

export type GitResult = { stdout: string; stderr: string; code: number };

export async function execGit(
  cwd: string,
  args: string[],
  opts: { input?: string; timeoutMs?: number } = {},
): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`git ${args.join(" ")} timed out`));
    }, opts.timeoutMs ?? 30_000);
    child.stdout.on("data", (b) => (stdout += b.toString()));
    child.stderr.on("data", (b) => (stderr += b.toString()));
    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ stdout, stderr, code: code ?? 0 });
    });
    if (opts.input) {
      child.stdin.write(opts.input);
      child.stdin.end();
    }
  });
}

export async function ensureGitRepo(cwd: string): Promise<void> {
  try {
    const stat = await fs.stat(path.join(cwd, ".git"));
    if (!stat.isDirectory() && !stat.isFile()) {
      throw new Error(`${cwd} has no .git`);
    }
  } catch {
    throw new Error(
      `Project root ${cwd} is not a git repository (no .git directory).`,
    );
  }
  const r = await execGit(cwd, ["rev-parse", "--is-inside-work-tree"]);
  if (r.code !== 0 || r.stdout.trim() !== "true") {
    throw new Error(
      `Project root ${cwd} is not a git working tree: ${r.stderr.trim()}`,
    );
  }
}

export async function currentSha(cwd: string): Promise<string> {
  const r = await execGit(cwd, ["rev-parse", "HEAD"]);
  if (r.code !== 0) throw new Error(`git rev-parse HEAD failed: ${r.stderr}`);
  return r.stdout.trim();
}

export async function detectDefaultBranch(cwd: string): Promise<string> {
  const remote = await execGit(cwd, [
    "symbolic-ref",
    "refs/remotes/origin/HEAD",
  ]);
  if (remote.code === 0) {
    const m = remote.stdout.trim().match(/refs\/remotes\/origin\/(.+)$/);
    if (m) return m[1];
  }
  const headBranch = await execGit(cwd, ["branch", "--show-current"]);
  if (headBranch.code === 0 && headBranch.stdout.trim()) {
    return headBranch.stdout.trim();
  }
  return "main";
}

/**
 * Read file from rootPath safely. Throws if path escapes rootPath.
 */
export function safeJoin(rootPath: string, relPath: string): string {
  if (relPath.startsWith("/") || relPath.includes("\0")) {
    throw new Error(`Invalid path: ${relPath}`);
  }
  const resolved = path.resolve(rootPath, relPath);
  const rootResolved = path.resolve(rootPath);
  if (
    resolved !== rootResolved &&
    !resolved.startsWith(rootResolved + path.sep)
  ) {
    throw new Error(`Path escapes project root: ${relPath}`);
  }
  return resolved;
}

export async function readProjectFile(
  rootPath: string,
  relPath: string,
): Promise<string | null> {
  const full = safeJoin(rootPath, relPath);
  try {
    return await fs.readFile(full, "utf-8");
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") return null;
    throw err;
  }
}

export async function listProjectDir(
  rootPath: string,
  relPath: string,
): Promise<{ name: string; kind: "file" | "dir" }[]> {
  const full = safeJoin(rootPath, relPath || ".");
  const entries = await fs.readdir(full, { withFileTypes: true });
  return entries
    .filter((e) => e.name !== ".git" && e.name !== "node_modules")
    .map((e) => ({
      name: e.name,
      kind: e.isDirectory() ? "dir" : "file",
    }));
}

/**
 * Apply a list of CodeChanges to the working tree at cwd.
 * Returns nothing; throws on first failure.
 */
export async function writeChangesToDisk(
  cwd: string,
  changes: Array<{
    path: string;
    kind: "add" | "modify" | "delete";
    newContent: string | null;
  }>,
): Promise<void> {
  for (const c of changes) {
    const full = safeJoin(cwd, c.path);
    if (c.kind === "delete") {
      await fs.rm(full, { force: true });
      continue;
    }
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, c.newContent ?? "", "utf-8");
  }
}

export async function checkoutFreshBranch(
  cwd: string,
  branch: string,
  baseBranch: string,
): Promise<void> {
  const fetch = await execGit(cwd, ["fetch", "origin", baseBranch], {
    timeoutMs: 60_000,
  });
  if (fetch.code !== 0) {
    throw new Error(`git fetch failed: ${fetch.stderr}`);
  }
  const co = await execGit(cwd, [
    "checkout",
    "-B",
    branch,
    `origin/${baseBranch}`,
  ]);
  if (co.code !== 0) {
    throw new Error(`git checkout -B ${branch} failed: ${co.stderr}`);
  }
}

export async function commitAll(
  cwd: string,
  message: string,
): Promise<{ committed: boolean; sha: string | null }> {
  const add = await execGit(cwd, ["add", "-A"]);
  if (add.code !== 0) throw new Error(`git add failed: ${add.stderr}`);
  const status = await execGit(cwd, ["status", "--porcelain"]);
  if (!status.stdout.trim()) {
    return { committed: false, sha: null };
  }
  const commit = await execGit(cwd, [
    "commit",
    "-m",
    message,
    "--no-verify",
  ]);
  if (commit.code !== 0) {
    throw new Error(`git commit failed: ${commit.stderr}`);
  }
  const sha = await currentSha(cwd);
  return { committed: true, sha };
}

export async function pushBranch(
  cwd: string,
  branch: string,
): Promise<void> {
  const r = await execGit(cwd, ["push", "-u", "origin", branch], {
    timeoutMs: 90_000,
  });
  if (r.code !== 0) {
    throw new Error(`git push failed: ${r.stderr || r.stdout}`);
  }
}
