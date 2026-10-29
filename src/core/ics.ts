/** Calendar file for the daily study appointment: the cue that turns the plan into a habit. */

const pad = (n: number) => String(n).padStart(2, '0');
const escape = (text: string) => text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

/** RFC 5545: lines longer than 75 octets continue on the next line after a space. */
function fold(line: string): string {
  const bytes = (s: string) => new TextEncoder().encode(s).length;
  const parts: string[] = [];
  let current = '';
  for (const ch of line) {
    if (bytes(current + ch) > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = '';
    }
    current += ch;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

function stamp(d: Date, utc: boolean): string {
  return utc
    ? `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
    : `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}

/** Daily recurring event at `time` (HH:MM, local floating time) starting the day of `now`. */
export function dailyEventIcs(opts: { time: string; cue: string; now: number; uid: string }): string {
  const [h, m] = opts.time.split(':').map(Number);
  const start = new Date(opts.now);
  start.setHours(h, m, 0, 0);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ancrage//FR',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${opts.uid}`,
    `DTSTAMP:${stamp(new Date(opts.now), true)}`,
    `DTSTART:${stamp(start, false)}`,
    'DURATION:PT10M',
    'RRULE:FREQ=DAILY',
    'SUMMARY:Ancrage : ma manche du jour',
    ...(opts.cue.trim() ? [`DESCRIPTION:${escape(opts.cue.trim())}`] : []),
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Ta manche Ancrage',
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}
