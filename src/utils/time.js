// Formate une duree en secondes -> "45s" ou "2 min 10s".
export function fmtDuration(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m > 0) return `${m} min${r ? ` ${r}s` : ''}`;
  return `${r}s`;
}
