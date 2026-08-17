import type { Locale } from "./config";

export type PublicPage = "home" | "projects" | "about";

export const publicPagePaths = {
  home: "/",
  projects: "/projects",
  about: "/about",
} as const;

export type PublicPath = (typeof publicPagePaths)[PublicPage];

type SiteCopy = {
  nav: Record<PublicPage, string>;
  metadata: Record<PublicPage, { title: string; description: string }>;
  header: {
    homeLabel: string;
    portraitAlt: string;
    themeToggle: string;
    openNavigation: string;
    closeNavigation: string;
    lightMode: string;
    darkMode: string;
  };
  language: {
    label: string;
    select: string;
    English: string;
    Italiano: string;
    selected: string;
  };
  footer: { rights: string };
  home: {
    eyebrow: string;
    title: string;
    introduction: string;
    projectsAction: string;
    contactAction: string;
    selectedWork: string;
    selectedWorkDescription: string;
    allProjects: string;
    toolkit: string;
    toolkitDescription: string;
  };
  projects: { title: string; description: string };
  about: { title: string; firstParagraph: string; secondParagraph: string; imageAlt: string };
  og: { description: string };
};

export const copy = {
  en: {
    nav: { home: "Home", projects: "Projects", about: "About" },
    metadata: {
      home: {
        title: "Massimo Stefan",
        description: "Software engineer building AI systems, agents, and reliable automation.",
      },
      projects: {
        title: "Projects",
        description: "Selected public software projects by Massimo Stefan.",
      },
      about: {
        title: "About",
        description: "About Massimo Stefan, a software engineer building dependable AI systems.",
      },
    },
    header: {
      homeLabel: "Massimo Stefan home",
      portraitAlt: "Portrait of Massimo Stefan",
      themeToggle: "Toggle theme",
      openNavigation: "Open navigation",
      closeNavigation: "Close navigation",
      lightMode: "Light mode",
      darkMode: "Dark mode",
    },
    language: { label: "Language", select: "Select language", English: "English", Italiano: "Italiano", selected: "Selected" },
    footer: { rights: "All rights reserved." },
    home: {
      eyebrow: "Software engineer · AI systems",
      title: "I build AI systems for real work.",
      introduction: "I’m interested in the layer between a capable model and a useful outcome: tools, state, permissions, evaluation, and the feedback loops that make the system dependable.",
      projectsAction: "See projects",
      contactAction: "Get in touch",
      selectedWork: "Selected work",
      selectedWorkDescription: "A few projects that represent what I build.",
      allProjects: "View all projects",
      toolkit: "Toolkit",
      toolkitDescription: "Tools and technologies I use across my work.",
    },
    projects: { title: "Public projects", description: "Active, original repositories. Newest first." },
    about: {
      title: "About",
      firstParagraph: "I’m Massimo Stefan, a software engineer based in Italy. I build agents and automation that connect models to the tools and information people already use.",
      secondParagraph: "I prefer systems with one source of truth, deterministic automation where possible, human approval where it matters, and failures that are visible instead of silent. The point is not to add AI everywhere. It is to remove work without losing control.",
      imageAlt: "Massimo Stefan standing in an elevator, holding a laptop",
    },
    og: { description: "Software engineer building AI systems for real work." },
  },
  it: {
    nav: { home: "Home", projects: "Progetti", about: "Profilo" },
    metadata: {
      home: {
        title: "Massimo Stefan",
        description: "Ingegnere del software: sistemi di IA, agenti e automazioni affidabili.",
      },
      projects: {
        title: "Progetti",
        description: "Progetti software pubblici selezionati di Massimo Stefan.",
      },
      about: {
        title: "Profilo",
        description: "Profilo di Massimo Stefan, ingegnere del software che realizza sistemi di IA affidabili.",
      },
    },
    header: {
      homeLabel: "Home di Massimo Stefan",
      portraitAlt: "Ritratto di Massimo Stefan",
      themeToggle: "Cambia tema",
      openNavigation: "Apri navigazione",
      closeNavigation: "Chiudi navigazione",
      lightMode: "Tema chiaro",
      darkMode: "Tema scuro",
    },
    language: { label: "Lingua", select: "Seleziona lingua", English: "English", Italiano: "Italiano", selected: "Selezionata" },
    footer: { rights: "Tutti i diritti riservati." },
    home: {
      eyebrow: "Ingegnere del software · sistemi di IA",
      title: "Creo sistemi di IA per il lavoro reale.",
      introduction: "Mi interessa ciò che trasforma un modello capace in un risultato utile: strumenti, stato, permessi, valutazione e i cicli di feedback che rendono il sistema affidabile.",
      projectsAction: "Vedi i progetti",
      contactAction: "Contattami",
      selectedWork: "Lavori selezionati",
      selectedWorkDescription: "Alcuni progetti rappresentativi di ciò che realizzo.",
      allProjects: "Tutti i progetti",
      toolkit: "Strumenti",
      toolkitDescription: "Strumenti e tecnologie che uso nel mio lavoro.",
    },
    projects: { title: "Progetti pubblici", description: "Repository attivi e originali. I più recenti per primi." },
    about: {
      title: "Profilo",
      firstParagraph: "Sono Massimo Stefan, ingegnere del software in Italia. Creo agenti e automazioni che collegano i modelli agli strumenti e alle informazioni già usati dalle persone.",
      secondParagraph: "Preferisco sistemi con un'unica fonte di verità, automazione deterministica dove possibile, approvazione umana dove conta e problemi visibili anziché silenziosi. Il punto non è mettere l'IA ovunque: è eliminare lavoro senza perdere il controllo.",
      imageAlt: "Massimo Stefan in ascensore con un laptop in mano",
    },
    og: { description: "Ingegnere del software: sistemi di IA per il lavoro reale." },
  },
} satisfies Record<Locale, SiteCopy>;

export function getCopy(locale: Locale): SiteCopy {
  return copy[locale];
}
