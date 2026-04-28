import "dotenv/config";
import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = neon(url);
  await sql`
    CREATE TABLE IF NOT EXISTS "code_runs" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "feature_id" uuid NOT NULL REFERENCES "features"("id") ON DELETE CASCADE,
      "status" text DEFAULT 'running' NOT NULL,
      "branch_name" text NOT NULL,
      "base_branch" text DEFAULT 'main' NOT NULL,
      "base_sha" text,
      "pr_title" text,
      "pr_body" text,
      "pr_number" integer,
      "pr_url" text,
      "agent_message_id" uuid,
      "changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
      "log" jsonb DEFAULT '[]'::jsonb NOT NULL,
      "error_message" text,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "finished_at" timestamp
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS "code_runs_feature_idx" ON "code_runs" ("feature_id","created_at")`;
  console.log("code_runs ready");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
