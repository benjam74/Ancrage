import { describe, expect, test } from 'vitest';
import { dailyEventIcs } from '../../src/core/ics';

const NOW = new Date(2026, 9, 29, 15, 0).getTime();

describe('dailyEventIcs', () => {
  const ics = dailyEventIcs({ time: '08:00', cue: 'après le café, puis ; thé', now: NOW, uid: 'u1' });

  test('a daily recurring 10-minute event at the chosen local time, with an alarm', () => {
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('DTSTART:20261029T080000');
    expect(ics).toContain('DURATION:PT10M');
    expect(ics).toContain('RRULE:FREQ=DAILY');
    expect(ics).toContain('SUMMARY:Ancrage : ma manche du jour');
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics).toContain('UID:u1');
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
  });

  test('escapes text and uses CRLF line endings', () => {
    expect(ics).toContain('DESCRIPTION:après le café\\, puis \\; thé');
    expect(ics.split('\r\n').length).toBeGreaterThan(10);
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n');
  });

  test('long lines are folded at 75 octets', () => {
    const long = dailyEventIcs({ time: '08:00', cue: 'é'.repeat(80), now: NOW, uid: 'u3' });
    const lines = long.split('\r\n');
    expect(lines.every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(long.replace(/\r\n /g, '')).toContain(`DESCRIPTION:${'é'.repeat(80)}`);
  });

  test('no cue gives no description', () => {
    const plain = dailyEventIcs({ time: '19:30', cue: '', now: NOW, uid: 'u2' });
    // Only the alarm carries a description.
    expect(plain.match(/DESCRIPTION:/g)).toEqual(['DESCRIPTION:']);
    expect(plain).toContain('DTSTART:20261029T193000');
  });
});
