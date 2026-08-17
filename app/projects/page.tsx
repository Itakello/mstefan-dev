import { ProjectCard } from "@/components/ProjectCard";
import { ProjectLayoutGroup, ProjectLayoutItem } from "@/components/ProjectLayoutGroup";
import { loadPublicProjects } from "@/lib/publicProjects";
import { loadWebsiteStack } from "@/lib/websiteStack";

export const metadata = { title: "Projects" };
export const revalidate = 60;

export default async function ProjectsPage() {
  const [{ groups, orderedYears, publication }, stackCatalog] = await Promise.all([
    loadPublicProjects(),
    loadWebsiteStack(),
  ]);

  return (
    <section aria-labelledby="public-projects-heading">
      <h1 id="public-projects-heading" className="text-2xl font-semibold">
        Public projects
      </h1>
      <p className="mt-2 text-black/70 dark:text-white/70 text-sm">
        Active, original repositories. Newest first.
      </p>

      {publication.message && (
        <p
          className="mt-6 rounded-xl border border-black/10 bg-black/[0.03] p-4 text-sm text-black/70 dark:border-white/10 dark:bg-white/5 dark:text-white/70"
          data-project-publication-status={publication.status}
          role={publication.status === "error" || publication.status === "unconfigured" ? "alert" : "status"}
        >
          {publication.message}
        </p>
      )}

      <ProjectLayoutGroup>
        {orderedYears.map((year, yearIndex) => (
          <ProjectLayoutItem key={year} className="mt-8 first:mt-8">
            <h2 className="text-xl font-semibold">{year}</h2>
            <div className="mt-3 border-t border-black/10 dark:border-white/10">
              {groups[year].map((p, projectIndex) => (
                <ProjectCard
                  key={`${year}-${p.title}`}
                  {...p}
                  stackCatalog={stackCatalog.entries}
                  defaultOpen={yearIndex === 0 && projectIndex === 0}
                />
              ))}
            </div>
          </ProjectLayoutItem>
        ))}
      </ProjectLayoutGroup>
    </section>
  );
}
