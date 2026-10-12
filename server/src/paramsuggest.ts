import type { RecordedStep } from './record.js';

export type PlaceholderSuggestion = {
  index: number;
  method: string;
  param: string;
  value: string;
  name: string;
  placeholder: string;
  tabUrl?: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SLASH_DATE = /^(\d{2})[/-](\d{2})[/-](\d{4})$/;

function dateValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('{{') || trimmed.includes('}}')) return null;
  if (ISO_DATE.test(trimmed)) return trimmed;
  if (SLASH_DATE.test(trimmed)) return trimmed;
  return null;
}

function paramOf(step: RecordedStep): { param: string; value: unknown } | null {
  const params = step.params as Record<string, unknown>;
  if (step.method === 'browser_fill' && 'value' in params) return { param: 'value', value: params.value };
  if (step.method === 'browser_type' && 'text' in params) return { param: 'text', value: params.text };
  return null;
}

// Suggest-only by design (manual+suggest): never rewrites steps. The user/AI
// confirms, then the value becomes {{name}} which scriptgen/scriptrun already
// resolve. Two dates → start_date/end_date, one → date, more → date_1..n.
export function suggestPlaceholders(steps: RecordedStep[]): PlaceholderSuggestion[] {
  const hits: Array<{ index: number; method: string; param: string; value: string; tabUrl?: string }> = [];
  steps.forEach((step, index) => {
    const found = paramOf(step);
    if (!found) return;
    const dated = dateValue(found.value);
    if (!dated) return;
    const hit: { index: number; method: string; param: string; value: string; tabUrl?: string } =
      { index, method: step.method, param: found.param, value: dated };
    // Tell the reviewer which page each date came from so a mixed-tab file
    // can be split before parameterizing. Absent when the step has none, so
    // older run files keep producing identical suggestions.
    if (typeof step.tabUrl === 'string' && step.tabUrl) hit.tabUrl = step.tabUrl;
    hits.push(hit);
  });
  return hits.map((hit, position) => {
    const name = hits.length === 1 ? 'date' : hits.length === 2
      ? (position === 0 ? 'start_date' : 'end_date')
      : `date_${position + 1}`;
    return { ...hit, name, placeholder: `{{${name}}}` };
  });
}
