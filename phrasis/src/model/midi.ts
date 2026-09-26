/** Standard MIDI File (format 0) writer. */
import { absoluteNotes } from './syntax';
import { TPQ } from './types';
import type { Project } from './types';

function vlq(n: number): number[] {
  const bytes = [n & 0x7f];
  n >>= 7;
  while (n > 0) {
    bytes.unshift((n & 0x7f) | 0x80);
    n >>= 7;
  }
  return bytes;
}

const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const u16 = (n: number) => [(n >>> 8) & 0xff, n & 0xff];
const text = (s: string) => Array.from(new TextEncoder().encode(s));

export function projectToMidi(project: Project): Uint8Array {
  interface Ev {
    tick: number;
    data: number[];
    order: number;
  }
  const events: Ev[] = [];
  const name = text(project.name);
  events.push({ tick: 0, data: [0xff, 0x03, ...vlq(name.length), ...name], order: 0 });
  const mpq = Math.round(60_000_000 / project.tempo);
  events.push({ tick: 0, data: [0xff, 0x51, 0x03, (mpq >> 16) & 0xff, (mpq >> 8) & 0xff, mpq & 0xff], order: 0 });
  const denPow = Math.round(Math.log2(project.meter.den));
  events.push({ tick: 0, data: [0xff, 0x58, 0x04, project.meter.num, denPow, 24, 8], order: 0 });
  const add = (ch: number, pitch: number, start: number, dur: number, vel: number) => {
    events.push({ tick: Math.max(0, Math.round(start)), data: [0x90 | ch, pitch & 0x7f, Math.max(1, Math.min(127, vel))], order: 2 });
    events.push({ tick: Math.max(0, Math.round(start + dur)), data: [0x80 | ch, pitch & 0x7f, 0], order: 1 });
  };
  for (const n of absoluteNotes(project)) if (!n.mute) add(0, n.pitch, n.abs, n.dur, n.vel);
  for (const n of project.lowerVoice ?? []) add(1, n.pitch, n.start, n.dur, n.vel);
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const track: number[] = [];
  let last = 0;
  for (const e of events) {
    track.push(...vlq(e.tick - last), ...e.data);
    last = e.tick;
  }
  track.push(0, 0xff, 0x2f, 0x00);
  const header = [...text('MThd'), ...u32(6), ...u16(0), ...u16(1), ...u16(TPQ)];
  const chunk = [...text('MTrk'), ...u32(track.length), ...track];
  return new Uint8Array([...header, ...chunk]);
}

export function download(filename: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slug(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'phrasis';
}
