"use client";

import Image from "next/image";
import { useLivePreview } from "@payloadcms/live-preview-react";
import { Prose } from "@/components/Prose";
import type { PageContent } from "@/lib/cms/types";

type Props = { content: PageContent<"about"> };

export function AboutContent({ content }: Props) {
  const photo = content.photo && typeof content.photo === "object" ? content.photo : null;
  return (
    <section className="grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)] md:items-start md:gap-12">
      <Prose>
        <h1>{content.title}</h1>
        <p>{content.firstParagraph}</p>
        <p>{content.secondParagraph}</p>
      </Prose>

      <figure className="w-full max-w-sm justify-self-center overflow-hidden rounded-2xl border border-black/10 bg-black/[0.03] md:justify-self-end dark:border-white/10 dark:bg-white/5">
        <Image
          src={photo?.url || "/profile-photo.jpg"}
          alt={content.imageAlt}
          width={photo?.width || 1530}
          height={photo?.height || 2054}
          unoptimized
          className="h-auto w-full"
        />
      </figure>
    </section>
  );
}

export function AboutLivePreview({ content }: Props) {
  const { data } = useLivePreview<PageContent<"about">>({
    initialData: content,
    serverURL: typeof window === "undefined" ? "" : window.location.origin,
    depth: 1,
  });
  return <AboutContent content={data} />;
}
