import "dotenv/config";
import { db, schema } from "@/db/client";
import { embedDocuments } from "@/lib/embed";
import { and, isNull, ne, sql } from "drizzle-orm";

const BATCH = 32;

async function main() {
  const rows = await db
    .select({ id: schema.messages.id, bodyMd: schema.messages.bodyMd })
    .from(schema.messages)
    .where(
      and(
        isNull(schema.messages.embedding),
        ne(schema.messages.bodyMd, ""),
      ),
    );

  if (rows.length === 0) {
    console.log("Nothing to backfill — all non-empty messages already embedded.");
    return;
  }

  console.log(`Backfilling embeddings for ${rows.length} messages…`);

  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const vectors = await embedDocuments(batch.map((r) => r.bodyMd));

    // Update each row with its vector. pgvector needs "[v1,v2,...]" literal.
    for (let j = 0; j < batch.length; j++) {
      const literal = `[${vectors[j].join(",")}]`;
      await db.execute(
        sql`UPDATE messages SET embedding = ${literal}::vector WHERE id = ${batch[j].id}`,
      );
    }

    done += batch.length;
    process.stdout.write(`\r  ${done}/${rows.length}`);
  }
  process.stdout.write("\n");

  // Sanity check
  const remaining = await db
    .select({ id: schema.messages.id })
    .from(schema.messages)
    .where(
      and(
        isNull(schema.messages.embedding),
        ne(schema.messages.bodyMd, ""),
      ),
    );
  console.log(
    `Done. ${rows.length} embedded; ${remaining.length} non-empty messages still missing embeddings.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
