import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import { db, schema } from "@/db/client";
import { embedDocuments } from "@/lib/embed";
import { chunkLines, chunkMarkdown } from "./chunker";
import { extractProjectFacts } from "./projectFacts";
import { count, eq } from "drizzle-orm";
import type { IngestProgress } from "@/db/schema";

async function projectRowCount(
  table:
    | typeof schema.codeChunks
    | typeof schema.docChunks
    | typeof schema.commits,
  projectId: string,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(table)
    .where(eq(table.projectId, projectId));
  return row?.n ?? 0;
}

const CODE_EXTS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".rs", ".go", ".rb", ".java", ".kt", ".swift",
  ".c", ".cpp", ".h", ".hpp", ".cs",
  ".css", ".scss", ".html", ".sh", ".sql",
  ".prisma", ".graphql", ".vue", ".svelte",
]);

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "out",
  "target", ".turbo", ".cache", "coverage", "__pycache__",
  ".venv", ".pnpm-store", ".yarn", "tmp", ".vscode", ".idea",
  ".gen", "generated",
]);

async function* walkFiles(
  dir: string,
  matchExts?: Set<string>,
  matchNames?: RegExp,
): AsyncGenerator<string> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      if (ent.name.startsWith(".") && ent.name !== ".github") continue;
      yield* walkFiles(path.join(dir, ent.name), matchExts, matchNames);
    } else if (ent.isFile()) {
      const ext = path.extname(ent.name);
      if (matchExts && !matchExts.has(ext)) continue;
      if (matchNames && !matchNames.test(ent.name)) continue;
      yield path.join(dir, ent.name);
    }
  }
}

async function updateProgress(
  projectId: string,
  patch: Partial<IngestProgress>,
) {
  const proj = await db.query.projects.findFirst({
    where: eq(schema.projects.id, projectId),
  });
  if (!proj) return;
  const next: IngestProgress = { ...proj.ingestProgress, ...patch };
  await db
    .update(schema.projects)
    .set({ ingestProgress: next })
    .where(eq(schema.projects.id, projectId));
}

export async function ingestProject(
  projectId: string,
  opts: { force?: boolean } = {},
) {
  const proj = await db.query.projects.findFirst({
    where: eq(schema.projects.id, projectId),
  });
  if (!proj) throw new Error(`Project ${projectId} not found`);

  await db
    .update(schema.projects)
    .set({
      status: "indexing",
      ingestStartedAt: new Date(),
      ingestFinishedAt: null,
      ingestError: null,
    })
    .where(eq(schema.projects.id, projectId));

  if (opts.force) {
    await db
      .delete(schema.codeChunks)
      .where(eq(schema.codeChunks.projectId, projectId));
    await db
      .delete(schema.docChunks)
      .where(eq(schema.docChunks.projectId, projectId));
    await db
      .delete(schema.commits)
      .where(eq(schema.commits.projectId, projectId));
  }

  try {
    const facts = await extractProjectFacts(proj.rootPath);
    await db
      .update(schema.projects)
      .set({ facts })
      .where(eq(schema.projects.id, projectId));

    await ingestCode(projectId, proj.rootPath);
    await ingestDocs(projectId, proj.rootPath, proj.docsPaths);
    await ingestGit(projectId, proj.rootPath);

    await updateProgress(projectId, { stage: "done" });
    await db
      .update(schema.projects)
      .set({ status: "ready", ingestFinishedAt: new Date() })
      .where(eq(schema.projects.id, projectId));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(schema.projects)
      .set({
        status: "error",
        ingestError: msg,
        ingestFinishedAt: new Date(),
      })
      .where(eq(schema.projects.id, projectId));
    throw err;
  }
}

async function ingestCode(projectId: string, root: string) {
  const existing = await projectRowCount(schema.codeChunks, projectId);
  if (existing > 0) {
    await updateProgress(projectId, {
      stage: "embedding_code",
      codeChunks: existing,
      codeChunksEmbedded: existing,
    });
    return;
  }

  await updateProgress(projectId, {
    stage: "scanning_code",
    codeFilesSeen: 0,
    codeChunks: 0,
    codeChunksEmbedded: 0,
  });

  const allChunks: {
    filePath: string;
    lineStart: number;
    lineEnd: number;
    content: string;
  }[] = [];

  let filesSeen = 0;
  for await (const file of walkFiles(root, CODE_EXTS)) {
    filesSeen++;
    if (filesSeen % 100 === 0) {
      await updateProgress(projectId, { codeFilesSeen: filesSeen });
    }
    try {
      const stat = await fs.stat(file);
      if (stat.size > 200_000) continue;
      const content = await fs.readFile(file, "utf-8");
      const rel = path.relative(root, file);
      const chunks = chunkLines(content);
      for (const c of chunks) allChunks.push({ filePath: rel, ...c });
    } catch {
      // unreadable, skip
    }
  }

  await updateProgress(projectId, {
    stage: "embedding_code",
    codeFilesSeen: filesSeen,
    codeChunks: allChunks.length,
  });

  const BATCH = 64;
  for (let i = 0; i < allChunks.length; i += BATCH) {
    const batch = allChunks.slice(i, i + BATCH);
    const vectors = await embedDocuments(batch.map((c) => c.content));
    await db.insert(schema.codeChunks).values(
      batch.map((c, idx) => ({
        projectId,
        filePath: c.filePath,
        lineStart: c.lineStart,
        lineEnd: c.lineEnd,
        content: c.content,
        embedding: vectors[idx],
      })),
    );
    await updateProgress(projectId, {
      codeChunksEmbedded: Math.min(i + BATCH, allChunks.length),
    });
  }
}

async function ingestDocs(
  projectId: string,
  root: string,
  docsPaths: string[],
) {
  const existing = await projectRowCount(schema.docChunks, projectId);
  if (existing > 0) {
    await updateProgress(projectId, {
      stage: "embedding_docs",
      docChunks: existing,
      docChunksEmbedded: existing,
    });
    return;
  }

  await updateProgress(projectId, {
    stage: "scanning_docs",
    docFiles: 0,
    docChunks: 0,
    docChunksEmbedded: 0,
  });

  const allChunks: {
    filePath: string;
    section: string;
    content: string;
  }[] = [];

  let docFiles = 0;
  const roots = docsPaths.length > 0 ? docsPaths : ["wiki", "docs"];

  for (const sub of roots) {
    const dir = path.isAbsolute(sub) ? sub : path.join(root, sub);
    try {
      const stat = await fs.stat(dir);
      if (!stat.isDirectory()) continue;
    } catch {
      continue;
    }
    for await (const file of walkFiles(dir, undefined, /\.(md|mdx)$/i)) {
      docFiles++;
      const rel = path.relative(root, file);
      try {
        const content = await fs.readFile(file, "utf-8");
        const chunks = chunkMarkdown(content);
        for (const c of chunks) {
          allChunks.push({ filePath: rel, ...c });
        }
      } catch {
        // skip
      }
    }
  }

  await updateProgress(projectId, {
    stage: "embedding_docs",
    docFiles,
    docChunks: allChunks.length,
  });

  const BATCH = 64;
  for (let i = 0; i < allChunks.length; i += BATCH) {
    const batch = allChunks.slice(i, i + BATCH);
    const vectors = await embedDocuments(
      batch.map((c) => `${c.section}\n\n${c.content}`),
    );
    await db.insert(schema.docChunks).values(
      batch.map((c, idx) => ({
        projectId,
        filePath: c.filePath,
        section: c.section,
        content: c.content,
        embedding: vectors[idx],
      })),
    );
    await updateProgress(projectId, {
      docChunksEmbedded: Math.min(i + BATCH, allChunks.length),
    });
  }
}

async function ingestGit(projectId: string, root: string) {
  const existing = await projectRowCount(schema.commits, projectId);
  if (existing > 0) {
    await updateProgress(projectId, {
      stage: "embedding_git",
      commits: existing,
      commitsEmbedded: existing,
    });
    return;
  }

  await updateProgress(projectId, {
    stage: "reading_git",
    commits: 0,
    commitsEmbedded: 0,
  });

  let raw = "";
  try {
    const fmt = "%H%x1f%an%x1f%aI%x1f%s%x1f%b%x1e";
    raw = execSync(
      `git -C "${root}" log --no-merges -n 200 --name-only --pretty=format:"${fmt}"`,
      { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 },
    );
  } catch {
    // no git repo, skip
    return;
  }

  type Commit = {
    sha: string;
    author: string;
    date: string;
    subject: string;
    body: string;
    files: string[];
  };
  const commits: Commit[] = [];
  for (const block of raw.split("\x1e")) {
    const t = block.trim();
    if (!t) continue;
    const [meta, ...fileLines] = t.split("\n");
    const [sha, author, date, subject, ...bodyParts] = meta.split("\x1f");
    if (!sha) continue;
    if (!date || isNaN(new Date(date).getTime())) continue;
    commits.push({
      sha,
      author,
      date,
      subject: subject ?? "",
      body: bodyParts.join("\x1f"),
      files: fileLines.map((s) => s.trim()).filter(Boolean),
    });
  }

  await updateProgress(projectId, {
    stage: "embedding_git",
    commits: commits.length,
  });
  if (commits.length === 0) return;

  const summaries = commits.map((c) => {
    const files = c.files.slice(0, 8).join(", ");
    return `${c.subject}\n\nFiles: ${files}\n\n${c.body.slice(0, 400)}`;
  });

  const BATCH = 64;
  for (let i = 0; i < summaries.length; i += BATCH) {
    const batch = summaries.slice(i, i + BATCH);
    const slice = commits.slice(i, i + BATCH);
    const vectors = await embedDocuments(batch);
    await db
      .insert(schema.commits)
      .values(
        slice.map((c, idx) => ({
          projectId,
          sha: c.sha,
          author: c.author,
          committedAt: new Date(c.date),
          message: `${c.subject}\n\n${c.body}`.trim(),
          summary: c.subject,
          filePaths: c.files,
          prNumber: extractPrNumber(c.subject, c.body),
          embedding: vectors[idx],
        })),
      )
      .onConflictDoNothing();
    await updateProgress(projectId, {
      commitsEmbedded: Math.min(i + BATCH, commits.length),
    });
  }
}

function extractPrNumber(subject: string, body: string): number | null {
  const m = `${subject}\n${body}`.match(/#(\d{1,6})\b/);
  return m ? Number(m[1]) : null;
}
