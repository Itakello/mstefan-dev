"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import { useLivePreview } from "@payloadcms/live-preview-react";
import { Prose } from "@/components/Prose";
import { PdfPreview } from "@/components/PdfPreview";
import { CareerGraph } from "@/components/CareerGraph";
import type { Career } from "@/payload-types";
import type { Locale } from "@/lib/i18n/config";
import type { PageContent } from "@/lib/cms/types";
import styles from "./AboutContent.module.css";

type Job = NonNullable<Career["jobs"]>[number];
type Props = { content: PageContent<"about">; career: Career; locale: Locale };

export function AboutContent({ content, career, locale }: Props) {
  const [selectedJob, setSelected] = useState<Job | null>(null);
  const select = useCallback((job: Job | null) => setSelected(job), []);
  const documents = (selectedJob?.documents ?? []).filter((document) => document.file && typeof document.file === "object" && document.file.url);
  const selected = selectedJob && (selectedJob.summary?.trim() || documents.length) ? selectedJob : null;
  const profilePhoto = content.photo && typeof content.photo === "object" ? content.photo : null;
  const experiencePhoto = selected?.photo && typeof selected.photo === "object" ? selected.photo : null;
  const photo = selected ? experiencePhoto : profilePhoto;
  const photoURL = selected ? photo?.url : photo?.url || "/profile-photo.jpg";
  const imageAlt = selected ? experiencePhoto?.alt || `${selected.company} · ${selected.role}` : content.imageAlt;
  const readStory = locale === "it" ? "Leggi la storia ↑" : "Read story ↑";
  return (
    <div className={styles.layout}>
      <section id="career-story" className={styles.story} aria-label={selected?.company || content.title}>
        <div aria-live="polite" aria-atomic="true">
          <Prose>
            {selected ? <>
              <p className={styles.branch} style={{ color: selected.color }}>{selected.branchName}</p>
              <h1>{selected.company}</h1>
              <p>{selected.role}</p>
              {selected.summary && <p className={styles.summary}>{selected.summary}</p>}
            </> : <>
              <h1 className={styles.branch} style={{ color: career.mainlineColor || "#25b8f3" }}>main</h1>
              <p>{content.firstParagraph}</p>
              <p>{content.secondParagraph}</p>
            </>}
          </Prose>
        </div>
        {photoURL && <figure className={styles.photo}>
          <Image src={photoURL} alt={imageAlt} width={photo?.width || 1530} height={photo?.height || 2054} unoptimized className="h-auto w-full" />
        </figure>}
        {documents.map((document) => document.file && typeof document.file === "object" && document.file.url && <PdfPreview key={document.id || document.file.id} title={document.title} url={document.file.url} filename={document.file.filename} locale={locale} />)}
      </section>
      <div className={styles.explorer}>
        <CareerGraph career={career} locale={locale} expanded showDetails={false} onSelectionChange={select} />
        {selectedJob?.summary?.trim() && <a className={styles.readStory} href="#career-story">{selected?.company || (locale === "it" ? "Profilo" : "Profile")} · {readStory}</a>}
      </div>
    </div>
  );
}

export function AboutLivePreview(props: Props) {
  const { data } = useLivePreview<PageContent<"about">>({ initialData: props.content, serverURL: typeof window === "undefined" ? "" : window.location.origin, depth: 1 });
  return <AboutContent {...props} content={data} />;
}

export function AboutCareerLivePreview(props: Props) {
  const { data } = useLivePreview<Career>({ initialData: props.career, serverURL: typeof window === "undefined" ? "" : window.location.origin, depth: 1 });
  return <AboutContent {...props} career={data} />;
}
