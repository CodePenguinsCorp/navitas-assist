import { RmaResponse, WorkflowStatusDefinition } from '../models';
import { CLOSED_RMA_STATUSES } from '../mock-data';
export function allowedTransitions(rma: RmaResponse | null | undefined) {
  return (rma?.transitionOptions ?? [])
    .filter((option) => option.allowed)
    .map((option) => ({ value: option.status, label: option.label }));
}
export function commonTransitions(rmas: readonly RmaResponse[]) {
  return rmas.length
    ? allowedTransitions(rmas[0]).filter((option) =>
        rmas.every((rma) => allowedTransitions(rma).some((target) => target.value === option.value)),
      )
    : [];
}
export function workflowColumns(statuses: readonly WorkflowStatusDefinition[], rmas: readonly RmaResponse[]) {
  return statuses.filter((status) => status.active || rmas.some((rma) => rma.status === status.code));
}
export function isDone(rma: RmaResponse) {
  return rma.statusCategory ? rma.statusCategory === 'DONE' : CLOSED_RMA_STATUSES.includes(rma.status);
}
export function stableCode(label: string) {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);
}
