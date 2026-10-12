import type { RecordedStep } from './record.js';

export type FormField = { selector: string; value: string };
export type FormGroupSuggestion = {
  startIndex: number;
  endIndex: number;
  fields: FormField[];
  submitSelector?: string;
  replacement: RecordedStep;
};

function fillField(step: RecordedStep): FormField | null {
  const params = step.params as Record<string, unknown>;
  if (step.method === 'browser_fill' && typeof params.selector === 'string' && typeof params.value === 'string') {
    return { selector: params.selector, value: params.value };
  }
  if (step.method === 'browser_select' && typeof params.selector === 'string' && typeof params.value === 'string') {
    return { selector: params.selector, value: params.value };
  }
  return null;
}

function submitSelectorOf(step: RecordedStep | undefined): string | undefined {
  if (!step || step.method !== 'browser_click') return undefined;
  const selector = (step.params as Record<string, unknown>).selector;
  return typeof selector === 'string' && selector ? selector : undefined;
}

// Suggest-only (manual confirm): groups runs of >=2 consecutive fill/select
// into one browser_fill_form. A trailing click becomes submitSelector.
// Non-replayable steps break a run so we never merge across a gap. A run
// never crosses tabs: fields from different pages cannot share one
// browser_fill_form call, so a tabUrl change ends the run.
export function suggestFormGroups(steps: RecordedStep[]): FormGroupSuggestion[] {
  const tabOf = (step: RecordedStep | undefined): string | null =>
    step && typeof step.tabUrl === 'string' && step.tabUrl ? step.tabUrl : null;
  const suggestions: FormGroupSuggestion[] = [];
  let index = 0;
  while (index < steps.length) {
    const run: FormField[] = [];
    let cursor = index;
    const runTab = tabOf(steps[index]);
    while (cursor < steps.length) {
      const step = steps[cursor];
      if (!step.replayable) break;
      if (tabOf(step) !== runTab) break;
      const field = fillField(step);
      if (!field) break;
      run.push(field);
      cursor += 1;
    }
    if (run.length >= 2) {
      const submitStep = steps[cursor];
      const submit = tabOf(submitStep) === runTab ? submitSelectorOf(submitStep) : undefined;
      const endIndex = submit !== undefined ? cursor : cursor - 1;
      const params: Record<string, unknown> = { fields: run.map(field => ({ ...field })) };
      if (submit !== undefined) params.submitSelector = submit;
      const replacement: RecordedStep = { method: 'browser_fill_form', params, replayable: true };
      if (runTab) replacement.tabUrl = runTab;
      suggestions.push({
        startIndex: index,
        endIndex,
        fields: run.map(field => ({ ...field })),
        ...(submit !== undefined ? { submitSelector: submit } : {}),
        replacement
      });
      index = endIndex + 1;
    } else {
      index += 1;
    }
  }
  return suggestions;
}
