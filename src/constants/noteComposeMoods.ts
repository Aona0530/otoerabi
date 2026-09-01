/**
 * noteComposeMoods — おとえらび作曲ゲーム Step ⑤ の雰囲気プリセット
 *
 * 選択式ゲームなので言葉からの推定は使わず、
 * 雰囲気 → mode / BPM / 伴奏テクスチャ を直接マップする。
 * 「せつない」のみ minor（イ短調）。ここでソ→ソ♯・終止が短調化される。
 */

import type { TextureLabel } from '@/kanade/AccompanimentGen';
import type { Mood } from '@/types';

export interface MoodPreset {
  id: 'tanoshii' | 'akarui' | 'ochitsuita' | 'setsunai';
  label: string;
  emoji: string;
  mode: 'major' | 'minor';
  bpm: number;
  texture: TextureLabel;
  /** SongData 保存用の Mood 型へのマッピング */
  mood: Mood;
  /** ボタンのテーマ色（HEX） */
  color: string;
}

export const MOOD_PRESETS: MoodPreset[] = [
  {
    id: 'tanoshii',
    label: 'たのしい',
    emoji: '🎉',
    mode: 'major',
    bpm: 112,
    texture: 'はずみ',
    mood: 'わくわく',
    color: '#F59E0B',
  },
  {
    id: 'akarui',
    label: 'あかるい',
    emoji: '🌸',
    mode: 'major',
    bpm: 96,
    texture: 'ながれ',
    mood: 'うれしい',
    color: '#EC6B9D',
  },
  {
    id: 'ochitsuita',
    label: 'おちついた',
    emoji: '🍵',
    mode: 'major',
    bpm: 76,
    texture: 'しずか',
    mood: 'のんびり',
    color: '#5FA88A',
  },
  {
    id: 'setsunai',
    label: 'せつない',
    emoji: '🌙',
    mode: 'minor',
    bpm: 84,
    texture: 'ながれ',
    mood: 'かなしい',
    color: '#7B68A8',
  },
];

export function getMoodPreset(id: MoodPreset['id']): MoodPreset {
  return MOOD_PRESETS.find((m) => m.id === id) ?? MOOD_PRESETS[0];
}
