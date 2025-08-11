import { IconLink } from "@/components/IconLink";
import { Github, Linkedin } from "lucide-react";
import { SiX } from "react-icons/si";

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
          href="https://www.linkedin.com/in/itakello/"
          label="LinkedIn"
          icon={<Linkedin className="size-4" />}
        />
        <IconLink
          href="https://x.com/itakello"
          label="X"
          icon={<SiX className="size-4" />}
        />
        <IconLink
          href="https://github.com/your-handle"
          label="GitHub"
          icon={<Github className="size-4" />}
        />
      </div>
    </section>
  );
}
