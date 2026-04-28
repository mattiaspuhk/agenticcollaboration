import { notFound } from "next/navigation";
import { db, schema } from "@/db/client";
import { and, eq } from "drizzle-orm";
import { FeatureDashboard } from "@/components/FeatureDashboard";
import { getProjectBySlug } from "@/lib/data";
import type { Role } from "@/lib/tiles";

function parseRole(s: string | undefined): Role {
  if (s === "eng" || s === "user" || s === "pm") return s;
  return "pm";
}

export default async function FeaturePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; feature: string }>;
  searchParams: Promise<{ role?: string }>;
}) {
  const [{ slug, feature: featureKey }, sp] = await Promise.all([
    params,
    searchParams,
  ]);
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

  const role = parseRole(sp.role);

  return <FeatureDashboard featureId={feature.id} role={role} />;
}
