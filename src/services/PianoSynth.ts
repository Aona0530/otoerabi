/**
 * PianoSynth — アコースティックピアノ音源（Tone.Sampler / 実サンプル）
 *
 * public/samples/piano/ の mp3（tonejs-instruments のピアノ音）を使う。
 * 3半音おき（C・D#・F#・A ×各オクターブ ＋ C8）の29サンプルをロードし、
 * その間の音は Tone がピッチシフトで補間する。
 * getPianoSampler() は KanadePlayer から melody / 伴奏の両方に使われる想定。
 */

import * as Tone from 'tone';

const BASE_URL = `${import.meta.env.BASE_URL}samples/piano/`;

/** ロードするサンプル（キー=Tone音名、値=ファイル名）。ファイルは "s"=♯ 表記 */
function buildSampleMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (let oct = 1; oct <= 7; oct++) {
    map[`C${oct}`] = `C${oct}.mp3`;
    map[`D#${oct}`] = `Ds${oct}.mp3`;
    map[`F#${oct}`] = `Fs${oct}.mp3`;
    map[`A${oct}`] = `A${oct}.mp3`;
  }
  map['C8'] = 'C8.mp3';
  return map;
}

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
      urls: buildSampleMap(),
      baseUrl: BASE_URL,
      release: 1.2,
      onload: () => resolveLoad(),
    }).connect(reverb);
    sampler.volume.value = -4;
  }
  return sampler;
}

/**
 * 初回再生前に呼ぶ。以下の非同期準備をすべて待つ:
 *  - サンプル(mp3)の読み込み
 *  - Reverb のインパルス応答（畳み込みバッファ）の生成
 * どちらか未完了のまま再生すると「buffer is not loaded」で落ちるため。
 */
export function preloadPiano(): Promise<void> {
  const s = getPianoSampler();
  const sampleReady = s.loaded ? Promise.resolve() : (loadPromise ?? Promise.resolve());
  const reverbReady = reverb ? reverb.ready : Promise.resolve();
  return Promise.all([sampleReady, reverbReady]).then(() => undefined);
}
