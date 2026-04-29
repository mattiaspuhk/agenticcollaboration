import { notFound } from "next/navigation";
import { db, schema } from "@/db/client";
import { and, eq } from "drizzle-orm";
import { CodeDiffView } from "@/components/CodeDiffView";
import { getProjectBySlug } from "@/lib/data";

export default async function RunPage({
  params,
}: {
  params: Promise<{ slug: string; feature: string; runId: string }>;
}) {
  const { slug, feature: featureKey, runId } = await params;

  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      featureKey,
    );
  const feature = await db.query.features.findFirst({
    where: and(
      eq(schema.features.projectId, project.id),
      isUuid
        ? eq(schema.features.id, featureKey)
        : eq(schema.features.slug, featureKey),
    ),
  });
  if (!feature) notFound();

  const run = await db.query.codeRuns.findFirst({
    where: and(
      eq(schema.codeRuns.id, runId),
      eq(schema.codeRuns.featureId, feature.id),
    ),
  });
  if (!run) notFound();

  return (
    <CodeDiffView
      runId={runId}
      projectSlug={slug}
      featureKey={featureKey}
    />
  );
}
