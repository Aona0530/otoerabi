/**
 * audioExport — 生成した曲を MP3 ファイルに書き出す
 *
 * 1. Tone.Offline で曲をオフライン・レンダリング（実ピアノ音源＋簡易リバーブ）
 * 2. 得られた AudioBuffer を lamejs で MP3 にエンコード
 *
 * 実時間再生を待たずに書き出せる。リバーブは非同期IR生成を避けるため
 * アルゴリズミックな Freeverb を使う（畳み込みリバーブより軽く、オフラインで安全）。
 */

import * as Tone from 'tone';
import { Mp3Encoder } from '@breezystack/lamejs';
import type { KNote } from './scale';
import { midiToName } from './scale';
import { PIANO_BASE_URL, PIANO_SAMPLE_MAP } from '@/services/PianoSynth';

const SAMPLE_RATE = 44100;

/** 曲をオフラインでレンダリングして AudioBuffer を得る */
async function renderSong(
  melody: KNote[],
  accompaniment: KNote[],
  bpm: number,
): Promise<AudioBuffer> {
  const eighthSec = 30 / bpm;
  const melodyEnd = Math.max(...melody.map((n) => (n.start + n.dur) * eighthSec), 0);
  const accompEnd = accompaniment.length
    ? Math.max(...accompaniment.map((n) => (n.start + n.dur) * eighthSec), 0)
    : 0;
  const totalSec = Math.max(melodyEnd, accompEnd) + 1.8; // 余韻ぶん

  const rendered = await Tone.Offline(
    async () => {
      const reverb = new Tone.Freeverb({ roomSize: 0.7, dampening: 3000, wet: 0.18 }).toDestination();
      const piano = new Tone.Sampler({
        urls: PIANO_SAMPLE_MAP,
        baseUrl: PIANO_BASE_URL,
        release: 1.2,
      }).connect(reverb);
      piano.volume.value = -4;

      // サンプルの読み込み完了を待つ（ブラウザキャッシュ済みなので速い）
      await Tone.loaded();

      for (const n of melody) {
        piano.triggerAttackRelease(midiToName(n.midi), n.dur * eighthSec * 0.92, n.start * eighthSec);
      }
      for (const n of accompaniment) {
        piano.triggerAttackRelease(midiToName(n.midi), n.dur * eighthSec * 0.88, n.start * eighthSec, 0.5);
      }
    },
    totalSec,
    2,
    SAMPLE_RATE,
  );

  return rendered.get() as unknown as AudioBuffer;
}

/** Float32 [-1,1] → Int16 PCM */
function floatToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/** AudioBuffer → MP3(Blob)。128kbps ステレオ */
function encodeMp3(buffer: AudioBuffer): Blob {
  const channels = Math.min(2, buffer.numberOfChannels);
  const encoder = new Mp3Encoder(channels, buffer.sampleRate, 128);
  const left = floatToInt16(buffer.getChannelData(0));
  const right = channels > 1 ? floatToInt16(buffer.getChannelData(1)) : left;

  const blockSize = 1152;
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < left.length; i += blockSize) {
    const l = left.subarray(i, i + blockSize);
    const r = right.subarray(i, i + blockSize);
    const buf = channels > 1 ? encoder.encodeBuffer(l, r) : encoder.encodeBuffer(l);
    if (buf.length > 0) chunks.push(new Uint8Array(buf));
  }
  const end = encoder.flush();
  if (end.length > 0) chunks.push(new Uint8Array(end));

  return new Blob(chunks as BlobPart[], { type: 'audio/mpeg' });
}

/** 曲を MP3(Blob) に書き出す */
export async function exportSongToMp3(
  melody: KNote[],
  accompaniment: KNote[],
  bpm: number,
): Promise<Blob> {
  const buffer = await renderSong(melody, accompaniment, bpm);
  return encodeMp3(buffer);
}
