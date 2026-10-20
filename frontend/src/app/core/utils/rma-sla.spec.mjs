import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slaStatus, elapsedSlaSeconds, filterKanbanRmas, slaDuration, SLA_LABELS } from './rma-sla.ts';

const start = Date.parse('2026-01-01T10:00:00Z');
const sla = { status: 'NORMAL', startedAt: new Date(start).toISOString(), warningAt: new Date(start + 480000).toISOString(), dueAt: new Date(start + 600000).toISOString(), elapsedSeconds: 0, limitSeconds: 600 };

test('classifies exact warning and deadline boundaries without reloading', () => {
  for (const [seconds, expected] of [[479, 'NORMAL'], [480, 'WARNING'], [599, 'WARNING'], [600, 'OVERDUE']]) {
    assert.equal(slaStatus(sla, start + seconds * 1000), expected);
  }
});

test('closed cards never continue counting', () => {
  const closed = { ...sla, status: 'CLOSED', dueAt: null, warningAt: null, elapsedSeconds: 0 };
  assert.equal(slaStatus(closed, start + 1e10), 'CLOSED');
  assert.equal(elapsedSlaSeconds(closed, start + 1e10), 0);
});

test('SLA filter intersects assignee and unassigned filters', () => {
  const rmas = [{ id: 1, assigneeId: 7, sla }, { id: 2, assigneeId: null, sla }, { id: 3, assigneeId: 7, sla: { ...sla, status: 'CLOSED' } }];
  const ids = (assignee, filter, time = start + 600000) => filterKanbanRmas(rmas, assignee, filter, time).map(r => r.id);
  assert.deepEqual(ids(7, 'OVERDUE'), [1]);
  assert.deepEqual(ids('unassigned', 'OVERDUE'), [2]);
  assert.deepEqual(ids('all', 'CLOSED'), [3]);
  assert.deepEqual(ids(7, 'all'), [1, 3]);
  assert.deepEqual(ids('all', 'OVERDUE', start), []);
  assert.deepEqual(ids('all', 'NORMAL', start), [1, 2]);
});

test('elapsed duration is readable and never negative', () => {
  assert.equal(elapsedSlaSeconds(sla, start + 61000), 61);
  assert.equal(elapsedSlaSeconds(sla, start - 1000), 0);
  assert.equal(slaDuration(3660), '1h 1min');
  assert.equal(slaDuration(0), '0 min');
  assert.equal(Object.keys(SLA_LABELS).length, 4);
});
