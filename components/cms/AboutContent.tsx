"use client";

import Image from "next/image";
import { useCallback, useRef, useState } from "react";
import { CalendarDays, Download, MapPin, UserRound } from "lucide-react";
import { useLivePreview } from "@payloadcms/live-preview-react";
import { PdfPreview } from "@/components/PdfPreview";
import { BranchTag, RepoToolbar } from "@/components/Branch";
import { CareerGraph, DEFAULT_MAINLINE_COLOR, MAIN_KEY, careerEntryKey } from "@/components/CareerGraph";
import type { Career } from "@/payload-types";
import { withCareerMedia, type CareerContent } from "@/lib/cms/career-media";
import type { Locale } from "@/lib/i18n/config";
import { formatCareerPeriod } from "@/lib/career-timeline";
import { getCopy } from "@/lib/i18n/copy";
import type { PageContent } from "@/lib/cms/types";
import styles from "./AboutContent.module.css";

/** `now` comes from the server render so the graph, periods and hydration agree on one date. */
type Props = { content: PageContent<"about">; career: CareerContent; locale: Locale; now: number };

function CareerPhoto({ src, alt, width, height, locale }: { src: string; alt: string; width: number; height: number; locale: Locale }) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  return <figure className={styles.photo} aria-busy={status === "loading"}>
    <Image src={src} alt={alt} width={width} height={height} unoptimized loading="eager"
      onLoad={() => setStatus("ready")} onError={() => setStatus("error")}
      className={`h-auto w-full ${status === "ready" ? "" : "invisible"}`} />
    {status !== "ready" && <span role="status" className={styles.photoStatus}>{status === "loading"
      ? locale === "it" ? "Caricamento foto…" : "Loading photo…"
      : locale === "it" ? "Foto non disponibile." : "Photo unavailable."}</span>}
  </figure>;
}

export function AboutContent({ content, career, locale, now }: Props) {
  const copy = getCopy(locale);
  const [selectedKey, setSelectedKey] = useState(MAIN_KEY);
  const panel = useRef<HTMLElement>(null);
  const select = useCallback((key: string) => {
    setSelectedKey(key);
    if (panel.current && window.matchMedia("(max-width: 1099px)").matches && panel.current.getBoundingClientRect().top < 0) panel.current.scrollIntoView({ block: "start" });
  }, []);
  const jobs = career.jobs ?? [];
  const selectedJob = jobs.find((job, index) => careerEntryKey(job, index) === selectedKey) ?? null;
  const documents = (selectedJob?.documents ?? []).flatMap((document) => document.file && typeof document.file === "object" && document.file.url && /^(?:\/(?!\/)|https?:\/\/)/i.test(document.file.url) ? [{ ...document, file: { ...document.file, url: document.file.url } }] : []);
  const results = documents.filter((document) => (selectedJob?.branchName === "education/trento-master" && document.file.filename === "master-grades.pdf") || (selectedJob?.branchName === "education/trento-bachelor" && document.file.filename === "bachelor-grades.pdf"));
  // An entry without a story or documents keeps the profile story in view.
  const selected = selectedJob && (selectedJob.summary?.trim() || documents.length) ? selectedJob : null;
  const profilePhoto = content.photo && typeof content.photo === "object" ? content.photo : null;
  const experiencePhoto = selected?.photo && typeof selected.photo === "object" ? selected.photo : null;
  const photo = selected ? experiencePhoto : profilePhoto;
  const photoURL = selected ? photo?.url : photo?.url || "/profile-photo.jpg";
  const imageAlt = selected ? experiencePhoto?.alt || `${selected.company} · ${selected.role}` : content.imageAlt;
  return (
    <div>
      <header className={styles.pageHeader}>
        <h1>{copy.nav.about}</h1>
        <p>{copy.career.intro}</p>
      </header>
      <div className={styles.layout}>
        <CareerGraph career={career} locale={locale} now={now} selectedKey={selectedKey} onSelect={select} />
        <section ref={panel} id="career-story" className={styles.panel} aria-label={selected?.company || copy.nav.about}>
          <RepoToolbar path="career" reference={selected?.branchName ?? "master"} />
          <div className={styles.story} aria-live="polite" aria-atomic="true">
            <div className={styles.column}>
            <article className={styles.text}>
              {selected ? <>
                <BranchTag as="p" name={selected.branchName} color={selected.color} className={styles.branch} />
                <header className={styles.storyHeader}>
                  <h2>{selected.company}</h2>
                  <p className={styles.qualification}>{selected.role}</p>
                  <div className={styles.metadata}>
                    {selected.positionTitle && <span><UserRound size={16} aria-hidden="true" />{selected.positionTitle}</span>}
                    {selected.place && <span><MapPin size={16} aria-hidden="true" />{selected.place}</span>}
                    <span><CalendarDays size={16} aria-hidden="true" />{formatCareerPeriod(selected, locale, now)}</span>
                  </div>
                </header>
                {selected.summary && <p className={styles.summary}>{selected.summary}</p>}
              </> : <>
                <BranchTag as="h2" name="master" color={career.mainlineColor || DEFAULT_MAINLINE_COLOR} className={styles.branch} />
                <p>{content.firstParagraph}</p>
                <p>{content.secondParagraph}</p>
              </>}
            </article>
              {results.map((document) => {
                const file = document.file;
                return <a key={document.id || file.id} href={file.url} download={`massimo-stefan-${selected?.branchName === "education/trento-master" ? "masters" : "bachelors"}-exam-results.pdf`} className={styles.results} aria-label={`${locale === "it" ? "Scarica" : "Download"} ${document.title || file.filename || "PDF"} (PDF)`}><Download size={14} aria-hidden="true" />{locale === "it" ? "Risultati degli esami" : "Exam results"}</a>;
              })}
            </div>
            {photoURL && <CareerPhoto key={photoURL} src={photoURL} alt={imageAlt} width={photo?.width || 1530} height={photo?.height || 2054} locale={locale} />}
          </div>
          {documents.filter((document) => !results.includes(document)).map((document) => {
            const file = document.file;
            return <div key={document.id || file.id} className={styles.document}><PdfPreview title={document.title || file.filename || "PDF"} url={file.url} filename={file.filename} locale={locale} /></div>;
          })}
        </section>
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
  return <AboutContent {...props} career={withCareerMedia(data)} />;
}
