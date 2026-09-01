/**
 * 奏 - Kanade - 8小節テーマ自動生成エンジン
 *
 * 入力された2小節のモチーフから、JOC「モチーフ即興」の音楽ロジックに基づき
 * 残り6小節を生成して起承転結のある8小節テーマを完成させる。
 *
 * - 3〜4小節目（承・展開部）: ゼクエンツ / モチーフ変奏 / 拍ずらし
 * - 5〜8小節目（転・結）: フレーズ構造テンプレート（2:2 / 1:1:2 / 4）
 * - 数理最適化（制約充足）:
 *   - 頂点制約: 最高音が必ず5〜7小節目に出現する
 *   - 強拍回避制約: 5小節目の1拍目を休符にして推進力を生む
 * - 複数候補を生成してスコアリングし、最良の1つを採用する
 */

import type { DurEighths, KNote, ScaleMode } from './scale';
import {
  DEG_MAX,
  MOTIF_STEPS,
  STEPS_PER_BAR,
  THEME_STEPS,
  clampDeg,
  degToMidi,
  midiToDeg,
  sanitize,
} from './scale';
import type { MotifAnalysis } from './MotifAnalyzer';
import { analyzeMotif, sampleInterval } from './MotifAnalyzer';
import { harmonize } from './ChordHarmonizer';
import type { TextureLabel } from './AccompanimentGen';
import { generateAccompaniment } from './AccompanimentGen';

export type DevPattern = 'sequence' | 'variation';
export type PhraseTemplate = '2:2' | '1:1:2' | '4';

export interface GenerateOptions {
  devPattern: DevPattern | 'auto';
  phraseTemplate: PhraseTemplate | 'auto';
  /** 伴奏テクスチャ（省略時は伴奏なし） */
  texture?: TextureLabel | 'おまかせ';
  /** BPM（伴奏の自動テクスチャ選択に使用） */
  bpm?: number;
  /** 調性（省略時は major） */
  mode?: 'major' | 'minor';
  /** 乱数シード（省略時はランダム） */
  seed?: number;
}

/** mulberry32: 32bit シード → 決定的な [0,1) 乱数列 */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GenerateResult {
  notes: KNote[];
  devPattern: DevPattern;
  phraseTemplate: PhraseTemplate;
  chords: import('./ChordHarmonizer').ChordInfo[];
  accompaniment: KNote[];
}

const CANDIDATES = 24;

interface DegNote {
  start: number;
  dur: DurEighths;
  deg: number;
}

function toDeg(notes: KNote[], mode: ScaleMode = 'major'): DegNote[] {
  return notes.map((n) => ({ start: n.start, dur: n.dur, deg: midiToDeg(n.midi, mode) }));
}

function toKNotes(notes: DegNote[], mode: ScaleMode = 'major'): KNote[] {
  return notes.map((n) => ({ start: n.start, dur: n.dur, midi: degToMidi(clampDeg(n.deg), mode) }));
}

function pick<T>(arr: readonly T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

/** 全音が音域内に収まる移調量だけを候補から選ぶ */
function fittingTranspositions(notes: DegNote[], candidates: number[]): number[] {
  const min = Math.min(...notes.map((n) => n.deg));
  const max = Math.max(...notes.map((n) => n.deg));
  return candidates.filter((t) => min + t >= 0 && max + t <= DEG_MAX);
}

function transpose(notes: DegNote[], deg: number, offsetSteps: number): DegNote[] {
  return notes.map((n) => ({ ...n, start: n.start + offsetSteps, deg: clampDeg(n.deg + deg) }));
}

// ─────────────────────────────────────────────
// 3〜4小節目（展開部）
// ─────────────────────────────────────────────

/** パターンA: ゼクエンツ（同型反復）— モチーフの形を保ったまま並行移動 */
function devSequence(motif: DegNote[], rand: () => number): DegNote[] {
  const ts = fittingTranspositions(motif, [2, 1, -1, 3, -2]);
  const t = ts.length ? pick(ts, rand) : 0;
  return transpose(motif, t, MOTIF_STEPS);
}

/** パターンB: モチーフ変奏 — 後半のリズム縮小 or 反行形 */
function devVariation(motif: DegNote[], rand: () => number): DegNote[] {
  const bar1 = motif.filter((n) => n.start < STEPS_PER_BAR);
  const bar2 = motif.filter((n) => n.start >= STEPS_PER_BAR);
  // 3小節目はモチーフ1小節目をそのまま再現
  const out: DegNote[] = bar1.map((n) => ({ ...n, start: n.start + MOTIF_STEPS }));

  const src = bar2.length ? bar2 : bar1;
  if (rand() < 0.5 && src.length >= 2) {
    // リズム縮小: 音価を半分にして同じ音列を2回繰り返す
    let cursor = MOTIF_STEPS + STEPS_PER_BAR;
    const end = MOTIF_STEPS + STEPS_PER_BAR * 2;
    for (let rep = 0; rep < 2 && cursor < end; rep++) {
      for (const n of src) {
        if (cursor >= end) break;
        const dur = (n.dur >= 2 ? n.dur / 2 : 1) as DurEighths;
        out.push({ start: cursor, dur, deg: n.deg });
        cursor += dur;
      }
    }
  } else {
    // 反行形: 最初の音を軸に上下反転
    const pivot = src[0].deg;
    const barStart = src[0].start - (src[0].start % STEPS_PER_BAR);
    for (const n of src) {
      out.push({
        start: n.start - barStart + MOTIF_STEPS + STEPS_PER_BAR,
        dur: n.dur,
        deg: clampDeg(2 * pivot - n.deg),
      });
    }
  }
  return out;
}

// ─────────────────────────────────────────────
// 5〜8小節目（転・結）
// ─────────────────────────────────────────────

/**
 * 終止句（7〜8小節目）: マルコフ連鎖で下行しながら主音へ向かい、
 * 8小節目は主音の二分音符で結ぶ。
 * minor の場合はラ（deg 5）で終止する。
 */
function makeCadence(fromDeg: number, analysis: MotifAnalysis, mode: 'major' | 'minor', rand: () => number): DegNote[] {
  let tonic: number;
  if (mode === 'minor') {
    // イ短調: ラ = deg 5（A4）
    tonic = 5;
  } else {
    tonic = fromDeg >= 4 ? 7 : 0; // 高めにいるなら C5、低めなら C4 で結ぶ
  }
  const out: DegNote[] = [];

  // 7小節目: モチーフ1小節目のリズムを借りて主音に近づく
  const rhythm = analysis.rhythm.length ? analysis.rhythm : ([2, 2, 2, 2] as DurEighths[]);
  let cursor = STEPS_PER_BAR * 6;
  let deg = fromDeg;
  let prev: number | null = null;
  const barEnd = STEPS_PER_BAR * 7;
  let i = 0;
  while (cursor < barEnd) {
    const dur = rhythm[i % rhythm.length];
    const remaining = Math.ceil((barEnd - cursor) / 2); // 残りの音数の見積もり
    const gap = tonic - deg;
    // 主音への距離に応じて下行（または上行）バイアスをかける
    const bias = Math.max(-1, Math.min(1, gap / Math.max(1, remaining)));
    if (out.length > 0) {
      const iv = sampleInterval(analysis, prev, bias, rand);
      deg = clampDeg(deg + iv);
      prev = iv;
    }
    const fitted = ([4, 2, 1] as DurEighths[]).find((d) => d <= Math.min(dur, barEnd - cursor))!;
    out.push({ start: cursor, dur: fitted, deg });
    cursor += fitted;
    i++;
  }

  // 直前の音を導音 or 上主音に寄せてから主音で終止（2→1 / 7→1 の定型）
  if (out.length >= 1) {
    const last = out[out.length - 1];
    const approach = rand() < 0.5 ? tonic + 1 : tonic - 1;
    last.deg = clampDeg(approach);
  }
  out.push({ start: STEPS_PER_BAR * 7, dur: 4, deg: tonic });
  return out;
}

/** 頂点を作るための移調量: 既出の最高音を超えるよう持ち上げる */
function liftForPeak(notes: DegNote[], prevMax: number, rand: () => number): number {
  const max = Math.max(...notes.map((n) => n.deg));
  const want = Math.min(DEG_MAX, prevMax + pick([1, 2], rand));
  return Math.max(0, Math.min(want - max, DEG_MAX - max));
}

/** 構造1「2小節:2小節」（安定型）: モチーフ全体を高位置でゼクエンツ → 終止句 */
function concStable(motif: DegNote[], analysis: MotifAnalysis, prevMax: number, mode: 'major' | 'minor', rand: () => number): DegNote[] {
  const lift = liftForPeak(motif, prevMax, rand);
  const moved = transpose(motif, lift, STEPS_PER_BAR * 4);
  const lastDeg = moved[moved.length - 1].deg;
  return [...moved, ...makeCadence(lastDeg, analysis, mode, rand)];
}

/** 構造2「1:1:2」（小刻みな展開型）: 1小節の断片を2回ゼクエンツ → 終止句 */
function concFragmented(motif: DegNote[], analysis: MotifAnalysis, prevMax: number, mode: 'major' | 'minor', rand: () => number): DegNote[] {
  const bar1 = motif.filter((n) => n.start < STEPS_PER_BAR);
  const frag = bar1.length ? bar1 : motif.map((n) => ({ ...n, start: n.start % STEPS_PER_BAR }));
  const lift = liftForPeak(frag, prevMax, rand);
  const step = pick([1, -1, 2], rand);

  const bar5 = frag.map((n) => ({ ...n, start: (n.start % STEPS_PER_BAR) + STEPS_PER_BAR * 4, deg: clampDeg(n.deg + lift) }));
  const bar6 = frag.map((n) => ({ ...n, start: (n.start % STEPS_PER_BAR) + STEPS_PER_BAR * 5, deg: clampDeg(n.deg + lift + step) }));
  const lastDeg = bar6[bar6.length - 1].deg;
  return [...bar5, ...bar6, ...makeCadence(lastDeg, analysis, mode, rand)];
}

/** 構造3「4小節がひとつの大きなフレーズ」（流麗型）: マルコフ連鎖で山なりの線を描く */
function concFlowing(motif: DegNote[], analysis: MotifAnalysis, prevMax: number, mode: 'major' | 'minor', rand: () => number): DegNote[] {
  const peakTarget = Math.min(DEG_MAX, prevMax + pick([1, 2], rand));
  const rhythm = analysis.rhythm.length ? analysis.rhythm : ([1, 1, 2, 1, 1, 2] as DurEighths[]);

  const out: DegNote[] = [];
  let cursor = STEPS_PER_BAR * 4;
  let deg = motif[motif.length - 1].deg;
  let prev: number | null = null;
  const walkEnd = STEPS_PER_BAR * 7 - 2; // 終止音の手前まで
  const peakStep = STEPS_PER_BAR * 5 + 4; // 6小節目なかばに頂点を置く
  let peaked = false;
  let i = 0;

  while (cursor < walkEnd) {
    const dur = rhythm[i % rhythm.length];
    if (out.length > 0) {
      // 頂点までは上行、頂点後は下行のバイアス
      const bias = cursor < peakStep ? 0.8 : -0.7;
      const iv = sampleInterval(analysis, prev, bias, rand);
      deg = clampDeg(deg + iv);
      prev = iv;
    }
    // 頂点ステップ付近で確実に最高音を踏む
    if (!peaked && cursor >= peakStep) {
      deg = peakTarget;
      peaked = true;
    }
    const fitted = ([4, 2, 1] as DurEighths[]).find((d) => d <= Math.min(dur, walkEnd - cursor))!;
    out.push({ start: cursor, dur: fitted, deg });
    cursor += fitted;
    i++;
  }

  // 結び: 導音/上主音 → 主音の二分音符
  const tonic = mode === 'minor' ? 5 : (deg >= 4 ? 7 : 0);
  out.push({ start: walkEnd, dur: 2, deg: clampDeg(tonic + pick([1, -1], rand)) });
  out.push({ start: STEPS_PER_BAR * 7, dur: 4, deg: tonic });
  return out;
}

// ─────────────────────────────────────────────
// 制約充足とスコアリング
// ─────────────────────────────────────────────

/** 頂点制約: 最高音が5〜7小節目（step 32〜55）に出現するよう補正 */
function enforcePeak(notes: DegNote[]): DegNote[] {
  const inTurn = (n: DegNote) => n.start >= STEPS_PER_BAR * 4 && n.start < STEPS_PER_BAR * 7;
  const turnNotes = notes.filter(inTurn);
  if (!turnNotes.length) return notes;

  const maxAll = Math.max(...notes.map((n) => n.deg));
  const maxTurn = Math.max(...turnNotes.map((n) => n.deg));
  if (maxTurn >= maxAll) return notes;

  const lift = Math.min(maxAll - maxTurn, DEG_MAX - maxTurn);
  return notes.map((n) => (inTurn(n) ? { ...n, deg: clampDeg(n.deg + lift) } : n));
}

/** 強拍回避制約: 5小節目の1拍目を休符にしてメロディに推進力を生む */
function applyBreath(notes: DegNote[]): DegNote[] {
  const barStart = STEPS_PER_BAR * 4;
  return notes.map((n) => {
    if (n.start !== barStart) return n;
    const dur = n.dur > 1 ? ((n.dur / 2) as DurEighths) : 1;
    return { ...n, start: barStart + 1, dur };
  });
}

function scoreTheme(notes: DegNote[], analysis: MotifAnalysis, mode: 'major' | 'minor' = 'major'): number {
  let score = 0;
  const degs = notes.map((n) => n.deg);

  // 終止: 主音で終わると高評価（major: ド=0/7、minor: ラ=5）
  const last = degs[degs.length - 1];
  if (mode === 'minor') {
    if (last === 5) score += 12;
  } else {
    if (last === 0 || last === 7) score += 12;
  }

  // 跳躍の滑らかさ: 大きすぎる跳躍を減点
  let stepwise = 0;
  let moving = 0;
  for (let i = 1; i < degs.length; i++) {
    const iv = Math.abs(degs[i] - degs[i - 1]);
    if (iv > 0) {
      moving++;
      if (iv === 1) stepwise++;
    }
    if (iv > 3) score -= 2;
    if (iv > 5) score -= 3;
  }

  // 順次進行の割合がモチーフに近いほどモチーフらしい
  if (moving > 0) {
    score -= Math.abs(stepwise / moving - analysis.stepwiseRatio) * 8;
  }

  // 同音の繰り返しすぎを減点
  let run = 1;
  for (let i = 1; i < degs.length; i++) {
    run = degs[i] === degs[i - 1] ? run + 1 : 1;
    if (run > 3) score -= 2;
  }

  // 頂点が5〜7小節目だけに出る（他の小節と同率1位でない）と加点
  const maxAll = Math.max(...degs);
  const outsideMax = Math.max(
    ...notes.filter((n) => n.start < STEPS_PER_BAR * 4 || n.start >= STEPS_PER_BAR * 7).map((n) => n.deg),
    -1,
  );
  if (maxAll > outsideMax) score += 6;

  return score;
}

// ─────────────────────────────────────────────
// 公開API
// ─────────────────────────────────────────────

/**
 * 2小節のモチーフから8小節テーマを生成する。
 * 候補を複数生成し、制約充足フィルタとスコアで最良の1つを返す。
 */
export function generateTheme(motifInput: KNote[], opts: GenerateOptions): GenerateResult {
  const motifK = sanitize(motifInput, MOTIF_STEPS);
  if (motifK.length === 0) {
    throw new Error('モチーフが空です。2小節のメロディーを入力してください。');
  }
  const rand = mulberry32(opts.seed ?? (Date.now() ^ 0xdeadbeef));
  const motif = toDeg(motifK);
  const analysis = analyzeMotif(motifK);

  const mode = opts.mode ?? 'major';
  const breath = rand() < 0.8;
  let best: { notes: DegNote[]; dev: DevPattern; tmpl: PhraseTemplate; score: number } | null = null;

  for (let k = 0; k < CANDIDATES; k++) {
    const dev: DevPattern =
      opts.devPattern === 'auto' ? pick(['sequence', 'variation'] as const, rand) : opts.devPattern;
    const tmpl: PhraseTemplate =
      opts.phraseTemplate === 'auto' ? pick(['2:2', '1:1:2', '4'] as const, rand) : opts.phraseTemplate;

    const bars34 =
      dev === 'sequence' ? devSequence(motif, rand) : devVariation(motif, rand);
    const prevMax = Math.max(...[...motif, ...bars34].map((n) => n.deg));
    const bars58 =
      tmpl === '2:2'
        ? concStable(motif, analysis, prevMax, mode, rand)
        : tmpl === '1:1:2'
          ? concFragmented(motif, analysis, prevMax, mode, rand)
          : concFlowing(motif, analysis, prevMax, mode, rand);

    let theme = [...motif, ...bars34, ...bars58];
    theme = enforcePeak(theme);
    if (breath) theme = applyBreath(theme);

    const score = scoreTheme(theme, analysis, mode);
    if (!best || score > best.score) best = { notes: theme, dev, tmpl, score };
  }

  const finalNotes = sanitize(toKNotes(best!.notes, mode), THEME_STEPS);
  const chords = harmonize(finalNotes, mode);
  const accompaniment = opts.texture
    ? generateAccompaniment(chords, finalNotes, opts.texture, opts.bpm ?? 92)
    : [];

  return {
    notes: finalNotes,
    devPattern: best!.dev,
    phraseTemplate: best!.tmpl,
    chords,
    accompaniment,
  };
}
