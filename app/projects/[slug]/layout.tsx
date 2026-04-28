import { notFound } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { getProjectBySlug } from "@/lib/data";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  if (project.status !== "ready") {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen">
      <Sidebar
        projectId={project.id}
        projectSlug={project.slug}
        projectName={project.name}
      />
      {children}
    </div>
  );
}
