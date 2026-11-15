import { MIN_SLICE_ANGLE, buildDonutArcs, formatPercent } from './donut-geometry';

const slice = (value: number, label = 'x') => ({ label, value, tone: 'success' });

describe('buildDonutArcs', () => {
  it('makes the angles of proportional slices sum to 360 starting at the top', () => {
    const arcs = buildDonutArcs([slice(1), slice(1), slice(2)]);
    expect(arcs[0].startAngle).toBe(0);
    expect(arcs[0].endAngle).toBeCloseTo(90);
    expect(arcs[2].endAngle).toBeCloseTo(360);
    expect(arcs.map((arc) => arc.path).every(Boolean)).toBe(true);
  });

  it('draws nothing for all-zero data', () => {
    const arcs = buildDonutArcs([slice(0), slice(0)]);
    expect(arcs.every((arc) => arc.path === undefined && !arc.full && arc.endAngle === 0)).toBe(true);
  });

  it('draws a full ring when a single slice holds everything', () => {
    const arcs = buildDonutArcs([slice(7), slice(0)]);
    expect(arcs[0].full).toBe(true);
    expect(arcs[0].path).toBeUndefined();
    expect(arcs[1].path).toBeUndefined();
  });

  it('keeps tiny slices visible at the minimum angle and still sums to 360', () => {
    const arcs = buildDonutArcs([slice(1000), slice(1)]);
    expect(arcs[1].endAngle - arcs[1].startAngle).toBeCloseTo(MIN_SLICE_ANGLE);
    expect(arcs[1].endAngle).toBeCloseTo(360);
  });

  it('treats negative or invalid values as zero', () => {
    const arcs = buildDonutArcs([slice(-3), slice(Number.NaN), slice(2)]);
    expect(arcs[2].full).toBe(true);
  });
});

describe('formatPercent', () => {
  it('uses a decimal comma and a dash without base', () => {
    expect(formatPercent(1, 3)).toBe('33,3%');
    expect(formatPercent(7, 7)).toBe('100,0%');
    expect(formatPercent(0, 0)).toBe('—');
  });
});
