/**
 * KanadePlayer — 生成テーマの再生（Tone.js）
 *
 * 音色はピアノ風シンセと箏風（PluckSynth）の2種。
 * 再生中の音のインデックスをコールバックで通知し、楽譜のハイライトに使う。
 */

import * as Tone from 'tone';
import { getPianoSampler, preloadPiano } from '@/services/PianoSynth';
import type { KNote } from './scale';
import { midiToName } from './scale';

export type KanadeInstrument = 'piano' | 'koto';

let koto: Tone.PluckSynth | null = null;
let kotoReverb: Tone.Reverb | null = null;
let part: Tone.Part | null = null;
let accompPart: Tone.Part | null = null;
let endEventId: number | null = null;

function getKoto(): Tone.PluckSynth {
  if (!koto) {
    kotoReverb = new Tone.Reverb({ decay: 2.4, wet: 0.28 }).toDestination();
    koto = new Tone.PluckSynth({
      attackNoise: 2.2,
      dampening: 3400,
      resonance: 0.97,
    }).connect(kotoReverb);
    koto.volume.value = -2;
  }
  return koto;
}

let accompKoto: Tone.PluckSynth | null = null;

function getAccompKoto(): Tone.PluckSynth {
  if (!accompKoto) {
    const reverb = new Tone.Reverb({ decay: 2.0, wet: 0.2 }).toDestination();
    accompKoto = new Tone.PluckSynth({
      attackNoise: 1.5,
      dampening: 2800,
      resonance: 0.95,
    }).connect(reverb);
    accompKoto.volume.value = -8;
  }
  return accompKoto;
}

export interface PlayHandle {
  stop: () => void;
}

export async function playTheme(
  notes: KNote[],
  bpm: number,
  instrument: KanadeInstrument,
  onNote: (index: number) => void,
  onEnd: () => void,
  accompNotes?: KNote[],
): Promise<PlayHandle> {
  await Tone.start();
  stopTheme();

  const inst = instrument === 'piano' ? getPianoSampler() : getKoto();
  if (instrument === 'piano') await preloadPiano();

  const eighthSec = 30 / bpm;
  const events = notes.map((n, idx) => ({
    time: n.start * eighthSec,
    name: midiToName(n.midi),
    durSec: n.dur * eighthSec * 0.92,
    idx,
  }));

  // 伴奏の終了時刻も考慮して totalSec を計算
  const melodyEnd = Math.max(...notes.map((n) => (n.start + n.dur) * eighthSec));
  const accompEnd = accompNotes?.length
    ? Math.max(...accompNotes.map((n) => (n.start + n.dur) * eighthSec))
    : 0;
  const totalSec = Math.max(melodyEnd, accompEnd) + 0.4;

  Tone.getTransport().cancel();
  Tone.getTransport().position = 0;

  part = new Tone.Part((time, ev: (typeof events)[number]) => {
    inst.triggerAttackRelease(ev.name, ev.durSec, time);
    Tone.getDraw().schedule(() => onNote(ev.idx), time);
  }, events).start(0);

  // 伴奏パート（メロディより -6dB）
  if (accompNotes?.length) {
    const accompInst = instrument === 'piano' ? getPianoSampler() : getAccompKoto();
    const accompEvents = accompNotes.map((n) => ({
      time: n.start * eighthSec,
      name: midiToName(n.midi),
      durSec: n.dur * eighthSec * 0.88,
    }));
    accompPart = new Tone.Part((time, ev: (typeof accompEvents)[number]) => {
      accompInst.triggerAttackRelease(ev.name, ev.durSec, time, 0.5);
    }, accompEvents).start(0);
  }

  endEventId = Tone.getTransport().scheduleOnce((time) => {
    Tone.getDraw().schedule(() => {
      onEnd();
      stopTransport();
    }, time);
  }, totalSec);

  Tone.getTransport().start();

  return { stop: stopTheme };
}

function stopTransport() {
  Tone.getTransport().stop();
  Tone.getTransport().cancel();
}

export function stopTheme(): void {
  if (part) {
    part.stop();
    part.dispose();
    part = null;
  }
  if (accompPart) {
    accompPart.stop();
    accompPart.dispose();
    accompPart = null;
  }
  if (endEventId !== null) {
    Tone.getTransport().clear(endEventId);
    endEventId = null;
  }
  stopTransport();
}

/** 入力時のワンショット・プレビュー */
export async function previewNote(midi: number, instrument: KanadeInstrument): Promise<void> {
  await Tone.start();
  const inst = instrument === 'piano' ? getPianoSampler() : getKoto();
  // サンプル未ロードのまま鳴らすと落ちるため、ピアノはロード完了を待つ
  if (instrument === 'piano') await preloadPiano();
  inst.triggerAttackRelease(midiToName(midi), 0.35);
}
