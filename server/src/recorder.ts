// Runtime recording control. The initial target comes from FASTMCP_RECORD at
// module load, but a running server can start/stop recording to any file at
// runtime through the bridge control channel (see index.ts).
//
// Two gates share this module and must stay distinct:
// - MCP tool calls (tools.ts maybeRecord) record only when a file was set
//   explicitly via env or `record start`. They never trigger the default.
// - Passively observed browser steps (observe.ts ingest) resolve a default
//   file under recordings/ when nothing was set, so Resume in the popup
//   records without a prior `record start`. An explicit `record stop`
//   suppresses even that until the next start or save.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let activeFile: string | undefined = (() => {
  const file = process.env.FASTMCP_RECORD;
  return typeof file === 'string' && file ? file : undefined;
})();
let activeSince: number | null = activeFile ? Date.now() : null;
let suppressed = false;
let written = 0;
let lastSaved: { file: string; count: number; at: number } | null = null;
let defaultFile: string | undefined;

function repoRecordingsDir(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 5; depth += 1) {
    try {
      if (existsSync(join(dir, 'server')) && existsSync(join(dir, 'recordings'))) {
        return join(dir, 'recordings');
      }
    } catch {
      // A transient fs error must not break recording; keep walking up.
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return join(process.cwd(), 'recordings');
}

export function defaultRecordFile(): string {
  if (!defaultFile) {
    const stamp = new Date().toISOString().replace(/[-:.]/g, '').replace('T', '-').slice(0, 15);
    defaultFile = join(repoRecordingsDir(), `run-${stamp}-p${process.pid}.jsonl`);
  }
  return defaultFile;
}

export function activeRecordFile(): string | undefined {
  return activeFile;
}

// File target for passively observed steps. Unlike activeRecordFile, this
// resolves the default recordings/ file on first use so the popup's Resume
// works without a prior `record start`. Never touches the filesystem itself:
// the file materializes on the first append, so no empty files are created.
export function ensureObserveFile(): string | undefined {
  if (suppressed) return undefined;
  if (!activeFile) {
    activeFile = defaultRecordFile();
    activeSince = Date.now();
  }
  return activeFile;
}

export function startRecording(file: string): { recording: true; file: string } {
  activeFile = file;
  activeSince = Date.now();
  suppressed = false;
  written = 0;
  return { recording: true, file };
}

export function stopRecording(): { recording: false; stopped: string | null } {
  const stopped = activeFile ?? null;
  activeFile = undefined;
  activeSince = null;
  suppressed = true;
  written = 0;
  return { recording: false, stopped };
}

export function noteRecorded(): void {
  written += 1;
}

export function markSaved(count: number): { file: string; count: number; at: number } {
  // Save is an explicit user action: it (re)activates recording to the
  // current file, or to the default recordings/ file when recording was
  // stopped or never started. Keeping the same file preserves its written
  // count (Save appends, never truncates). The file itself stays lazy (see
  // ensureObserveFile) — marking never creates an empty file.
  if (suppressed || !activeFile) startRecording(activeFile ?? defaultRecordFile());
  lastSaved = { file: activeFile as string, count, at: Date.now() };
  return lastSaved;
}

export function recordingStatus(): {
  recording: boolean;
  file: string | null;
  since: number | null;
  written: number;
  lastSaved: { file: string; count: number; at: number } | null;
} {
  return { recording: Boolean(activeFile), file: activeFile ?? null, since: activeSince, written, lastSaved };
}
