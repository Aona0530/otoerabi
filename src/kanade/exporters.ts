/**
 * 奏 - Kanade - 出力機能
 *
 * 生成された8小節テーマを MIDI（SMF Format 0）に変換する。
 * 外部ライブラリなしで直接バイト列を組み立てる。
 * SongData への変換（ライブラリ／プレゼント連携）も担う。
 */

import type { KNote } from './scale';
import { STEPS_PER_BAR, midiToName } from './scale';
import type { GenerateResult } from './KanadeEngine';
import type { Mood, NoteEvent, SongData, Track } from '@/types';

// ─────────────────────────────────────────────
// MIDI（Standard MIDI File, Format 0）
// ─────────────────────────────────────────────

const PPQ = 480;
const TICKS_PER_EIGHTH = PPQ / 2;

/** General MIDI プログラム番号 */
export const GM_PROGRAMS = { piano: 0, koto: 107 } as const;

function varLen(value: number): number[] {
  const bytes = [value & 0x7f];
  let v = value >> 7;
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
    v >>= 7;
  }
  return bytes;
}

function u32(value: number): number[] {
  return [(value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

export function toMidi(notes: KNote[], bpm: number, program: number): Uint8Array {
  type Ev = { tick: number; bytes: number[] };
  const events: Ev[] = [];

  // テンポ（マイクロ秒/四分音符）
  const usPerBeat = Math.round(60_000_000 / bpm);
  events.push({
    tick: 0,
    bytes: [0xff, 0x51, 0x03, (usPerBeat >> 16) & 0xff, (usPerBeat >> 8) & 0xff, usPerBeat & 0xff],
  });
  // 拍子 4/4
  events.push({ tick: 0, bytes: [0xff, 0x58, 0x04, 4, 2, 24, 8] });
  // 音色
  events.push({ tick: 0, bytes: [0xc0, program & 0x7f] });

  for (const n of notes) {
    const on = n.start * TICKS_PER_EIGHTH;
    const off = (n.start + n.dur) * TICKS_PER_EIGHTH;
    events.push({ tick: on, bytes: [0x90, n.midi, 92] });
    events.push({ tick: off, bytes: [0x80, n.midi, 0] });
  }

  events.sort((a, b) => a.tick - b.tick);

  const track: number[] = [];
  let prevTick = 0;
  for (const ev of events) {
    track.push(...varLen(ev.tick - prevTick), ...ev.bytes);
    prevTick = ev.tick;
  }
  // End of Track
  track.push(0x00, 0xff, 0x2f, 0x00);

  const header = [
    0x4d, 0x54, 0x68, 0x64, // "MThd"
    ...u32(6),
    0x00, 0x00, // format 0
    0x00, 0x01, // 1 track
    (PPQ >> 8) & 0xff, PPQ & 0xff,
  ];
  const trackHeader = [0x4d, 0x54, 0x72, 0x6b, ...u32(track.length)]; // "MTrk"

  return new Uint8Array([...header, ...trackHeader, ...track]);
}

/** ブラウザでファイルをダウンロードさせる */
export function downloadFile(filename: string, data: Uint8Array | string, mime: string): void {
  const blob =
    typeof data === 'string'
      ? new Blob([data], { type: mime })
      : new Blob([data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────
// SongData（ライブラリ／プレゼント連携用）
// ─────────────────────────────────────────────

/** 8分ステップの音価 → Tone.js 表記 */
const DUR_TO_TONE: Record<number, string> = { 1: '8n', 2: '4n', 4: '2n' };

/** KNote 列 → NoteEvent 列。同じ start/dur の音は和音（string[]）にまとめる */
function knotesToEvents(notes: KNote[], velocity: number): NoteEvent[] {
  // start-dur ごとにグルーピング
  const groups = new Map<string, { start: number; dur: number; names: string[] }>();
  for (const n of [...notes].sort((a, b) => a.start - b.start || a.midi - b.midi)) {
    const key = `${n.start}:${n.dur}`;
    const g = groups.get(key);
    if (g) g.names.push(midiToName(n.midi));
    else groups.set(key, { start: n.start, dur: n.dur, names: [midiToName(n.midi)] });
  }

  const events: NoteEvent[] = [];
  for (const g of groups.values()) {
    events.push({
      bar: Math.floor(g.start / STEPS_PER_BAR),
      beat: (g.start % STEPS_PER_BAR) / 2, // 8分ステップ → 4分拍
      note: g.names.length === 1 ? g.names[0] : g.names,
      duration: DUR_TO_TONE[g.dur] ?? '4n',
      velocity,
    });
  }
  return events;
}

/**
 * KanadeEngine の生成結果を、ライブラリ／プレゼント機能で使う SongData に変換する。
 * melody トラックと（伴奏があれば）chords トラックの2トラック構成。
 */
export function toSongData(
  result: GenerateResult,
  meta: { title: string; mood: Mood; bpm: number; creatorUserId?: string; style?: string },
): SongData {
  const tracks: Track[] = [
    { instrument: 'melody', notes: knotesToEvents(result.notes, 0.85) },
  ];
  if (result.accompaniment.length > 0) {
    tracks.push({ instrument: 'chords', notes: knotesToEvents(result.accompaniment, 0.4) });
  }

  const now = new Date().toISOString();
  return {
    song_id: `note-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    creator_user_id: meta.creatorUserId ?? 'me',
    title: meta.title,
    mood: meta.mood,
    style: meta.style ?? 'note-compose',
    bpm: meta.bpm,
    tracks,
    created_at: now,
    gifted_to: [],
  };
}
