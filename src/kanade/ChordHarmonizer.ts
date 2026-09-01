/**
 * ChordHarmonizer — Viterbi アルゴリズムによるコード推定
 *
 * 8小節のメロディ（KNote[]）から1小節1コード×8を決定する。
 * 構造制約: 1小節目=主和音、4小節目=半終止(D)、8小節目=完全終止(T)。
 * 遷移ルール: D→S禁止、D→D減点、同一コード3連続減点。
 */

import type { KNote } from './scale';
import { STEPS_PER_BAR } from './scale';

type HarmonicFunc = 'T' | 'S' | 'D';

export interface ChordInfo {
  name: string;
  root: number;
  tones: number[];
  func: HarmonicFunc;
}

const MAJOR_CHORDS: ChordInfo[] = [
  { name: 'C',  root: 0, tones: [0, 4, 7],     func: 'T' },
  { name: 'Dm', root: 2, tones: [2, 5, 9],     func: 'S' },
  { name: 'Em', root: 4, tones: [4, 7, 11],    func: 'T' },
  { name: 'F',  root: 5, tones: [5, 9, 0],     func: 'S' },
  { name: 'G',  root: 7, tones: [7, 11, 2],    func: 'D' },
  { name: 'G7', root: 7, tones: [7, 11, 2, 5], func: 'D' },
  { name: 'Am', root: 9, tones: [9, 0, 4],     func: 'T' },
];

const MINOR_CHORDS: ChordInfo[] = [
  { name: 'Am', root: 9, tones: [9, 0, 4],     func: 'T' },
  { name: 'Dm', root: 2, tones: [2, 5, 9],     func: 'S' },
  { name: 'E',  root: 4, tones: [4, 8, 11],    func: 'D' },
  { name: 'E7', root: 4, tones: [4, 8, 11, 2], func: 'D' },
  { name: 'F',  root: 5, tones: [5, 9, 0],     func: 'S' },
  { name: 'G',  root: 7, tones: [7, 11, 2],    func: 'D' },
  { name: 'C',  root: 0, tones: [0, 4, 7],     func: 'T' },
];

/**
 * メロディの1小節とコードの適合スコア。
 * 拍頭（1・3拍目=重み2、2・4拍目=重み1）の音がコードトーンかどうかで判定。
 * 音価が長いほど重みを加算。
 */
function fitScore(notes: KNote[], barIdx: number, chord: ChordInfo): number {
  const barStart = barIdx * STEPS_PER_BAR;
  const barEnd = barStart + STEPS_PER_BAR;
  const barNotes = notes.filter(n => n.start >= barStart && n.start < barEnd);

  if (barNotes.length === 0) return 0;

  let score = 0;
  for (const n of barNotes) {
    const pc = n.midi % 12;
    const beatPos = n.start - barStart;
    // 1拍目(0)・3拍目(4)は重み2、2拍目(2)・4拍目(6)は重み1
    const beatWeight = (beatPos === 0 || beatPos === 4) ? 2 : 1;
    const durWeight = n.dur >= 4 ? 1.5 : n.dur >= 2 ? 1.0 : 0.7;

    if (chord.tones.includes(pc)) {
      score += beatWeight * durWeight;
      // ルートまたは3度が拍頭なら微加点
      if (beatPos === 0 && (pc === chord.root || pc === chord.tones[1])) {
        score += 0.5;
      }
    } else {
      // 非和声音: 経過音・刺繍音として説明できるなら軽減
      score -= beatWeight * 0.3;
    }
  }

  return score;
}

/** 遷移スコア: T/S/D の流れの文法 */
function transitionScore(prev: ChordInfo, curr: ChordInfo): number {
  // D → S は禁止
  if (prev.func === 'D' && curr.func === 'S') return -10;
  // D → D は減点
  if (prev.func === 'D' && curr.func === 'D') return -2;
  // S → D は自然
  if (prev.func === 'S' && curr.func === 'D') return 1;
  // D → T は解決で加点
  if (prev.func === 'D' && curr.func === 'T') return 2;
  return 0;
}

/** 構造制約ボーナス */
function structureBonus(
  barIdx: number,
  chord: ChordInfo,
  mode: 'major' | 'minor',
): number {
  const tonicName = mode === 'major' ? 'C' : 'Am';
  let bonus = 0;

  // 1小節目: 主和音固定
  if (barIdx === 0) {
    bonus += chord.name === tonicName ? 8 : -8;
  }
  // 4小節目: ドミナント優先（半終止）
  if (barIdx === 3) {
    bonus += chord.func === 'D' ? 5 : -2;
  }
  // 5〜7小節目（転）: サブドミナント・代理和音を加点
  if (barIdx >= 4 && barIdx <= 6) {
    if (chord.func === 'S') bonus += 1;
  }
  // 7小節目: ドミナント準備
  if (barIdx === 6) {
    bonus += chord.func === 'D' ? 3 : 0;
  }
  // 8小節目: 完全終止（主和音）
  if (barIdx === 7) {
    bonus += chord.name === tonicName ? 8 : -8;
  }

  return bonus;
}

export type HarmonizeMode = 'major' | 'minor';

/**
 * Viterbi アルゴリズムで8小節のコード進行を決定する。
 *
 * @param notes 8小節分のメロディ（KNote[]）
 * @param mode  'major'（ハ長調）or 'minor'（イ短調）
 * @returns 8個の ChordInfo 配列（1小節1コード）
 */
export function harmonize(
  notes: KNote[],
  mode: HarmonizeMode = 'major',
): ChordInfo[] {
  const chords = mode === 'major' ? MAJOR_CHORDS : MINOR_CHORDS;
  const numBars = 8;

  // dp[bar][chordIdx] = { score, prevIdx }
  const dp: Array<Array<{ score: number; prevIdx: number }>> = [];

  // 1小節目: 初期化
  dp[0] = chords.map((chord) => ({
    score: fitScore(notes, 0, chord) + structureBonus(0, chord, mode),
    prevIdx: -1,
  }));

  // 2〜8小節目: 遷移
  for (let bar = 1; bar < numBars; bar++) {
    dp[bar] = chords.map((chord) => {
      let bestScore = -Infinity;
      let bestPrev = 0;

      for (let pi = 0; pi < chords.length; pi++) {
        const prevScore = dp[bar - 1][pi].score;
        const trans = transitionScore(chords[pi], chord);

        // 同一コード3連続の減点
        let repeatPenalty = 0;
        if (bar >= 2) {
          const ppIdx = dp[bar - 1][pi].prevIdx;
          if (ppIdx >= 0 && chords[ppIdx].name === chords[pi].name && chords[pi].name === chord.name) {
            repeatPenalty = -5;
          }
        }

        const total = prevScore + trans + repeatPenalty;
        if (total > bestScore) {
          bestScore = total;
          bestPrev = pi;
        }
      }

      return {
        score: bestScore + fitScore(notes, bar, chord) + structureBonus(bar, chord, mode),
        prevIdx: bestPrev,
      };
    });
  }

  // バックトラック
  const result: ChordInfo[] = new Array(numBars);
  let bestIdx = 0;
  let bestScore = -Infinity;
  for (let ci = 0; ci < chords.length; ci++) {
    if (dp[numBars - 1][ci].score > bestScore) {
      bestScore = dp[numBars - 1][ci].score;
      bestIdx = ci;
    }
  }

  result[numBars - 1] = chords[bestIdx];
  for (let bar = numBars - 2; bar >= 0; bar--) {
    bestIdx = dp[bar + 1][bestIdx].prevIdx;
    result[bar] = chords[bestIdx];
  }

  return result;
}
