/**
 * 奏 - Kanade - 音階・音価の基礎定義
 *
 * 時間単位は「8分音符ステップ」。4/4拍子で 1小節 = 8ステップ。
 * モチーフ = 2小節 = 16ステップ、テーマ = 8小節 = 64ステップ。
 * 音域はハ長調ダイアトニック C4〜G5（12音）。
 */

/** 音価（8分音符の個数）: 八分=1 / 四分=2 / 二分=4 */
export type DurEighths = 1 | 2 | 4;

/** メロディの1音（モノフォニック前提） */
export interface KNote {
  /** 曲頭からの8分ステップ位置（0〜63） */
  start: number;
  dur: DurEighths;
  /** MIDIノート番号（C4=60〜G5=79、ダイアトニックのみ） */
  midi: number;
}

export const STEPS_PER_BAR = 8;
export const MOTIF_BARS = 2;
export const THEME_BARS = 8;
export const MOTIF_STEPS = MOTIF_BARS * STEPS_PER_BAR;
export const THEME_STEPS = THEME_BARS * STEPS_PER_BAR;

/** ハ長調ダイアトニック C4〜G5 を度数インデックス順に並べたMIDI番号 */
export const SCALE_MIDIS = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79] as const;

/** イ短調 和声短音階: ソ(67,79)→ソ#(68,80) に差し替え */
export const SCALE_MIDIS_MINOR = [60, 62, 64, 65, 68, 69, 71, 72, 74, 76, 77, 80] as const;

export type ScaleMode = 'major' | 'minor';

export const DEG_MIN = 0;
export const DEG_MAX = SCALE_MIDIS.length - 1; // 11 = G5

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** 度数インデックス（0=C4 〜 11=G5）→ MIDI */
export function degToMidi(deg: number, mode: ScaleMode = 'major'): number {
  const scale = mode === 'minor' ? SCALE_MIDIS_MINOR : SCALE_MIDIS;
  return scale[clampDeg(deg)];
}

/** MIDI → 度数インデックス（最も近いダイアトニック音に丸める） */
export function midiToDeg(midi: number, mode: ScaleMode = 'major'): number {
  const scale = mode === 'minor' ? SCALE_MIDIS_MINOR : SCALE_MIDIS;
  let best = 0;
  let bestDist = Infinity;
  scale.forEach((m, i) => {
    const d = Math.abs(m - midi);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

export function clampDeg(deg: number): number {
  return Math.max(DEG_MIN, Math.min(DEG_MAX, deg));
}

/** MIDI → Tone.js 用の音名表記（例: 60 → "C4"） */
export function midiToName(midi: number): string {
  const name = NOTE_NAMES[midi % 12];
  const oct = Math.floor(midi / 12) - 1;
  return `${name}${oct}`;
}

/** 度数 → 日本語階名ラベル（グリッドの行ラベル用） */
export const DEG_LABELS = [
  'ド', 'レ', 'ミ', 'ファ', 'ソ', 'ラ', 'シ',
  'ド', 'レ', 'ミ', 'ファ', 'ソ',
] as const;

/**
 * ノート列の正規化:
 * start昇順にソートし、重なりを除去（後続ノートの開始まで音価を切り詰め）、
 * 範囲外や小節線をまたぐ音価も切り詰める（タイは扱わない）。
 */
export function sanitize(notes: KNote[], totalSteps: number): KNote[] {
  const sorted = [...notes].sort((a, b) => a.start - b.start);
  const out: KNote[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const n = sorted[i];
    if (n.start < 0 || n.start >= totalSteps) continue;
    const nextStart = i + 1 < sorted.length ? sorted[i + 1].start : totalSteps;
    const barEnd = n.start - (n.start % STEPS_PER_BAR) + STEPS_PER_BAR;
    const maxDur = Math.min(nextStart - n.start, totalSteps - n.start, barEnd - n.start);
    if (maxDur < 1) continue;
    const dur = ([4, 2, 1] as DurEighths[]).find((d) => d <= Math.min(n.dur, maxDur));
    if (!dur) continue;
    out.push({ ...n, dur });
  }
  return out;
}
