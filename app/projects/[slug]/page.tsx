import { notFound } from "next/navigation";
import { db, schema } from "@/db/client";
import { and, desc, eq, ne, inArray } from "drizzle-orm";
import { ProjectHome } from "@/components/ProjectHome";
import { LandingPanels } from "@/components/LandingPanels";
import { getProjectBySlug } from "@/lib/data";

type StatusPayload = {
  headline?: string;
  tone?: "ok" | "warn" | "err";
};

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  if (project.status !== "ready") {
    return (
      <ProjectHome
        slug={project.slug}
        name={project.name}
        rootPath={project.rootPath}
        docsPaths={project.docsPaths}
        initialStatus={project.status}
        initialProgress={project.ingestProgress}
        ingestError={project.ingestError ?? null}
      />
    );
  }

  const [discussions, features] = await Promise.all([
    db.query.discussions.findMany({
      where: and(
        eq(schema.discussions.projectId, project.id),
        ne(schema.discussions.state, "graduated"),
      ),
      orderBy: [desc(schema.discussions.updatedAt)],
      limit: 12,
    }),
    db.query.features.findMany({
      where: eq(schema.features.projectId, project.id),
      orderBy: [desc(schema.features.updatedAt)],
      limit: 12,
    }),
  ]);

  const statusSignals = features.length
    ? await db.query.featureSignals.findMany({
        where: and(
          inArray(
            schema.featureSignals.featureId,
            features.map((f) => f.id),
          ),
          eq(schema.featureSignals.role, "pm"),
          eq(schema.featureSignals.tileKind, "StatusTile"),
        ),
      })
    : [];

  const statusByFeature = new Map<string, StatusPayload>();
  for (const s of statusSignals) {
    statusByFeature.set(s.featureId, s.payload as StatusPayload);
  }

  const featureSummaries = features.map((f) => {
    const status = statusByFeature.get(f.id);
    return {
      id: f.id,
      title: f.title,
      slug: f.slug,
      status: f.status,
      framedProblem: f.discoveryDigest?.framedProblem ?? null,
      statusHeadline: status?.headline ?? f.statusNote ?? null,
      statusTone: status?.tone ?? null,
      updatedAt: f.updatedAt.toISOString(),
      lastSummaryAt: f.lastAgentSummaryAt?.toISOString() ?? null,
    };
  });

  const discussionSummaries = discussions.map((d) => ({
    id: d.id,
    title: d.title,
    state: d.state as "open" | "dropped",
    converged: d.framingState?.converged ?? false,
    reason: d.framingState?.reason ?? null,
    updatedAt: d.updatedAt.toISOString(),
  }));

  return (
    <main className="flex-1 overflow-y-auto bg-[var(--background)]">
      <LandingPanels
        projectSlug={slug}
        projectName={project.name}
        features={featureSummaries}
        discussions={discussionSummaries}
      />
    </main>
  );
}
