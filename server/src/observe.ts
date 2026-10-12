import { appendStep, normalizeStep, type RecordedStep } from './record.js';
import { ensureObserveFile, markSaved, noteRecorded } from './recorder.js';
import { TOOL_NAMES } from './tools.js';

const KNOWN = new Set<string>(TOOL_NAMES as readonly string[]);

export type ObserveContext = { tabUrl?: unknown };

export type ObserveSave = { saved: true; file: string; count: number };

function contextTabUrl(context: ObserveContext | undefined): string | undefined {
  const url = context?.tabUrl;
  return typeof url === 'string' && url ? url : undefined;
}

export function observedToRecordedStep(method: unknown, params: unknown, context?: ObserveContext): RecordedStep | null {
  if (typeof method !== 'string' || !KNOWN.has(method)) return null;
  if (!params || typeof params !== 'object' || Array.isArray(params)) return null;
  const step = normalizeStep(method, params as Record<string, unknown>);
  if (!step) return null;
  const tabUrl = contextTabUrl(context);
  if (tabUrl) step.tabUrl = tabUrl;
  return step;
}

export async function ingestObservedStep(method: unknown, params: unknown, context?: ObserveContext): Promise<RecordedStep | null> {
  const file = ensureObserveFile();
  if (!file) return null;
  const step = observedToRecordedStep(method, params, context);
  if (!step) return null;
  await appendStep(file, step);
  noteRecorded();
  return step;
}

export type BridgeObserveEvent = { method?: unknown; params?: unknown };

export async function handleBridgeEvent(event: BridgeObserveEvent): Promise<RecordedStep | ObserveSave | null> {
  if (!event || typeof event.method !== 'string') return null;
  if (event.method === 'observe.save') {
    const params = event.params as Record<string, unknown> | null | undefined;
    const count = typeof params?.count === 'number' && Number.isSafeInteger(params.count) ? params.count : 0;
    // An empty save finalizes nothing: it must never create an empty file
    // (parseRunFile would reject it) — the extension already no-ops these,
    // this is the server-side backstop.
    if (count <= 0) return null;
    const saved = markSaved(count);
    return { saved: true, file: saved.file, count: saved.count };
  }
  if (event.method !== 'observe.step') return null;
  const params = event.params as Record<string, unknown> | null | undefined;
  if (!params || typeof params !== 'object') return null;
  const tabUrl = typeof params.tabUrl === 'string' && params.tabUrl ? params.tabUrl : undefined;
  return ingestObservedStep(
    (params as Record<string, unknown>).method,
    (params as Record<string, unknown>).params,
    tabUrl ? { tabUrl } : undefined
  );
}
