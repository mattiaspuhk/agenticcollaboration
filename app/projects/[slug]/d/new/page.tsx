import { notFound, redirect } from "next/navigation";
import { db, schema } from "@/db/client";
import { getProjectBySlug } from "@/lib/data";

export default async function NewDiscussionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();
  const stamp = new Date().toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const [d] = await db
    .insert(schema.discussions)
    .values({
      projectId: project.id,
      title: `Discovery · ${stamp}`,
      state: "open",
    })
    .returning();
  redirect(`/projects/${slug}/d/${d.id}`);
}
