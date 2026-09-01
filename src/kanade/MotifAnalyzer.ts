/**
 * MotifAnalyzer — モチーフの音楽的特徴の抽出と、旋律進行のサンプリング
 *
 * KanadeEngine が展開部・終止句を作るときに使う。
 * - analyzeMotif: モチーフのリズム列・順次進行率・観測音程を集計
 * - sampleInterval: 方向バイアスつきで次の音への度数移動を確率的に選ぶ
 *   （順次進行を好み、大跳躍を避ける Markov 風のウォーク）
 */

import type { DurEighths, KNote } from './scale';
import { midiToDeg } from './scale';

export interface MotifAnalysis {
  /** モチーフの音価列（フォールバックのリズムに使う） */
  rhythm: DurEighths[];
  /** 順次進行（度数差±1）の割合（0〜1） */
  stepwiseRatio: number;
  /** 観測された度数音程（連続音の差分） */
  intervals: number[];
}

/** モチーフを分析して特徴量を返す */
export function analyzeMotif(notes: KNote[]): MotifAnalysis {
  const sorted = [...notes].sort((a, b) => a.start - b.start);
  const rhythm = sorted.map((n) => n.dur);
  const degs = sorted.map((n) => midiToDeg(n.midi));

  const intervals: number[] = [];
  let stepwise = 0;
  let moving = 0;
  for (let i = 1; i < degs.length; i++) {
    const iv = degs[i] - degs[i - 1];
    intervals.push(iv);
    if (iv !== 0) {
      moving++;
      if (Math.abs(iv) === 1) stepwise++;
    }
  }

  const stepwiseRatio = moving > 0 ? stepwise / moving : 0.6;
  return { rhythm, stepwiseRatio, intervals };
}

/**
 * 次の音への度数移動を1つサンプリングする。
 *
 * @param analysis モチーフ分析（順次進行率などを反映）
 * @param prev     直前に使った音程（同じ跳躍の連続や即時の反行を抑える）
 * @param bias     方向バイアス（+で上行、-で下行、絶対値が強さ。-1〜1）
 * @param rand     [0,1) の決定的乱数
 */
export function sampleInterval(
  analysis: MotifAnalysis,
  prev: number | null,
  bias: number,
  rand: () => number,
): number {
  const candidates = [-3, -2, -1, 0, 1, 2, 3];

  // 順次進行を好む基本重み。stepwiseRatio が高いほど±1を強める
  const stepBoost = 1 + analysis.stepwiseRatio * 2;

  const weights = candidates.map((iv) => {
    const a = Math.abs(iv);
    let w: number;
    if (a === 0) w = 0.8;
    else if (a === 1) w = 3 * stepBoost;
    else if (a === 2) w = 1.4;
    else w = 0.4; // 3度以上の跳躍は控えめ

    // 方向バイアス: bias と同符号を強め、逆符号を弱める
    if (bias !== 0 && iv !== 0) {
      if (iv * bias > 0) w *= 1 + Math.abs(bias) * 1.6;
      else w *= Math.max(0.12, 1 - Math.abs(bias) * 1.3);
    }

    // 直前と同じ大跳躍の連続、直前の即時反行を抑える
    if (prev !== null) {
      if (a > 1 && iv === prev) w *= 0.5;
      if (a > 1 && iv === -prev) w *= 0.6;
    }

    return w;
  });

  const total = weights.reduce((s, w) => s + w, 0);
  let r = rand() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return 0;
}
