import fs from "node:fs/promises";
import path from "node:path";
import type { ProjectFacts } from "@/db/schema";

type Pkg = {
  name?: string;
  description?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines?: Record<string, string>;
  packageManager?: string;
};

async function readJson<T>(p: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(p, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function exists(p: string) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function readFirst(p: string, max = 4096) {
  try {
    const raw = await fs.readFile(p, "utf-8");
    return raw.slice(0, max);
  } catch {
    return null;
  }
}

const ALL_DEP_PRETTY = (pkg: Pkg) => ({
  ...(pkg.dependencies ?? {}),
  ...(pkg.devDependencies ?? {}),
});

function pickVersion(deps: Record<string, string>, name: string) {
  const v = deps[name];
  if (!v) return null;
  return v.replace(/^[\^~]/, "");
}

function detectFrameworks(deps: Record<string, string>) {
  const out: string[] = [];
  const map: Array<[string, string]> = [
    ["next", "Next.js"],
    ["react", "React"],
    ["vue", "Vue"],
    ["nuxt", "Nuxt"],
    ["@sveltejs/kit", "SvelteKit"],
    ["svelte", "Svelte"],
    ["astro", "Astro"],
    ["@remix-run/react", "Remix"],
    ["@nestjs/core", "NestJS"],
    ["express", "Express"],
    ["fastify", "Fastify"],
    ["hono", "Hono"],
    ["@trpc/server", "tRPC"],
    ["@tanstack/react-query", "TanStack Query"],
    ["@tanstack/react-router", "TanStack Router"],
  ];
  for (const [pkg, label] of map) {
    const v = pickVersion(deps, pkg);
    if (v) out.push(`${label} ${v}`);
  }
  return out;
}

function detectOrm(deps: Record<string, string>) {
  const m: Array<[string, string]> = [
    ["drizzle-orm", "Drizzle"],
    ["@prisma/client", "Prisma"],
    ["prisma", "Prisma"],
    ["typeorm", "TypeORM"],
    ["sequelize", "Sequelize"],
    ["kysely", "Kysely"],
    ["mongoose", "Mongoose"],
    ["mikro-orm", "MikroORM"],
  ];
  for (const [pkg, label] of m) {
    const v = pickVersion(deps, pkg);
    if (v) return `${label} ${v}`;
  }
  return undefined;
}

function detectDatabase(deps: Record<string, string>) {
  if (deps["@neondatabase/serverless"]) return "PostgreSQL (Neon serverless)";
  if (deps["@planetscale/database"]) return "MySQL (PlanetScale)";
  if (deps["postgres"] || deps["pg"]) return "PostgreSQL";
  if (deps["mysql2"] || deps["mysql"]) return "MySQL";
  if (deps["better-sqlite3"] || deps["sqlite3"]) return "SQLite";
  if (deps["mongodb"] || deps["mongoose"]) return "MongoDB";
  if (deps["@libsql/client"]) return "libSQL/Turso";
  return undefined;
}

function detectTesting(deps: Record<string, string>) {
  const out: string[] = [];
  for (const [pkg, label] of [
    ["vitest", "Vitest"],
    ["jest", "Jest"],
    ["mocha", "Mocha"],
    ["@playwright/test", "Playwright"],
    ["cypress", "Cypress"],
  ] as const) {
    if (pickVersion(deps, pkg)) out.push(label);
  }
  return out;
}

function detectLinting(deps: Record<string, string>) {
  const out: string[] = [];
  if (deps["eslint"]) out.push("ESLint");
  if (deps["@biomejs/biome"]) out.push("Biome");
  if (deps["prettier"]) out.push("Prettier");
  return out;
}

function detectStyling(deps: Record<string, string>) {
  const out: string[] = [];
  if (deps["tailwindcss"]) out.push(`Tailwind ${pickVersion(deps, "tailwindcss")}`);
  if (deps["styled-components"]) out.push("styled-components");
  if (deps["@emotion/react"]) out.push("Emotion");
  if (deps["sass"]) out.push("Sass");
  return out;
}

async function detectPackageManager(root: string, pkg: Pkg | null) {
  if (pkg?.packageManager) return pkg.packageManager;
  if (await exists(path.join(root, "bun.lock"))) return "bun";
  if (await exists(path.join(root, "bun.lockb"))) return "bun";
  if (await exists(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (await exists(path.join(root, "yarn.lock"))) return "yarn";
  if (await exists(path.join(root, "package-lock.json"))) return "npm";
  return undefined;
}

async function listTopLevelDirs(root: string) {
  const SKIP = new Set([
    "node_modules", ".git", ".next", "dist", "build", "out",
    ".turbo", ".cache", "coverage", "__pycache__", ".venv",
  ]);
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !SKIP.has(e.name) && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

async function detectKeyConfigs(root: string) {
  const candidates = [
    "next.config.ts", "next.config.js", "next.config.mjs",
    "vite.config.ts", "vite.config.js",
    "astro.config.mjs", "astro.config.ts",
    "nuxt.config.ts",
    "svelte.config.js",
    "drizzle.config.ts", "drizzle.config.js",
    "prisma/schema.prisma",
    "tsconfig.json",
    "tailwind.config.ts", "tailwind.config.js",
    "biome.json", "biome.jsonc",
    "eslint.config.mjs", "eslint.config.js", ".eslintrc.json",
    "vitest.config.ts", "playwright.config.ts",
    "Cargo.toml", "go.mod", "pyproject.toml", "requirements.txt",
  ];
  const found: string[] = [];
  for (const c of candidates) {
    if (await exists(path.join(root, c))) found.push(c);
  }
  return found;
}

async function detectLanguages(root: string, pkg: Pkg | null, configs: string[]) {
  const langs = new Set<string>();
  if (pkg) langs.add(configs.includes("tsconfig.json") ? "TypeScript" : "JavaScript");
  if (configs.includes("Cargo.toml")) langs.add("Rust");
  if (configs.includes("go.mod")) langs.add("Go");
  if (configs.includes("pyproject.toml") || configs.includes("requirements.txt")) {
    langs.add("Python");
  }
  return [...langs];
}

async function detectRuntime(root: string, pkg: Pkg | null) {
  if (pkg?.engines?.node) return `Node ${pkg.engines.node}`;
  if (pkg?.engines?.bun) return `Bun ${pkg.engines.bun}`;
  const nvm = await readFirst(path.join(root, ".nvmrc"), 64);
  if (nvm) return `Node ${nvm.trim()}`;
  const pyver = await readFirst(path.join(root, ".python-version"), 64);
  if (pyver) return `Python ${pyver.trim()}`;
  return undefined;
}

function detectDescription(pkg: Pkg | null) {
  return pkg?.description;
}

export async function extractProjectFacts(root: string): Promise<ProjectFacts> {
  const pkg = await readJson<Pkg>(path.join(root, "package.json"));
  const deps = pkg ? ALL_DEP_PRETTY(pkg) : {};
  const configs = await detectKeyConfigs(root);
  const notes: string[] = [];

  if (configs.includes("drizzle.config.ts") && !deps["drizzle-orm"]) {
    notes.push("drizzle.config.ts present but drizzle-orm not in deps");
  }

  return {
    name: pkg?.name,
    description: detectDescription(pkg),
    languages: await detectLanguages(root, pkg, configs),
    runtime: await detectRuntime(root, pkg),
    packageManager: await detectPackageManager(root, pkg),
    frameworks: detectFrameworks(deps),
    orm: detectOrm(deps),
    database: detectDatabase(deps),
    testing: detectTesting(deps),
    linting: detectLinting(deps),
    styling: detectStyling(deps),
    keyConfigs: configs,
    topLevelDirs: await listTopLevelDirs(root),
    notes,
    detectedAt: new Date().toISOString(),
  };
}

export function formatProjectFacts(f: ProjectFacts): string {
  const lines: string[] = ["## Project facts (auto-detected at ingest)"];
  if (f.name) lines.push(`- Name: ${f.name}`);
  if (f.description) lines.push(`- Description: ${f.description}`);
  if (f.languages.length) lines.push(`- Languages: ${f.languages.join(", ")}`);
  if (f.runtime) lines.push(`- Runtime: ${f.runtime}`);
  if (f.packageManager) lines.push(`- Package manager: ${f.packageManager}`);
  if (f.frameworks.length) lines.push(`- Frameworks: ${f.frameworks.join(", ")}`);
  if (f.orm) lines.push(`- ORM: ${f.orm}`);
  if (f.database) lines.push(`- Database: ${f.database}`);
  if (f.styling.length) lines.push(`- Styling: ${f.styling.join(", ")}`);
  if (f.testing.length) lines.push(`- Testing: ${f.testing.join(", ")}`);
  if (f.linting.length) lines.push(`- Linting: ${f.linting.join(", ")}`);
  if (f.topLevelDirs.length)
    lines.push(`- Top-level dirs: ${f.topLevelDirs.join(", ")}`);
  if (f.keyConfigs.length)
    lines.push(`- Key configs: ${f.keyConfigs.join(", ")}`);
  if (f.notes.length) lines.push(`- Notes: ${f.notes.join("; ")}`);
  return lines.join("\n");
}
