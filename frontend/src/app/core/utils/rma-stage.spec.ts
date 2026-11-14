import { RmaStagePeriodResponse } from '../models';
import { currentStagePeriod, stageElapsedSeconds, stageTimeLabel } from './rma-stage';

const NOW = Date.parse('2026-11-13T12:00:00Z');

function period(overrides: Partial<RmaStagePeriodResponse>): RmaStagePeriodResponse {
  return { status: 'RECEIVED', enteredAt: '2026-11-10T12:00:00Z', leftAt: null, durationSeconds: 0, ...overrides };
}

describe('rma stage time', () => {
  it('labels the time in the current stage', () => {
    const enteredAt = new Date(NOW - 187200 * 1000).toISOString();
    expect(stageTimeLabel({ status: 'IN_REPAIR', stagePeriods: [period({ status: 'IN_REPAIR', enteredAt })] }, NOW))
      .toBe('há 2 d 4 h nesta etapa');
  });

  it('has no stage label for closed ordens de serviço', () => {
    expect(stageTimeLabel({ status: 'COMPLETED', stagePeriods: [period({ status: 'COMPLETED' })] }, NOW)).toBeNull();
  });

  it('notes do not restart: the last period comes already merged from the backend', () => {
    const periods = [
      period({ status: 'RECEIVED', enteredAt: '2026-11-10T10:00:00Z', leftAt: '2026-11-12T12:00:00Z', durationSeconds: 180000 }),
      period({ status: 'TRIAGE', enteredAt: '2026-11-12T12:00:00Z' })
    ];
    expect(currentStagePeriod({ stagePeriods: periods }).status).toBe('TRIAGE');
    expect(stageTimeLabel({ status: 'TRIAGE', stagePeriods: periods }, NOW)).toBe('há 1 d nesta etapa');
  });

  it('counts the current period live and keeps finished periods fixed', () => {
    expect(stageElapsedSeconds(period({ enteredAt: '2026-11-13T11:00:00Z', durationSeconds: 5 }), NOW)).toBe(3600);
    expect(stageElapsedSeconds(period({ enteredAt: '2026-11-13T13:00:00Z' }), NOW)).toBe(0);
    expect(stageElapsedSeconds(period({ leftAt: '2026-11-11T12:00:00Z', durationSeconds: 86400 }), NOW)).toBe(86400);
  });
});
