import { isBellNotification } from './bell-notifications';

describe('notificações do sino no fuso de São Paulo', () => {
  const now = Date.parse('2026-11-14T03:00:00Z');
  it.each([
    [false, '2026-01-01T12:00:00Z', true],
    [true, '2026-11-14T02:59:59Z', false],
    [true, '2026-11-14T03:00:00Z', true],
    [true, '2026-11-15T02:59:59Z', true],
    [true, '2026-11-15T03:00:00Z', false],
    [true, 'inválida', false],
  ])('read=%s createdAt=%s resulta em %s', (read, createdAt, expected) => {
    expect(isBellNotification({ read, createdAt }, now)).toBe(expected);
  });
});
