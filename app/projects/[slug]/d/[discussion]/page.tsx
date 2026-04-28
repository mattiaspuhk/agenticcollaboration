import { notFound } from "next/navigation";
import { DiscussionView, type DiscussionPayload } from "@/components/DiscussionView";
import { getDiscussionWithMessages, getProjectBySlug } from "@/lib/data";

export default async function DiscussionPage({
  params,
}: {
  params: Promise<{ slug: string; discussion: string }>;
}) {
  const { slug, discussion: discussionId } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  const { discussion, messages } = await getDiscussionWithMessages(discussionId);
  if (!discussion || discussion.projectId !== project.id) notFound();

  const initialData: DiscussionPayload = {
    discussion: {
      id: discussion.id,
      projectId: discussion.projectId,
      title: discussion.title,
      state: discussion.state,
      framingState: discussion.framingState,
      graduatedToFeatureId: discussion.graduatedToFeatureId,
    },
    messages: messages.map((m) => ({
      id: m.id,
      authorKind: m.authorKind,
      authorPersona: m.authorPersona,
      authorLabel: m.authorLabel,
      bodyMd: m.bodyMd,
      blocks: m.blocks,
      createdAt: m.createdAt.toISOString(),
    })),
  };

  return (
    <DiscussionView
      discussionId={discussionId}
      projectSlug={slug}
      initialData={initialData}
    />
  );
}
