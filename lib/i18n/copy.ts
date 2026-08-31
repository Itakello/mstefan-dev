import type { Locale } from "./config";

export type PublicPage = "home" | "projects" | "websites" | "about";

export const publicPagePaths = {
  home: "/",
  projects: "/projects",
  websites: "/websites",
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
  projectCard: {
    viewRepository: (title: string) => string;
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
    projects: Record<"empty" | "no-active" | "unconfigured" | "stale" | "error", string>;
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
  websites: {
    title: string;
    description: string;
    selectorLabel: string;
    openSite: (title: string) => string;
    previewTitle: (title: string) => string;
    loading: string;
    previewHelp: string;
    linkOnly: string;
    depthLimit: string;
    entries: Record<"mstefan" | "karakal", { name: string; description: string }>;
  };
  about: { title: string; firstParagraph: string; secondParagraph: string; imageAlt: string };
  og: { description: string };
};

export const copy = {
  en: {
    nav: { home: "Home", projects: "Projects", websites: "Websites", about: "About" },
    metadata: {
      home: {
        title: "Massimo Stefan",
        description: "Software engineer building AI systems, agents, and reliable automation.",
      },
      projects: {
        title: "Projects",
        description: "Selected public software projects by Massimo Stefan.",
      },
      websites: {
        title: "Websites",
        description: "Websites designed and built by Massimo Stefan.",
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
        saas: "Integration",
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
        "no-active": "No active public projects are currently approved for publication.",
        unconfigured: "Projects are unavailable because the publication source is not configured.",
        stale: "Project publication cannot be refreshed because repository data is unavailable.",
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
    projects: { title: "Public projects", description: "Active, original repositories. Newest first." },
    websites: {
      title: "Websites you can explore",
      description: "Explore my site here, or open the other websites in a new tab. The first one even contains this page, so you can keep going—within reason.",
      selectorLabel: "Choose a website to explore",
      openSite: (title) => `Open ${title} in a new tab`,
      previewTitle: (title) => `Interactive preview of ${title}`,
      loading: "Preparing the live preview…",
      previewHelp: "This is the live website, not a recording. If it does not load here, open the full site instead.",
      linkOnly: "Visit the live website in a new tab.",
      depthLimit: "You reached the third website inside the website. The live preview stops here so the recursion stays intentional.",
      entries: {
        mstefan: {
          name: "mstefan.dev",
          description: "My personal website for projects, tools, and the systems I build.",
        },
        karakal: {
          name: "The Karakal Times",
          description: "An independent publication with a custom editorial workflow and multilingual site.",
        },
      },
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
    nav: { home: "Home", projects: "Progetti", websites: "Siti web", about: "Profilo" },
    metadata: {
      home: {
        title: "Massimo Stefan",
        description: "Ingegnere del software: sistemi di IA, agenti e automazioni affidabili.",
      },
      projects: {
        title: "Progetti",
        description: "Progetti software pubblici selezionati di Massimo Stefan.",
      },
      websites: {
        title: "Siti web",
        description: "Siti web progettati e realizzati da Massimo Stefan.",
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
        saas: "Integrazione",
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
        "no-active": "Nessun repository pubblico attivo è attualmente approvato per la pubblicazione.",
        unconfigured: "I progetti non sono disponibili perché la fonte di pubblicazione non è configurata.",
        stale: "La pubblicazione dei progetti non può essere aggiornata perché i dati dei repository non sono disponibili.",
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
    projects: { title: "Progetti pubblici", description: "Repository attivi e originali. I più recenti per primi." },
    websites: {
      title: "Siti web da esplorare",
      description: "Esplora qui il mio sito, oppure apri gli altri siti in una nuova scheda. Il primo contiene anche questa pagina, quindi puoi continuare—entro certi limiti.",
      selectorLabel: "Scegli un sito web da esplorare",
      openSite: (title) => `Apri ${title} in una nuova scheda`,
      previewTitle: (title) => `Anteprima interattiva di ${title}`,
      loading: "Preparo l'anteprima live…",
      previewHelp: "Questo è il sito live, non una registrazione. Se qui non si carica, apri il sito completo.",
      linkOnly: "Visita il sito live in una nuova scheda.",
      depthLimit: "Hai raggiunto il terzo sito dentro il sito. L'anteprima live si ferma qui, così la ricorsione resta intenzionale.",
      entries: {
        mstefan: {
          name: "mstefan.dev",
          description: "Il mio sito personale per progetti, strumenti e sistemi che costruisco.",
        },
        karakal: {
          name: "The Karakal Times",
          description: "Una pubblicazione indipendente con un flusso editoriale su misura e un sito multilingue.",
        },
      },
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
