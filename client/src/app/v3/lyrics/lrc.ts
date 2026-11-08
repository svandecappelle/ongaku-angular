/** A line of lyrics; `time` (seconds) is null for plain lyrics */
export interface LyricLine {
  time: number | null;
  text: string;
}

export interface ParsedLyrics {
  /** Timed (LRC): the current line follows the music */
  synced: boolean;
  lines: LyricLine[];
}

const STAMP = /^\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/;
const TAG = /^\[([a-z]+):(.*)\]$/i;

function seconds(minutes: string, rest: string): number {
  return Number(minutes) * 60 + Number(rest.replace(':', '.'));
}

/**
 * Reads LRC lyrics ("[01:02.50]text", several stamps per line allowed, [offset:ms]),
 * or plain text when no line has a time. Word stamps (<00:01.20>) are dropped.
 */
export function parseLrc(source: string): ParsedLyrics {
  let offset = 0;
  const timed: LyricLine[] = [];
  const plain: LyricLine[] = [];
  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    let line = raw.trim();
    const tag = TAG.exec(line);
    if (tag && !STAMP.test(line)) {
      // Header tags: [ar:], [ti:], [offset:+500] (ms, positive shows the lines earlier)
      if (tag[1].toLowerCase() === 'offset') {
        offset = (Number(tag[2]) || 0) / 1000;
      }
      continue;
    }
    const times: number[] = [];
    let stamp: RegExpExecArray | null;
    while ((stamp = STAMP.exec(line))) {
      times.push(seconds(stamp[1], stamp[2]));
      line = line.slice(stamp[0].length);
    }
    const text = line.replace(/<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g, '').trim();
    if (times.length) {
      times.forEach((time) => timed.push({ time, text }));
    } else {
      plain.push({ time: null, text });
    }
  }
  if (timed.length) {
    return {
      synced: true,
      lines: timed.map((line) => ({ ...line, time: Math.max(0, (line.time ?? 0) - offset) })).sort((a, b) => (a.time ?? 0) - (b.time ?? 0)),
    };
  }
  // Plain lyrics: the blank lines around are dropped, the ones between stanzas kept
  const text = plain.map((line) => line.text);
  while (text.length && !text[0]) {
    text.shift();
  }
  while (text.length && !text[text.length - 1]) {
    text.pop();
  }
  return { synced: false, lines: text.map((t) => ({ time: null, text: t })) };
}

/** "[mm:ss.xx]" stamp of a time in seconds */
export function lrcStamp(time: number): string {
  const total = Math.max(0, time);
  const minutes = Math.floor(total / 60);
  const rest = total - minutes * 60;
  return `[${String(minutes).padStart(2, '0')}:${rest.toFixed(2).padStart(5, '0')}]`;
}

/** Index of the line being sung at `time`, -1 before the first one */
export function activeLine(lyrics: ParsedLyrics, time: number): number {
  if (!lyrics.synced) {
    return -1;
  }
  let index = -1;
  for (let i = 0; i < lyrics.lines.length; i++) {
    if ((lyrics.lines[i].time ?? 0) <= time) {
      index = i;
    } else {
      break;
    }
  }
  return index;
}
