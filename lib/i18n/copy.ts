import type { Locale } from "./config";

export type PublicPage = "home" | "projects" | "about";

export const publicPagePaths = {
  home: "/",
  projects: "/projects",
  about: "/about",
} as const;

export type PublicPath =
  | (typeof publicPagePaths)[PublicPage]
  | "/websites"
  | "/mail-rules"
  | "/mail-rules/privacy";

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
  projectCard: {
    viewRepository: (title: string) => string;
    viewProject: (title: string) => string;
    technologiesByCategory: (title: string) => string;
    toggleDetails: (title: string, expanded: boolean) => string;
    started: (date: string) => string;
  };
  stack: {
    categories: Record<string, string>;
    projectCategory: string;
    showMore: (count: number, category: string) => string;
    hideMore: (count: number, category: string) => string;
    scrollLeft: string;
    scrollRight: string;
    toolkitTechnologiesByCategory: string;
    technologyList: (names: string) => string;
  };
  publication: {
    projects: Record<"empty" | "unconfigured" | "error", string>;
    stack: Record<"empty" | "unconfigured" | "error", string>;
    toolkitEmpty: string;
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
  notFound: { title: string; description: string; home: string; projects: string };
  work: { types: { Website: string; App: string; Tool: string; Research: string }; previewSize: string; selectorLabel: string; desktop: string; mobile: string; source: string; visit: string; research: string; accomplishments: string; paper: string; slides: string };
  websites: {
    selectSite: (title: string) => string;
    previewTitle: (title: string) => string;
    linkOnly: string;
    unavailable: string;
  };
  about: { title: string; firstParagraph: string; secondParagraph: string; imageAlt: string };
  og: { description: string };
};

export const copy = {
  en: {
    nav: { home: "Home", projects: "Work", about: "About" },
    metadata: {
      home: {
        title: "Massimo Stefan",
        description: "Software engineer building AI systems, agents, and reliable automation.",
      },
      projects: {
        title: "Work",
        description: "Selected websites and software projects by Massimo Stefan.",
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
    projectCard: {
      viewRepository: (title) => `View ${title} repository on GitHub`,
      viewProject: (title) => `Visit ${title} project`,
      technologiesByCategory: (title) => `${title} technologies grouped by category`,
      toggleDetails: (title, expanded) => `${expanded ? "Hide" : "Show"} ${title} details`,
      started: (date) => `Started ${date}`,
    },
    stack: {
      categories: {
        language: "Language",
        framework: "Framework",
        library: "Library",
        runtime: "Runtime",
        database: "Database",
        cloud: "Cloud",
        platform: "Infrastructure",
        infrastructure: "Infrastructure",
        saas: "Integration",
        integration: "Integration",
        cli: "CLI",
      },
      projectCategory: "project",
      showMore: (count, category) => `Show ${count} more ${category} ${count === 1 ? "technology" : "technologies"}`,
      hideMore: (count, category) => `Hide ${count} ${category} ${count === 1 ? "technology" : "technologies"}`,
      scrollLeft: "Scroll technologies left",
      scrollRight: "Scroll technologies right",
      toolkitTechnologiesByCategory: "Toolkit technologies grouped by category",
      technologyList: (names) => `Technologies: ${names}`,
    },
    publication: {
      projects: {
        empty: "No projects are currently approved for publication.",
        unconfigured: "Projects are unavailable because the publication source is not configured.",
        error: "Projects are temporarily unavailable because the publication source could not be loaded.",
      },
      stack: {
        empty: "No Stack items are currently available for publication.",
        unconfigured: "Stack is unavailable because the publication source is not configured.",
        error: "Stack is temporarily unavailable because the publication source could not be loaded.",
      },
      toolkitEmpty: "No Toolkit items are currently approved for website publication.",
    },
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
    projects: { title: "My work", description: "Explore the projects, websites and tools I build." },
    notFound: { title: "This page isn't here.", description: "The link may be broken, or the page may have moved. You can head back home or explore my work.", home: "Go home", projects: "Explore projects" },
    work: { types: { Website: "Website", App: "App", Tool: "Tool", Research: "Research" }, previewSize: "Preview size", selectorLabel: "Choose a project", desktop: "Desktop", mobile: "Mobile", source: "Source code", visit: "Visit website", research: "Research & materials", accomplishments: "Accomplishments", paper: "Paper", slides: "Slides" },
    websites: {
      selectSite: (title) => `Select ${title}`,
      previewTitle: (title) => `Screenshot of ${title}`,
      linkOnly: "Explore the live website in a new tab.",
      unavailable: "Screenshot unavailable. You can still visit the website.",

    },
    about: {
      title: "About",
      firstParagraph: "I’m Massimo Stefan, a software engineer based in Italy. I build agents and automation that connect models to the tools and information people already use.",
      secondParagraph: "I prefer systems with one source of truth, deterministic automation where possible, human approval where it matters, and failures that are visible instead of silent. The point is not to add AI everywhere. It is to remove work without losing control.",
      imageAlt: "Massimo Stefan standing in an elevator, holding a laptop",
    },
    og: { description: "Software engineer building AI systems for real work." },
  },
  it: {
    nav: { home: "Home", projects: "Lavori", about: "Profilo" },
    metadata: {
      home: {
        title: "Massimo Stefan",
        description: "Ingegnere del software: sistemi di IA, agenti e automazioni affidabili.",
      },
      projects: {
        title: "Lavori",
        description: "Siti web e progetti software selezionati di Massimo Stefan.",
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
    projectCard: {
      viewRepository: (title) => `Apri il repository GitHub di ${title}`,
      viewProject: (title) => `Visita il progetto ${title}`,
      technologiesByCategory: (title) => `Tecnologie di ${title} raggruppate per categoria`,
      toggleDetails: (title, expanded) => `${expanded ? "Nascondi" : "Mostra"} i dettagli di ${title}`,
      started: (date) => `Iniziato ${date}`,
    },
    stack: {
      categories: {
        language: "Linguaggio",
        framework: "Framework",
        library: "Libreria",
        runtime: "Runtime",
        database: "Database",
        cloud: "Cloud",
        platform: "Infrastruttura",
        infrastructure: "Infrastruttura",
        saas: "Integrazione",
        integration: "Integrazione",
        cli: "CLI",
      },
      projectCategory: "progetto",
      showMore: (count, category) => count === 1
        ? `Mostra 1 altra tecnologia ${category}`
        : `Mostra altre ${count} tecnologie ${category}`,
      hideMore: (count, category) => `Nascondi ${count} ${count === 1 ? "tecnologia" : "tecnologie"} ${category}`,
      scrollLeft: "Scorri le tecnologie verso sinistra",
      scrollRight: "Scorri le tecnologie verso destra",
      toolkitTechnologiesByCategory: "Strumenti: tecnologie raggruppate per categoria",
      technologyList: (names) => `Tecnologie: ${names}`,
    },
    publication: {
      projects: {
        empty: "Nessun progetto è attualmente approvato per la pubblicazione.",
        unconfigured: "I progetti non sono disponibili perché la fonte di pubblicazione non è configurata.",
        error: "I progetti non sono temporaneamente disponibili perché la fonte di pubblicazione non può essere caricata.",
      },
      stack: {
        empty: "Nessun elemento dello Stack è attualmente disponibile per la pubblicazione.",
        unconfigured: "Lo Stack non è disponibile perché la fonte di pubblicazione non è configurata.",
        error: "Lo Stack non è temporaneamente disponibile perché la fonte di pubblicazione non può essere caricata.",
      },
      toolkitEmpty: "Nessun elemento degli Strumenti è attualmente approvato per la pubblicazione sul sito.",
    },
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
    projects: { title: "I miei lavori", description: "Esplora i progetti, i siti web e gli strumenti che realizzo." },
    notFound: { title: "Questa pagina non c’è.", description: "Il link potrebbe essere errato o la pagina potrebbe essere stata spostata. Puoi tornare alla home o esplorare i miei lavori.", home: "Torna alla home", projects: "Esplora i progetti" },
    work: { types: { Website: "Sito web", App: "App", Tool: "Strumento", Research: "Ricerca" }, previewSize: "Dimensione anteprima", selectorLabel: "Scegli un progetto", desktop: "Desktop", mobile: "Mobile", source: "Codice sorgente", visit: "Visita il sito", research: "Ricerca e materiali", accomplishments: "Risultati", paper: "Paper", slides: "Slide" },
    websites: {
      selectSite: (title) => `Seleziona ${title}`,
      previewTitle: (title) => `Screenshot di ${title}`,
      linkOnly: "Esplora il sito live in una nuova scheda.",
      unavailable: "Screenshot non disponibile. Puoi comunque visitare il sito.",

    },
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

export function projectPublicationMessage(
  locale: Locale,
  status: keyof SiteCopy["publication"]["projects"],
) {
  return getCopy(locale).publication.projects[status];
}

export function stackPublicationMessage(
  locale: Locale,
  status: keyof SiteCopy["publication"]["stack"],
) {
  return getCopy(locale).publication.stack[status];
}
