import { Song } from '../../app-state';

/** Duration of a track in seconds; the server sends it as "m:ss" */
export function parseDuration(track: Song): number {
  const [minutes, seconds] = String((track as any).duration ?? '').split(':').map(Number);
  return Number.isFinite(minutes) && Number.isFinite(seconds) ? minutes * 60 + seconds : 0;
}

/** Year of a track, from its tags */
export function trackYear(track: Song | undefined): string | null {
  const metadatas: any = track?.metadatas ?? {};
  return String(metadatas.year ?? metadatas.date ?? '').slice(0, 4) || null;
}
