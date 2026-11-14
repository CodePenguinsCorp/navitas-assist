import { formatDuration } from './duration';

describe('formatDuration', () => {
  it('formats short, hourly and daily durations', () => {
    expect(formatDuration(0)).toBe('menos de 1 min');
    expect(formatDuration(59)).toBe('menos de 1 min');
    expect(formatDuration(60)).toBe('1 min');
    expect(formatDuration(3599)).toBe('59 min');
    expect(formatDuration(3600)).toBe('1 h');
    expect(formatDuration(3660)).toBe('1 h 1 min');
    expect(formatDuration(86400)).toBe('1 d');
    expect(formatDuration(187200)).toBe('2 d 4 h');
    expect(formatDuration(86400 + 59 * 60)).toBe('1 d');
  });

  it('treats negative and invalid values as zero', () => {
    expect(formatDuration(-10)).toBe('menos de 1 min');
    expect(formatDuration(Number.NaN)).toBe('menos de 1 min');
  });
});
