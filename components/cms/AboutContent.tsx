"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import { Download } from "lucide-react";
import { useLivePreview } from "@payloadcms/live-preview-react";
import { Prose } from "@/components/Prose";
import { PdfPreview } from "@/components/PdfPreview";
import { BranchIcon, CareerGraph } from "@/components/CareerGraph";
import type { Career } from "@/payload-types";
import type { Locale } from "@/lib/i18n/config";
import { getCopy } from "@/lib/i18n/copy";
import type { PageContent } from "@/lib/cms/types";
import styles from "./AboutContent.module.css";

type Job = NonNullable<Career["jobs"]>[number];
type Props = { content: PageContent<"about">; career: Career; locale: Locale };

export function AboutContent({ content, career, locale }: Props) {
  const [selectedJob, setSelected] = useState<Job | null>(null);
  const select = useCallback((job: Job | null) => setSelected(job), []);
  const documents = (selectedJob?.documents ?? []).filter((document) => document.file && typeof document.file === "object" && document.file.url && /^(?:\/(?!\/)|https?:\/\/)/i.test(document.file.url));
  const results = documents.filter((document) => typeof document.file === "object" && ((selectedJob?.branchName === "education/trento-master" && document.file?.filename === "master-grades.pdf") || (selectedJob?.branchName === "education/trento-bachelor" && document.file?.filename === "bachelor-grades.pdf")));
  const selected = selectedJob && (selectedJob.summary?.trim() || documents.length) ? selectedJob : null;
  const profilePhoto = content.photo && typeof content.photo === "object" ? content.photo : null;
  const experiencePhoto = selected?.summary?.trim() && selected.photo && typeof selected.photo === "object" ? selected.photo : null;
  const photo = selected ? experiencePhoto : profilePhoto;
  const photoURL = selected ? photo?.url : photo?.url || "/profile-photo.jpg";
  const imageAlt = selected ? experiencePhoto?.alt || `${selected.company} · ${selected.role}` : content.imageAlt;
  const readStory = locale === "it" ? "Leggi la storia" : "Read story";
  const viewDocuments = locale === "it" ? "Vedi i documenti" : "View documents";
  return (
    <div className={styles.layout}>
      <section id="career-story" className={styles.story} aria-label={selected?.company || getCopy(locale).nav.about}>
        <div aria-live="polite" aria-atomic="true">
          <Prose>
            {selected ? <>
              <p className={styles.branch} style={{ color: selected.color }}><BranchIcon /><span>{selected.branchName}</span></p>
              <h1>{selected.company}</h1>
              <p className={styles.metadata}><span>{selected.role}</span>{results.map((document) => {
                const file = document.file;
                if (!file || typeof file !== "object" || !file.url) return null;
                return <a key={document.id || file.id} href={file.url} download={file.filename} className={styles.results} aria-label={`${locale === "it" ? "Scarica" : "Download"} ${document.title} (PDF)`}><Download size={14} aria-hidden="true" />{locale === "it" ? "Risultati" : "Results"}</a>;
              })}</p>
              {selected.summary && <p className={styles.summary}>{selected.summary}</p>}
            </> : <>
              <h1 className={styles.branch} style={{ color: career.mainlineColor || "#25b8f3" }}><BranchIcon /><span>master</span></h1>
              <p>{content.firstParagraph}</p>
              <p>{content.secondParagraph}</p>
            </>}
          </Prose>
        </div>
        {photoURL && <figure className={styles.photo}>
          <Image src={photoURL} alt={imageAlt} width={photo?.width || 1530} height={photo?.height || 2054} unoptimized className="h-auto w-full" />
        </figure>}
        {documents.filter((document) => !results.includes(document)).map((document) => {
          const file = document.file;
          if (!file || typeof file !== "object" || !file.url || !/^(?:\/(?!\/)|https?:\/\/)/i.test(file.url)) return null;
          return <PdfPreview key={document.id || file.id} title={document.title} url={file.url} filename={file.filename} locale={locale} />;
        })}
      </section>
      <div className={styles.explorer}>
        <CareerGraph career={career} locale={locale} expanded showDetails={false} onSelectionChange={select} />
        {selected && <a className={styles.readStory} href="#career-story">{selected.company} · {selected.summary?.trim() ? readStory : viewDocuments}</a>}
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
