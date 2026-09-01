/**
 * rhythmTemplates — おとえらび作曲ゲームのリズムテンプレート
 *
 * 各テンプレートは2小節（16ステップ = 8分音符16個ぶん）のリズム骨格。
 * durs の合計は必ず 16。小節線（8ステップ目）をまたぐ音価は作らない
 * （各小節ぶんの音価が 8 ちょうどになるよう並べる）。
 *
 * すべてのテンプレートは各小節の1拍目・3拍目（ステップ 0/4/8/12）を頭に持つ音を含む。
 * → MotifBuilder が①②で選んだ「必ず使う音」を強拍スロットに置ける。
 */

import type { DurEighths } from './scale';

export interface RhythmTemplate {
  id: string;
  /** シニア向けのやさしいラベル */
  label: string;
  emoji: string;
  /** 8分ステップ単位の音価列。合計16。 */
  durs: DurEighths[];
}

export const RHYTHM_TEMPLATES: RhythmTemplate[] = [
  {
    id: 'slow',
    label: 'ゆったり',
    emoji: '🌊',
    // [四分 四分 二分] × 2 = 6音
    durs: [2, 2, 4, 2, 2, 4],
  },
  {
    id: 'march',
    label: 'たったっ',
    emoji: '🚶',
    // [四分 四分 四分 四分] × 2 = 8音
    durs: [2, 2, 2, 2, 2, 2, 2, 2],
  },
  {
    id: 'bounce',
    label: 'はずむ',
    emoji: '⛹️',
    // [八分 八分 四分 八分 八分 四分] × 2 = 12音
    durs: [1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 2],
  },
  {
    id: 'mix',
    label: 'おはなし',
    emoji: '💬',
    // [四分 八分 八分 四分 四分] × 2 = 10音
    durs: [2, 1, 1, 2, 2, 2, 1, 1, 2, 2],
  },
];

/** id からテンプレートを引く */
export function getRhythmTemplate(id: string): RhythmTemplate {
  return RHYTHM_TEMPLATES.find((t) => t.id === id) ?? RHYTHM_TEMPLATES[0];
}
