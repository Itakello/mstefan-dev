"use client";

import type { Locale } from "@/lib/i18n/config";
import { DocumentPreview } from "./DocumentPreview";
import { MediaPreview } from "./MediaPreview";
import styles from "./PdfPreview.module.css";

export function PdfPreview({ title, url, filename, locale = "en" }: { title: string; url: string; filename?: string | null; locale?: Locale }) {
  if (!/^(?:\/(?!\/)|https?:\/\/)/i.test(url)) return null;
  return <section className={styles.document} data-pdf-document>
    <h3>{title}</h3>
    <MediaPreview title={title} locale={locale}>{enlarge => <DocumentPreview url={url} title={title} filename={filename} locale={locale} enlarge={enlarge} />}</MediaPreview>
  </section>;
}
