import { ProjectCard } from "@/components/ProjectCard";
import { ProjectLayoutGroup, ProjectLayoutItem } from "@/components/ProjectLayoutGroup";
import { StackCatalog } from "@/components/StackCatalog";
import { loadPublicProjects } from "@/lib/publicProjects";
import { loadWebsiteStack } from "@/lib/websiteStack";

export const metadata = { title: "Projects" };
export const revalidate = 60;

export default async function ProjectsPage() {
  const [{ groups, orderedYears, publication }, stackCatalog] = await Promise.all([
    loadPublicProjects(),
    loadWebsiteStack(),
  ]);
  const toolkitEntries = stackCatalog.entries.filter((entry) => entry.websiteVisible);
  const toolkitMessage = stackCatalog.message
    ?? (toolkitEntries.length === 0 ? "No Toolkit items are currently approved for website publication." : null);

  return (
    <section>
      <h1 className="text-2xl font-semibold">Public projects</h1>
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

      <section className="mt-8 border-y border-black/10 py-5 dark:border-white/10">
        <div>
          <h2 className="text-xl font-semibold">Toolkit</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-black/60 dark:text-white/60">
            Tools and technologies I use across my work.
          </p>
        </div>
        <div className="mt-4">
          {toolkitMessage ? (
            <p
              className="rounded-lg border border-black/10 bg-black/[0.025] p-4 text-sm text-black/65 dark:border-white/10 dark:bg-white/[0.035] dark:text-white/65"
              data-stack-publication-status={stackCatalog.status}
              role={stackCatalog.status === "error" || stackCatalog.status === "unconfigured" ? "alert" : "status"}
            >
              {toolkitMessage}
            </p>
          ) : (
            <StackCatalog entries={toolkitEntries} />
          )}
        </div>
      </section>

      <section className="mt-10" aria-labelledby="public-projects-heading">
        <h2 id="public-projects-heading" className="text-xl font-semibold">
          Projects
        </h2>
        <ProjectLayoutGroup>
          {orderedYears.map((year, yearIndex) => (
            <ProjectLayoutItem key={year} className="mt-8 first:mt-6">
              <h3 className="text-xl font-semibold">{year}</h3>
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
    </section>
  );
}
