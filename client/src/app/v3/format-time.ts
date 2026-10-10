/** Formats a duration in seconds as m:ss */
export function formatTime(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const rest = total % 60;
  return `${Math.floor(total / 60)}:${rest < 10 ? '0' : ''}${rest}`;
}
