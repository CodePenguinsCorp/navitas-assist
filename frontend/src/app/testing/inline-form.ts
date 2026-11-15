import { expect } from 'vitest';

const LEGACY = ['.repair-form', '.repair-actions', '.diagnosis-fields', '.blocks-section__form', '.blocks-section__actions', '.status-note', '.warranty-field__form', '.warranty-field__actions', '.form-grid'];

function labelText(element: Element): string {
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Pattern shared by every inline form of the OS detail: .inline-form container, visible labels as direct
 * children of .field-group, "required" marked only by .field-group--required (no "obrigatório" or
 * "opcional" text), and an .inline-form__actions footer with Cancelar first and the primary action last.
 */
export function expectInlineForm(form: Element | null, requiredLabels: string[], primaryLabel: string | null = null): void {
  expect(form).not.toBeNull();
  const root = form as HTMLElement;
  expect(root.classList).toContain('inline-form');
  for (const legacy of LEGACY) {
    expect(root.matches(legacy) || root.querySelector(legacy), `classe antiga ${legacy}`).toBeFalsy();
  }
  const actions = root.querySelector('.inline-form__actions');
  expect(actions, 'rodapé de ações').not.toBeNull();
  const buttons = [...actions!.querySelectorAll('button')];
  expect(labelText(buttons[0])).toBe('Cancelar');
  expect(buttons[0].classList).toContain('button-secondary');
  expect(buttons[buttons.length - 1].classList).toContain('button-primary');
  if (primaryLabel) { expect(labelText(buttons[buttons.length - 1])).toBe(primaryLabel); }
  const labels = [...root.querySelectorAll('.field-group > :is(label, span)')].filter(element => !element.classList.contains('sr-only'));
  expect(labels.length).toBeGreaterThan(0);
  for (const label of labels) { expect(labelText(label)).not.toMatch(/obrigat[óo]ri|opcional/i); }
  for (const area of root.querySelectorAll('textarea')) { expect(area.closest('.field-group'), 'textarea dentro de .field-group').not.toBeNull(); }
  expect([...root.querySelectorAll('.field-group--required > :is(label, span)')].map(labelText)).toEqual(requiredLabels);
}
