import { cache } from "react";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db/client";

export const getProjectBySlug = cache(async (slug: string) => {
  return db.query.projects.findFirst({
    where: eq(schema.projects.slug, slug),
  });
});

export const getSidebarLists = cache(async (projectId: string) => {
  const [discussions, features] = await Promise.all([
    db.query.discussions.findMany({
      where: and(
        eq(schema.discussions.projectId, projectId),
        ne(schema.discussions.state, "graduated"),
      ),
      orderBy: [desc(schema.discussions.updatedAt)],
      limit: 20,
    }),
    db.query.features.findMany({
      where: eq(schema.features.projectId, projectId),
      orderBy: [desc(schema.features.updatedAt)],
      limit: 30,
    }),
  ]);
  return { discussions, features };
});

export const getDiscussionWithMessages = cache(async (discussionId: string) => {
  const [discussion, messages] = await Promise.all([
    db.query.discussions.findFirst({
      where: eq(schema.discussions.id, discussionId),
    }),
    db.query.messages.findMany({
      where: and(
        eq(schema.messages.threadKind, "discussion"),
        eq(schema.messages.containerId, discussionId),
      ),
      orderBy: [asc(schema.messages.createdAt)],
    }),
  ]);
  return { discussion, messages };
});
