/**
 * AccompanimentGen — 左手伴奏パターン生成
 *
 * ChordInfo[] (8小節) からテクスチャに応じた伴奏ノート列を生成する。
 * 音域は C2〜A3 (MIDI 36〜57)。G2(43) より低い位置に3度音程を置かない。
 * 隣り合う小節で共通音を保持し、トップノートの跳躍を最小にする。
 */

import type { KNote, DurEighths } from './scale';
import { STEPS_PER_BAR } from './scale';
import type { ChordInfo } from './ChordHarmonizer';

export type Texture = 'sustained' | 'arpeggio' | 'block' | 'open5th';
export type TextureLabel = 'しずか' | 'ながれ' | 'はずみ' | 'わふう';

const TEXTURE_MAP: Record<TextureLabel, Texture> = {
  'しずか': 'sustained',
  'ながれ': 'arpeggio',
  'はずみ': 'block',
  'わふう': 'open5th',
};

const BASS_LOW = 36;  // C2
const BASS_HIGH = 57; // A3
const G2 = 43;

/** コードトーンをボイシングに変換（音域 C2〜A3） */
function voicing(chord: ChordInfo, texture: Texture): number[] {
  const root = chord.root;
  // ルート音を C2〜C3 の範囲に配置
  let bassRoot = BASS_LOW + root;
  if (bassRoot < BASS_LOW) bassRoot += 12;
  if (bassRoot > 48) bassRoot -= 12; // C3=48 より上なら1オクターブ下げる

  if (texture === 'open5th') {
    // 3度抜き: ルート + 5度のみ
    const fifth = bassRoot + 7;
    return fifth <= BASS_HIGH ? [bassRoot, fifth] : [bassRoot];
  }

  // 通常のボイシング: ルート + 3度 + 5度
  const tones = chord.tones.map(pc => {
    let midi = bassRoot + ((pc - root + 12) % 12);
    // 音域内に収める
    while (midi < BASS_LOW) midi += 12;
    while (midi > BASS_HIGH) midi -= 12;
    return midi;
  });

  // 重複除去 & ソート
  const unique = [...new Set(tones)].sort((a, b) => a - b);

  // G2 より低い位置の3度を除去（濁り防止）
  return unique.filter((midi, i) => {
    if (i === 0) return true; // ルートは常に残す
    if (midi < G2 && i > 0) {
      const interval = midi - unique[i - 1];
      if (interval === 3 || interval === 4) return false; // 短3度・長3度
    }
    return true;
  });
}

/** メロディの活動度（1小節内の音数）を計算 */
function melodyActivity(melody: KNote[], barIdx: number): number {
  const barStart = barIdx * STEPS_PER_BAR;
  const barEnd = barStart + STEPS_PER_BAR;
  return melody.filter(n => n.start >= barStart && n.start < barEnd).length;
}

/** しずか: 全音符〜2分で和音を伸ばす */
function genSustained(
  voices: number[],
  barStart: number,
  _barIdx: number,
  isCadence4: boolean,
  isCadence8: boolean,
): KNote[] {
  if (isCadence8) {
    // 8小節目: 全音符1発
    return [{ start: barStart, dur: 4 as DurEighths, midi: voices[0] }];
  }
  if (isCadence4) {
    // 4小節目: 前半2分 + 後半伸ばし
    return [{ start: barStart, dur: 4 as DurEighths, midi: voices[0] }];
  }
  // 通常: 和音を2分音符×2で
  const notes: KNote[] = [];
  for (const midi of voices.slice(0, 2)) {
    notes.push({ start: barStart, dur: 4 as DurEighths, midi });
  }
  return notes;
}

/** ながれ: 分散和音（8分音符で循環） */
function genArpeggio(
  voices: number[],
  barStart: number,
  barIdx: number,
  melody: KNote[],
  isCadence4: boolean,
  isCadence8: boolean,
): KNote[] {
  if (isCadence8) {
    return [{ start: barStart, dur: 4 as DurEighths, midi: voices[0] }];
  }

  const activity = melodyActivity(melody, barIdx);
  const notes: KNote[] = [];

  if (isCadence4) {
    // 4小節目: 前半アルペジオ、後半伸ばし
    for (let s = 0; s < 4; s++) {
      notes.push({
        start: barStart + s,
        dur: 1 as DurEighths,
        midi: voices[s % voices.length],
      });
    }
    notes.push({ start: barStart + 4, dur: 4 as DurEighths, midi: voices[0] });
    return notes;
  }

  // メロディが密な小節は伴奏を疎に
  const step = activity >= 5 ? 2 : 1;
  for (let s = 0; s < STEPS_PER_BAR; s += step) {
    notes.push({
      start: barStart + s,
      dur: step as DurEighths,
      midi: voices[Math.floor(s / step) % voices.length],
    });
  }
  return notes;
}

/** はずみ: 1・3拍に和音をポン、ポン */
function genBlock(
  voices: number[],
  barStart: number,
  barIdx: number,
  melody: KNote[],
  isCadence4: boolean,
  isCadence8: boolean,
): KNote[] {
  if (isCadence8) {
    return [{ start: barStart, dur: 4 as DurEighths, midi: voices[0] }];
  }

  const activity = melodyActivity(melody, barIdx);
  const notes: KNote[] = [];

  // メロディが密なら1拍目のみ
  const beats = activity >= 5 ? [0] : [0, 4];

  if (isCadence4) {
    // 4小節目: 1拍目のみ + 伸ばし
    for (const midi of voices.slice(0, 2)) {
      notes.push({ start: barStart, dur: 4 as DurEighths, midi });
    }
    return notes;
  }

  for (const beat of beats) {
    for (const midi of voices.slice(0, 2)) {
      notes.push({ start: barStart + beat, dur: 2 as DurEighths, midi });
    }
  }
  return notes;
}

/** わふう: ルート＋5度のみ（3度抜き）を4分で */
function genOpen5th(
  voices: number[],
  barStart: number,
  barIdx: number,
  melody: KNote[],
  isCadence4: boolean,
  isCadence8: boolean,
): KNote[] {
  if (isCadence8) {
    return [{ start: barStart, dur: 4 as DurEighths, midi: voices[0] }];
  }

  const activity = melodyActivity(melody, barIdx);
  const notes: KNote[] = [];

  if (isCadence4) {
    notes.push({ start: barStart, dur: 4 as DurEighths, midi: voices[0] });
    return notes;
  }

  // メロディが密なら2分、そうでなければ4分刻み
  const step = activity >= 5 ? 4 : 2;
  for (let s = 0; s < STEPS_PER_BAR; s += step) {
    for (const midi of voices) {
      notes.push({ start: barStart + s, dur: step as DurEighths, midi });
    }
  }
  return notes;
}

/** 5小節目の1拍目: メロディが休符なら伴奏で拍を保つ */
function ensureBar5Downbeat(notes: KNote[], melody: KNote[], voices: number[]): KNote[] {
  const bar5Start = 4 * STEPS_PER_BAR;
  const melodyHasDownbeat = melody.some(n => n.start === bar5Start);
  if (melodyHasDownbeat) return notes;

  const hasAccompDownbeat = notes.some(n => n.start === bar5Start);
  if (hasAccompDownbeat) return notes;

  return [{ start: bar5Start, dur: 2 as DurEighths, midi: voices[0] }, ...notes];
}

export function generateAccompaniment(
  chords: ChordInfo[],
  melody: KNote[],
  textureLabel: TextureLabel | 'おまかせ',
  bpm: number,
): KNote[] {
  // テクスチャ自動選択
  let texture: Texture;
  if (textureLabel === 'おまかせ') {
    if (bpm <= 80) texture = 'sustained';
    else if (bpm >= 108) texture = 'block';
    else texture = 'arpeggio';
  } else {
    texture = TEXTURE_MAP[textureLabel];
  }

  const allNotes: KNote[] = [];

  for (let bar = 0; bar < 8; bar++) {
    const chord = chords[bar];
    const barStart = bar * STEPS_PER_BAR;
    const voices = voicing(chord, texture);
    const isCadence4 = bar === 3;
    const isCadence8 = bar === 7;

    let barNotes: KNote[];
    switch (texture) {
      case 'sustained':
        barNotes = genSustained(voices, barStart, bar, isCadence4, isCadence8);
        break;
      case 'arpeggio':
        barNotes = genArpeggio(voices, barStart, bar, melody, isCadence4, isCadence8);
        break;
      case 'block':
        barNotes = genBlock(voices, barStart, bar, melody, isCadence4, isCadence8);
        break;
      case 'open5th':
        barNotes = genOpen5th(voices, barStart, bar, melody, isCadence4, isCadence8);
        break;
    }

    allNotes.push(...barNotes);
  }

  // 5小節目の拍保持
  const bar5Voices = voicing(chords[4], texture);
  return ensureBar5Downbeat(allNotes, melody, bar5Voices);
}
