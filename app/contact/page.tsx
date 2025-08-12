import { IconLink } from "@/components/IconLink";
import { Icon } from "@iconify/react";

export const metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">Contact</h1>
      <p className="text-sm text-black/70 dark:text-white/70">
        I reply quickly. Best channels below.
      </p>
      <div className="flex flex-wrap gap-3">
        <IconLink
          href="mailto:massimo@mstefan.dev"
          label="Email"
          icon={<Icon icon="logos:mailgun-icon" className="size-4" />}
        />
        <IconLink
          href="https://github.com/your-handle"
          label="GitHub"
          icon={<Icon icon="logos:github-icon" className="size-4" />}
        />
        <IconLink
          href="https://www.linkedin.com/in/itakello/"
          label="LinkedIn"
          icon={<Icon icon="logos:linkedin-icon" className="size-4" />}
        />
        <IconLink
          href="https://x.com/itakello"
          label="Twitter / X"
          icon={<Icon icon="logos:x" className="size-4" />}
        />
      </div>
    </section>
  );
}
