import { NotificationResponse } from '../../core/models';

/** Only exact NotificationContentFactory formats are split; ambiguous text stays intact. */
export function notificationDetailContent({ message, eventType, title, rmaCode }:
  Pick<NotificationResponse, 'message' | 'eventType'> & Partial<Pick<NotificationResponse, 'title' | 'rmaCode'>>): {
  fields: Array<{ label: string; value: string }>;
  message: string;
} {
  const labels: Partial<Record<NotificationResponse['eventType'], string>> = {
    RMA_BLOCKED: 'Motivo do impedimento', TEST_FAILED: 'Item reprovado'
  };
  const label = labels[eventType];
  if (label) {
    const quoted = String.raw`"(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"`;
    const match = new RegExp(String.raw`^([^·]+) · ([^·]+) · etapa ([^.]+)\. ${label}: (${quoted})\.(?: Registrado por (${quoted})\.)?$`, 'u').exec(message);
    if (match && match[1].trim() && match[2].trim() && match[3].trim()) {
      return { fields: [
        { label: 'Cliente', value: match[1] }, { label: 'Equipamento', value: match[2] },
        { label: 'Etapa', value: match[3] },
        ...(match[5] ? [{ label: 'Registrado por', value: JSON.parse(match[5]) as string }] : []),
        { label, value: JSON.parse(match[4]) as string }
      ], message: '' };
    }
    return { fields: [{ label, value: message }], message: '' };
  }
  const parts = message.split(' · ');
  const detail = eventType === 'RMA_CREATED'
    ? /^prioridade (alta|média|baixa)\. Aberta por ((?:(?!\. ).)+)\.$/u.exec(parts[2] ?? '')
    : eventType === 'RMA_ASSIGNED'
      ? /^etapa (.+)\. Atribuída por ((?:(?!\. ).)+)\.$/u.exec(parts[2] ?? '')
      : null;
  const recognized = parts.length === 3 && parts[0].trim() && parts[1].trim() && detail;
  const fields = recognized ? [
      { label: 'Cliente', value: parts[0] },
      { label: 'Equipamento', value: parts[1] },
      { label: eventType === 'RMA_CREATED' ? 'Prioridade' : 'Etapa', value: detail[1] },
      { label: eventType === 'RMA_CREATED' ? 'Aberta por' : 'Atribuída por', value: detail[2] }
    ] : [];
  if (eventType === 'RMA_ASSIGNED' && title) {
    const prefix = rmaCode ? `OS ${rmaCode} atribuída a ` : '';
    const assignee = prefix && title.startsWith(prefix) ? title.slice(prefix.length) : '';
    fields.push(assignee.trim() ? { label: 'Responsável', value: assignee } : { label: 'Atribuição', value: title });
  }
  return { fields, message: recognized ? '' : message };
}
