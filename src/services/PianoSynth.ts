/**
 * PianoSynth — やわらかいピアノ風の音源（Tone.js シンセ）
 *
 * 実サンプル音源は同梱していないため、外部アセット不要の PolySynth で
 * ピアノに近いまろやかな音色を合成する。
 * getPianoSampler() は KanadePlayer から melody / 伴奏の両方に使われる想定。
 */

import * as Tone from 'tone';

let synth: Tone.PolySynth<Tone.Synth> | null = null;
let reverb: Tone.Reverb | null = null;

export function getPianoSampler(): Tone.PolySynth<Tone.Synth> {
  if (!synth) {
    reverb = new Tone.Reverb({ decay: 1.8, wet: 0.2 }).toDestination();
    synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: {
        attack: 0.006,
        decay: 0.5,
        sustain: 0.18,
        release: 1.1,
      },
    }).connect(reverb);
    synth.volume.value = -6;
    synth.maxPolyphony = 32;
  }
  return synth;
}

/** サンプルの事前ロードは不要（シンセ音源のため即完了） */
export function preloadPiano(): Promise<void> {
  getPianoSampler();
  return Promise.resolve();
}
