import type { Locale } from "./config";

const mailRulesCopy = {
  en: {
    overview: {
      title: "Mail Rules",
      description: "Information about the personal Mail Rules Gmail automation.",
      introduction:
        "Mail Rules is a personal, locally run tool used by Massimo Stefan to keep Gmail filters and labels aligned with a version-controlled policy.",
      capabilitiesTitle: "What it does",
      capabilities: [
        "Reads the current Gmail labels and filters.",
        "Previews differences before any Gmail setting is changed.",
        "Creates approved labels and filters.",
        "Replaces a conflicting filter only after its replacement has been created and verified.",
        "Shows a small sample of message metadata when testing a rule.",
      ],
      controlTitle: "Control and access",
      control:
        "The tool is not offered to the public. It runs on the owner's computer, serves one Gmail account, and requires explicit approval before it changes Gmail. Unmanaged filters are not deletion candidates.",
      privacyLead: "Read the",
      privacyLink: "Mail Rules privacy policy",
      privacySuffix: "for the data-access, storage, sharing, and deletion practices.",
    },
    privacy: {
      title: "Mail Rules privacy policy",
      description: "How the personal Mail Rules tool accesses and handles Google user data.",
      updated: "Last updated: August 30, 2026.",
      introduction:
        "This policy describes how Mail Rules, a personal tool operated by Massimo Stefan, accesses and handles Google user data.",
      accessTitle: "Google user data accessed",
      accessIntroduction: "Mail Rules requests Gmail permissions to:",
      accessItems: [
        "list, create, and manage Gmail labels;",
        "list, create, and delete Gmail filters;",
        "search for matching messages and read their sender, subject, date, short message-text snippet, thread identifier, and label identifiers for rule previews.",
      ],
      accessBoundary:
        "Mail Rules does not request full message bodies or attachments. A Gmail snippet is a short excerpt of message text.",
      useTitle: "How data is used",
      use:
        "Google user data is used only to compare the owner's approved policy with Gmail, preview proposed changes, apply explicitly approved filter or label changes, and verify the result. The operator does not use it for advertising, profiling, model training, or any unrelated purpose.",
      storageTitle: "Storage and retention",
      storage:
        "Mail Rules runs locally on the owner's computer. It does not operate a server-side mailbox database and does not persist message metadata or snippets. The OAuth client configuration and refresh token are stored in ignored local files and may be backed up in the owner's private 1Password vault.",
      codexHandling:
        "When Mail Rules is invoked through OpenAI Codex, the limited metadata returned by a preview or rule test becomes content in that Codex task and is handled under the OpenAI product and account data controls applicable to the task. Mail Rules does not control or promise OpenAI's retention or training behavior. OAuth client secrets and tokens are never included in those previews.",
      sharingTitle: "Sharing and transfer",
      sharing:
        "The operator does not sell, rent, or share Google user data with advertisers. Limited message metadata is transmitted to OpenAI only when the owner explicitly invokes a preview or rule test through Codex. OAuth credentials may be stored in the owner's private 1Password vault solely for backup.",
      limitedUse:
        "Mail Rules' use and transfer of information received from Google APIs adheres to the Limited Use requirements in the",
      securityTitle: "Security, revocation, and deletion",
      security:
        "Credentials are excluded from version control. Gmail-changing operations are approval-gated, and destructive filter replacement is restricted to one exact, verified conflict. The owner can revoke Google access and delete the local OAuth files and private 1Password backup to remove stored credentials and prevent future access.",
      deletionBoundary:
        "Deleting those credentials does not delete metadata already present in a Codex task. The owner must manage or delete that task separately using the applicable OpenAI controls.",
      contactTitle: "Contact",
      contactLead: "Questions about this policy can be sent to",
      returnLead: "Return to the",
      returnLink: "Mail Rules overview",
    },
  },
  it: {
    overview: {
      title: "Mail Rules",
      description: "Informazioni sull'automazione personale Mail Rules per Gmail.",
      introduction:
        "Mail Rules è uno strumento personale eseguito localmente e usato da Massimo Stefan per mantenere i filtri e le etichette di Gmail allineati a una policy versionata.",
      capabilitiesTitle: "Cosa fa",
      capabilities: [
        "Legge le etichette e i filtri Gmail correnti.",
        "Mostra un'anteprima delle differenze prima di modificare le impostazioni di Gmail.",
        "Crea etichette e filtri approvati.",
        "Sostituisce un filtro in conflitto solo dopo aver creato e verificato il sostituto.",
        "Mostra un piccolo campione di metadati dei messaggi durante il test di una regola.",
      ],
      controlTitle: "Controllo e accesso",
      control:
        "Lo strumento non è offerto al pubblico. Viene eseguito sul computer del proprietario, serve un solo account Gmail e richiede un'approvazione esplicita prima di modificare Gmail. I filtri non gestiti non possono essere eliminati.",
      privacyLead: "Leggi l'",
      privacyLink: "informativa sulla privacy di Mail Rules",
      privacySuffix: "per le pratiche di accesso, conservazione, condivisione ed eliminazione dei dati.",
    },
    privacy: {
      title: "Informativa sulla privacy di Mail Rules",
      description: "Come lo strumento personale Mail Rules accede ai dati utente Google e li gestisce.",
      updated: "Ultimo aggiornamento: 30 agosto 2026.",
      introduction:
        "Questa informativa descrive come Mail Rules, uno strumento personale gestito da Massimo Stefan, accede ai dati utente Google e li tratta.",
      accessTitle: "Dati utente Google consultati",
      accessIntroduction: "Mail Rules richiede autorizzazioni Gmail per:",
      accessItems: [
        "elencare, creare e gestire le etichette Gmail;",
        "elencare, creare ed eliminare i filtri Gmail;",
        "cercare i messaggi corrispondenti e leggere mittente, oggetto, data, un breve estratto testuale, identificativo della conversazione e identificativi delle etichette per le anteprime delle regole.",
      ],
      accessBoundary:
        "Mail Rules non richiede il corpo completo dei messaggi né gli allegati. Lo snippet Gmail è un breve estratto del testo del messaggio.",
      useTitle: "Come vengono usati i dati",
      use:
        "I dati utente Google vengono usati solo per confrontare la policy approvata dal proprietario con Gmail, mostrare le modifiche proposte, applicare modifiche a filtri o etichette esplicitamente approvate e verificarne il risultato. Il gestore non li usa per pubblicità, profilazione, addestramento di modelli o scopi estranei.",
      storageTitle: "Conservazione",
      storage:
        "Mail Rules viene eseguito localmente sul computer del proprietario. Non gestisce un database remoto della casella di posta e non conserva metadati o snippet dei messaggi. La configurazione del client OAuth e il token di aggiornamento sono salvati in file locali esclusi dal controllo versione e possono essere copiati nel vault 1Password privato del proprietario.",
      codexHandling:
        "Quando Mail Rules viene invocato tramite OpenAI Codex, i metadati limitati restituiti da un'anteprima o dal test di una regola diventano contenuto di quel task Codex e sono gestiti secondo i controlli dati del prodotto e dell'account OpenAI applicabili al task. Mail Rules non controlla né promette il comportamento di OpenAI in materia di conservazione o addestramento. I segreti e i token OAuth non vengono mai inclusi nelle anteprime.",
      sharingTitle: "Condivisione e trasferimento",
      sharing:
        "Il gestore non vende, affitta o condivide i dati utente Google con inserzionisti. Metadati limitati dei messaggi vengono trasmessi a OpenAI solo quando il proprietario invoca esplicitamente un'anteprima o il test di una regola tramite Codex. Le credenziali OAuth possono essere conservate nel vault 1Password privato del proprietario esclusivamente come backup.",
      limitedUse:
        "L'uso e il trasferimento delle informazioni ricevute dalle API Google da parte di Mail Rules rispettano i requisiti di Limited Use della",
      securityTitle: "Sicurezza, revoca ed eliminazione",
      security:
        "Le credenziali sono escluse dal controllo versione. Le operazioni che modificano Gmail richiedono approvazione e la sostituzione distruttiva di un filtro è limitata a un singolo conflitto esatto e verificato. Il proprietario può revocare l'accesso Google ed eliminare i file OAuth locali e il backup privato su 1Password per rimuovere le credenziali salvate e impedire accessi futuri.",
      deletionBoundary:
        "L'eliminazione delle credenziali non rimuove i metadati già presenti in un task Codex. Il proprietario deve gestire o eliminare quel task separatamente usando i controlli OpenAI applicabili.",
      contactTitle: "Contatti",
      contactLead: "Le domande su questa informativa possono essere inviate a",
      returnLead: "Torna alla",
      returnLink: "panoramica di Mail Rules",
    },
  },
} as const satisfies Record<Locale, object>;

export function getMailRulesCopy(locale: Locale) {
  return mailRulesCopy[locale];
}
