/** Elapsed time in the single format of the app: "menos de 1 min", "N min", "N h M min", "N d H h". */
export function formatDuration(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  if (total < 60) return 'menos de 1 min';
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest ? `${hours} h ${rest} min` : `${hours} h`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days} d ${restHours} h` : `${days} d`;
}
