"use client";

import { FieldLabel, useLocale } from "@payloadcms/ui";
import type { FieldLabelClientProps } from "payload";

const labels: Record<string, { en: string; it: string }> = {
  eyebrow: { en: "Eyebrow", it: "Sopratitolo" },
  title: { en: "Title", it: "Titolo" },
  introduction: { en: "Introduction", it: "Introduzione" },
  projectsAction: { en: "Projects button", it: "Pulsante progetti" },
  contactAction: { en: "Contact button", it: "Pulsante contatti" },
  selectedWork: { en: "Selected work", it: "Lavori selezionati" },
  selectedWorkDescription: { en: "Selected work description", it: "Descrizione dei lavori selezionati" },
  allProjects: { en: "All projects link", it: "Link a tutti i progetti" },
  toolkit: { en: "Toolkit", it: "Strumenti" },
  toolkitDescription: { en: "Toolkit description", it: "Descrizione degli strumenti" },
  firstParagraph: { en: "First paragraph", it: "Primo paragrafo" },
  secondParagraph: { en: "Second paragraph", it: "Secondo paragrafo" },
  photo: { en: "Photo", it: "Foto" },
  imageAlt: { en: "Image description", it: "Descrizione dell’immagine" },
};

export function LocalizedFieldLabel(props: FieldLabelClientProps) {
  const locale = useLocale();
  const name = (props.field && "name" in props.field ? props.field.name : undefined) ?? props.path ?? "";
  const required = props.required ?? (props.field && "required" in props.field ? props.field.required : false);
  return <FieldLabel {...props} required={required} label={labels[name]?.[locale.code === "it" ? "it" : "en"] ?? props.label} hideLocale />;
}
