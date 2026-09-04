/**
 * PianoSynth — アコースティックピアノ音源（Tone.Sampler / 実サンプル）
 *
 * public/samples/piano/ の mp3（tonejs-instruments のピアノ音）を使う。
 * 3半音おき（C・D#・F#・A ×各オクターブ ＋ C8）の29サンプルをロードし、
 * その間の音は Tone がピッチシフトで補間する。
 * getPianoSampler() は KanadePlayer から melody / 伴奏の両方に使われる想定。
 */

import * as Tone from 'tone';

/** サンプルの配信ベースURL（GitHub Pages のサブパスにも追従） */
export const PIANO_BASE_URL = `${import.meta.env.BASE_URL}samples/piano/`;

/**
 * ロードするサンプル（キー=Tone音名、値=ファイル名）。ファイルは "s"=♯ 表記。
 *
 * 実使用音域は MIDI 36(C2)〜79(G5)（伴奏 C2-A3 / メロディ C4-G5）なので
 * オクターブ2〜5 の3半音刻み＝16音だけを読み込む。
 * 各サンプルは 3.5秒・96kbps モノラルに切り詰め済み（合計約0.7MB）。
 * ※ スマホ回線での初回ロードを軽くするため意図的に絞っている。
 */
function buildSampleMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (let oct = 2; oct <= 5; oct++) {
    map[`C${oct}`] = `C${oct}.mp3`;
    map[`D#${oct}`] = `Ds${oct}.mp3`;
    map[`F#${oct}`] = `Fs${oct}.mp3`;
    map[`A${oct}`] = `A${oct}.mp3`;
  }
  return map;
}

/** サンプルマップ（realtime再生・オフライン書き出しで共用） */
export const PIANO_SAMPLE_MAP = buildSampleMap();

let sampler: Tone.Sampler | null = null;
let reverb: Tone.Reverb | null = null;
let loadPromise: Promise<void> | null = null;

export function getPianoSampler(): Tone.Sampler {
  if (!sampler) {
    reverb = new Tone.Reverb({ decay: 1.8, wet: 0.2 }).toDestination();
    let resolveLoad!: () => void;
    loadPromise = new Promise<void>((res) => {
      resolveLoad = res;
    });
    sampler = new Tone.Sampler({
      urls: PIANO_SAMPLE_MAP,
      baseUrl: PIANO_BASE_URL,
      release: 1.2,
      onload: () => resolveLoad(),
    }).connect(reverb);
    sampler.volume.value = -4;
  }
  return sampler;
}

let ready = false;

/** サンプル・リバーブとも準備完了しているか（同期判定・UIの出し分け用） */
export function isPianoReady(): boolean {
  return ready;
}

/**
 * 初回再生前に呼ぶ。以下の非同期準備をすべて待つ:
 *  - サンプル(mp3)の読み込み
 *  - Reverb のインパルス応答（畳み込みバッファ）の生成
 * どちらか未完了のまま再生すると「buffer is not loaded」で落ちるため。
 *
 * UIをブロックしたくない箇所では await せずに呼び（先読みだけ走らせ）、
 * isPianoReady() で鳴らせるかを判定する。
 */
export function preloadPiano(): Promise<void> {
  const s = getPianoSampler();
  const sampleReady = s.loaded ? Promise.resolve() : (loadPromise ?? Promise.resolve());
  const reverbReady = reverb ? reverb.ready : Promise.resolve();
  return Promise.all([sampleReady, reverbReady]).then(() => {
    ready = true;
  });
}
