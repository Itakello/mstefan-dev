import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

type Observation = {
  version: 1;
  success: number;
  failure: number;
  event: number;
  pending: number;
  digest: string;
  projects: number;
  stack: number;
};
type Event = { kind: "event" | "success" | "failure"; startedAt?: number; digest?: string; projects?: number; stack?: number };
let writing = Promise.resolve();
let generation = 0;

export function publicationGeneration() { return generation; }

export function publicationMetrics(state: Observation) {
  const values = {
    last_success_timestamp_seconds: state.success / 1000,
    refresh_failed: Number(state.failure > state.success),
    pending_event_timestamp_seconds: state.pending / 1000,
    projects: state.projects,
    stack: state.stack,
  };
  return Object.entries(values).map(([key, value]) => `website_publication_${key} ${value}\n`).join("");
}

export function observePublication(event: Event, directory = join(process.env.PAYLOAD_DATA_DIR ?? "/data", "publication-health")) {
  const at = event.startedAt ?? Date.now();
  if (event.kind === "event") generation++;
  // One production process owns the SQLite volume and this aggregate observation.
  writing = writing.catch(() => undefined).then(async () => {
    let state: Observation = { version: 1, success: 0, failure: 0, event: 0, pending: 0, digest: "", projects: 0, stack: 0 };
    try {
      const stored = JSON.parse(await readFile(join(directory, "state.json"), "utf8"));
      if (stored.version !== 1 || ![stored.success, stored.failure, stored.event, stored.pending, stored.projects, stored.stack].every(
        (value) => typeof value === "number" && Number.isFinite(value) && value >= 0,
      ) || !/^(?:[a-f0-9]{64})?$/.test(stored.digest)) throw new Error("Invalid publication observation");
      state = stored;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (!Number.isFinite(at) || at <= 0) throw new Error("Invalid publication observation time");
    if (event.kind === "event") {
      state.event = Math.max(state.event, at);
      if (at > state.success) state.pending = state.pending ? Math.min(state.pending, at) : at;
    }
    if (event.kind === "failure") state.failure = Math.max(state.failure, at);
    if (event.kind === "success" && at >= state.success) {
      if (!/^[a-f0-9]{64}$/.test(event.digest ?? "") || ![event.projects, event.stack].every(
        (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0,
      )) throw new Error("Invalid successful publication observation");
      state.success = at;
      state.digest = event.digest!;
      state.projects = event.projects!;
      state.stack = event.stack!;
      if (at >= state.event) state.pending = 0;
    }
    await mkdir(directory, { recursive: true });
    for (const [name, body, mode] of [
      ["state.json", JSON.stringify(state), 0o600],
      ["metrics.prom", publicationMetrics(state), 0o644],
    ] as const) {
      await writeFile(join(directory, `${name}.tmp`), body, { mode });
      await rename(join(directory, `${name}.tmp`), join(directory, name));
    }
  });
  return writing;
}

export async function safelyObservePublication(event: Event) {
  try { await observePublication(event); }
  catch { console.error("Publication monitoring observation could not be written."); }
}
