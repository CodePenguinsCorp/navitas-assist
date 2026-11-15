import { notificationDetailContent } from './notification-detail-content';
import { NotificationResponse } from '../../core/models';

describe('notificationDetailContent', () => {
  it('extracts the creation format without removing demo names or dots in an author', () => {
    expect(notificationDetailContent({ eventType: 'RMA_CREATED', message: '[DEMO] Cliente · Switch · prioridade média. Aberta por admin.suporte.' })).toEqual({
      fields: [
        { label: 'Cliente', value: '[DEMO] Cliente' }, { label: 'Equipamento', value: 'Switch' },
        { label: 'Prioridade', value: 'média' }, { label: 'Aberta por', value: 'admin.suporte' }
      ], message: ''
    });
  });

  it('extracts stage and author from the assignment format', () => {
    expect(notificationDetailContent({ eventType: 'RMA_ASSIGNED', message: 'Cliente · Switch · etapa Diagnóstico. Atribuída por admin.' }).fields).toEqual([
      { label: 'Cliente', value: 'Cliente' }, { label: 'Equipamento', value: 'Switch' },
      { label: 'Etapa', value: 'Diagnóstico' }, { label: 'Atribuída por', value: 'admin' }
    ]);
  });

  it.each([
    '', 'Cliente · Produto', 'Cliente · Produto · prioridade alta. Aberta por admin. Conteúdo extra.',
    'Cliente · Unidade · Produto · prioridade alta. Aberta por admin.',
    ' · Produto · prioridade alta. Aberta por admin.', 'Mensagem\ncom <b>HTML literal</b>'
  ])('preserves the entire ambiguous message: %s', message => {
    expect(notificationDetailContent({ eventType: 'RMA_CREATED', message })).toEqual({ fields: [], message });
  });

  it('does not infer client and equipment from a free form impediment reason', () => {
    const message = 'Peça · sem estoque · prioridade alta. Aberta por admin.';
    expect(notificationDetailContent({ eventType: 'RMA_BLOCKED', message })).toEqual({ fields: [], message });
  });

  it('preserves the assignment recipient, which only exists in the title', () => {
    expect(notificationDetailContent({ eventType: 'RMA_ASSIGNED', message: 'Mensagem integral',
      title: 'OS OS-2026-000007 atribuída a Maria Silva', rmaCode: 'OS-2026-000007' } as NotificationResponse).fields)
      .toContainEqual({ label: 'Responsável', value: 'Maria Silva' });
  });

  it('preserves an unfamiliar assignment title without guessing the recipient', () => {
    expect(notificationDetailContent({ eventType: 'RMA_ASSIGNED', message: 'Mensagem integral',
      title: 'Atribuição transferida para a equipe', rmaCode: 'OS-2026-000007' } as NotificationResponse).fields)
      .toContainEqual({ label: 'Atribuição', value: 'Atribuição transferida para a equipe' });
  });
});
