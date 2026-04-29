import "dotenv/config";
import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = neon(url);

  await sql`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "github_repo" text`;
  await sql`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "default_branch" text DEFAULT 'main' NOT NULL`;

  console.log("projects.github_repo + default_branch ready");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
