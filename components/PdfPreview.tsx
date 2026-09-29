"use client";

import { useState } from "react";
import type { Locale } from "@/lib/i18n/config";
import { DocumentPreview } from "./DocumentPreview";
import styles from "./PdfPreview.module.css";

export function PdfPreview({ title, url, filename, locale = "en" }: { title: string; url: string; filename?: string | null; locale?: Locale }) {
  const [visible, setVisible] = useState(false);
  if (!/^(?:\/(?!\/)|https?:\/\/)/i.test(url)) return null;
  const copy = locale === "it"
    ? { view: "Visualizza PDF", hide: "Chiudi anteprima", download: "Scarica PDF", open: "Apri PDF", preview: "Anteprima PDF" }
    : { view: "View PDF", hide: "Close preview", download: "Download PDF", open: "Open PDF", preview: "PDF preview" };
  return <section className={styles.document} data-pdf-document>
    <h3>{title}</h3>
    <div className={styles.actions}>
      <button type="button" aria-expanded={visible} onClick={() => setVisible(!visible)}>{visible ? copy.hide : copy.view}</button>
      <a href={url} download={filename || true}>{copy.download}</a>
      <a href={url} target="_blank" rel="noopener noreferrer">{copy.open}</a>
    </div>
    {visible && <DocumentPreview url={url} title={title} filename={filename} locale={locale} />}
  </section>;
}
