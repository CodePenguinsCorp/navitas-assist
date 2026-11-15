export interface DonutSliceInput {
  label: string;
  value: number;
  /** Nome do token de cor: `success` usa `var(--tone-success)`. */
  tone: string;
}

export interface DonutArc extends DonutSliceInput {
  percent: number;
  percentLabel: string;
  startAngle: number;
  endAngle: number;
  /** Caminho do arco (indefinido para fatia zerada ou anel completo). */
  path?: string;
  full: boolean;
}

export const DONUT_CENTER = 60;
export const DONUT_RADIUS = 46;
/** Ângulo mínimo para uma fatia pequena continuar visível. */
export const MIN_SLICE_ANGLE = 6;

export function formatPercent(part: number, total: number): string {
  return total ? `${(Math.round((part / total) * 1000) / 10).toFixed(1).replace('.', ',')}%` : '—';
}

function point(angle: number): string {
  const radians = ((angle - 90) * Math.PI) / 180;
  return `${(DONUT_CENTER + DONUT_RADIUS * Math.cos(radians)).toFixed(2)} ${(DONUT_CENTER + DONUT_RADIUS * Math.sin(radians)).toFixed(2)}`;
}

/** Arcos proporcionais a partir do topo, em sentido horário; fatias pequenas ganham ângulo mínimo e as maiores cedem o excedente. */
export function buildDonutArcs(slices: readonly DonutSliceInput[]): DonutArc[] {
  const values = slices.map((slice) => (Number.isFinite(slice.value) && slice.value > 0 ? slice.value : 0));
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!total) {
    return slices.map((slice) => ({ ...slice, value: 0, percent: 0, percentLabel: '—', startAngle: 0, endAngle: 0, full: false }));
  }
  const raw = values.map((value) => (value / total) * 360);
  const small = raw.map((angle) => angle > 0 && angle < MIN_SLICE_ANGLE);
  const fixed = small.filter(Boolean).length * MIN_SLICE_ANGLE;
  const rest = raw.reduce((sum, angle, index) => (small[index] ? sum : sum + angle), 0);
  const scale = rest ? (360 - fixed) / rest : 1;
  const sweeps = raw.map((angle, index) => (small[index] ? MIN_SLICE_ANGLE : angle * scale));
  let cursor = 0;
  return slices.map((slice, index) => {
    const startAngle = cursor;
    cursor = startAngle + sweeps[index];
    const endAngle = cursor;
    const full = values[index] === total;
    const large = endAngle - startAngle > 180 ? 1 : 0;
    return {
      ...slice, value: values[index], percent: (values[index] / total) * 100, percentLabel: formatPercent(values[index], total),
      startAngle, endAngle, full,
      path: values[index] > 0 && !full ? `M ${point(startAngle)} A ${DONUT_RADIUS} ${DONUT_RADIUS} 0 ${large} 1 ${point(endAngle)}` : undefined
    };
  });
}
