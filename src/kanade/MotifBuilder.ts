/**
 * MotifBuilder — 「必ず使う音」＋リズムテンプレート → 2小節モチーフ
 *
 * おとえらび作曲ゲームの Step ①〜③ の中核。
 *   ① さいしょの音（ド/ミ/ソ のいずれか）→ モチーフ1音目に固定
 *   ② つかう音3つ                        → 各小節の強拍（ステップ 4/8/12）に配置
 *   ③ リズムえらび                       → RhythmTemplate でスロット列を決める
 *
 * 空きスロット（弱拍）は前後の強拍音を順次進行でつなぐ「経過音」で埋める。
 * ここで①②に選ばれていないダイアトニック音も自由に使われる
 * （＝「選んでいない音も適宜使って良い」の実現）。
 *
 * 度数はハ長調ダイアトニック（0=ド 〜 11=高いソ）で扱い、MIDI は degToMidi(deg,'major')。
 * 短調化（ソ→ソ♯・終止）は後段の generateTheme(mode:'minor') に委ねる。
 */

import type { KNote } from './scale';
import { MOTIF_STEPS, clampDeg, degToMidi, sanitize } from './scale';
import type { RhythmTemplate } from './rhythmTemplates';
import { RHYTHM_TEMPLATES } from './rhythmTemplates';

export interface MotifRequest {
  /** ①の音（度数インデックス。ド=0 / ミ=2 / ソ=4） */
  firstDeg: number;
  /** ②の音（度数インデックス、通常3つ） */
  requiredDegs: number[];
  rhythm: RhythmTemplate;
  seed: number;
}

export interface MotifCandidate {
  templateId: string;
  label: string;
  emoji: string;
  notes: KNote[];
}

/** durs（音価列）→ スロットの開始位置と音価 */
interface Slot {
  start: number;
  dur: import('./scale').DurEighths;
}

function toSlots(durs: import('./scale').DurEighths[]): Slot[] {
  const slots: Slot[] = [];
  let cursor = 0;
  for (const dur of durs) {
    slots.push({ start: cursor, dur });
    cursor += dur;
  }
  return slots;
}

/** mulberry32: KanadeEngine と同じ決定的乱数 */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 配列の全順列（要素数が小さい前提。3音なら6通り） */
function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) out.push([arr[i], ...p]);
  }
  return out;
}

/** 各小節の強拍スロット（start % 4 === 0）を先頭から拾う */
function strongSlotIndices(slots: Slot[]): number[] {
  return slots
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.start % 4 === 0)
    .map(({ i }) => i);
}

/**
 * アンカー（強拍に固定した音）から弱拍スロットを線形補間で埋める。
 * anchors: slotIndex → deg のマップ。
 */
function fillContour(slots: Slot[], anchors: Map<number, number>): number[] {
  const degs = new Array<number>(slots.length);
  const anchorIdx = [...anchors.keys()].sort((a, b) => a - b);

  for (let i = 0; i < slots.length; i++) {
    if (anchors.has(i)) {
      degs[i] = anchors.get(i)!;
      continue;
    }
    // 直前・直後のアンカーを探す
    const prev = anchorIdx.filter((a) => a < i).pop();
    const next = anchorIdx.find((a) => a > i);
    if (prev !== undefined && next !== undefined) {
      const pDeg = anchors.get(prev)!;
      const nDeg = anchors.get(next)!;
      const t = (slots[i].start - slots[prev].start) / (slots[next].start - slots[prev].start);
      degs[i] = clampDeg(Math.round(pDeg + (nDeg - pDeg) * t));
    } else if (prev !== undefined) {
      // 末尾側: 直前アンカーを保つ（後段の展開でさらに動くため素直に）
      degs[i] = anchors.get(prev)!;
    } else if (next !== undefined) {
      degs[i] = anchors.get(next)!;
    } else {
      degs[i] = 0;
    }
  }
  return degs;
}

/** モチーフらしさスコア（大きいほど良い）: 跳躍と同音連打を嫌い、順次進行を好む */
function scoreDegs(degs: number[]): number {
  let score = 0;
  let run = 1;
  for (let i = 1; i < degs.length; i++) {
    const iv = Math.abs(degs[i] - degs[i - 1]);
    if (iv === 0) {
      run++;
      if (run > 2) score -= 2;
    } else {
      run = 1;
      if (iv === 1 || iv === 2) score += 1; // 順次・跳躍小
      if (iv > 3) score -= 2;
      if (iv > 5) score -= 3;
    }
  }
  return score;
}

/**
 * 1つのリズムテンプレートで2小節モチーフを組み立てる。
 * 必須音を強拍に置く順列をすべて試し、輪郭スコア最良を採用する。
 */
export function buildMotif(req: MotifRequest): KNote[] {
  const { firstDeg, requiredDegs, rhythm, seed } = req;
  const slots = toSlots(rhythm.durs);
  const strong = strongSlotIndices(slots); // 例: [0,4,8,12] のスロットindex

  // スロット0（曲頭）は必ず firstDeg
  // 残りの強拍スロットに必須音を割り当てる
  const openStrong = strong.filter((i) => i !== 0);
  const rand = mulberry32(seed);

  let best: { degs: number[]; score: number } | null = null;

  // 必須音の並べ方をすべて試す（3音なら6通り）
  for (const perm of permutations(requiredDegs)) {
    const anchors = new Map<number, number>();
    anchors.set(0, firstDeg);
    // 必須音を強拍スロットへ。強拍が足りなければ余った音は末尾の空きスロットへ
    const extra: number[] = [];
    perm.forEach((deg, k) => {
      if (k < openStrong.length) anchors.set(openStrong[k], deg);
      else extra.push(deg);
    });
    // 余り音（強拍が足りない場合のみ）を空きスロットの後方から詰める
    if (extra.length) {
      for (let i = slots.length - 1; i >= 0 && extra.length; i--) {
        if (!anchors.has(i)) anchors.set(i, extra.pop()!);
      }
    }

    const degs = fillContour(slots, anchors);
    // seed 由来の微小なタイブレークで「もういちど作る」に変化を出す
    const score = scoreDegs(degs) + rand() * 0.5;
    if (!best || score > best.score) best = { degs, score };
  }

  const notes: KNote[] = slots.map((s, i) => ({
    start: s.start,
    dur: s.dur,
    midi: degToMidi(best!.degs[i]),
  }));

  return sanitize(notes, MOTIF_STEPS);
}

/**
 * ①②で選んだ音から、リズム違いの3候補を生成する。
 * seed でテンプレートの並びと音配置が決まるので、「もういちど作る」で別の3候補になる。
 */
export function buildMotifCandidates(
  firstDeg: number,
  requiredDegs: number[],
  seed: number,
): MotifCandidate[] {
  const rand = mulberry32(seed);

  // テンプレートを seed でシャッフルし、先頭3つを採用
  const shuffled = [...RHYTHM_TEMPLATES];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const chosen = shuffled.slice(0, 3);

  return chosen.map((rhythm, idx) => ({
    templateId: rhythm.id,
    label: rhythm.label,
    emoji: rhythm.emoji,
    notes: buildMotif({ firstDeg, requiredDegs, rhythm, seed: seed + idx * 7919 }),
  }));
}
