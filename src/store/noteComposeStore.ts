/**
 * おとえらび作曲ゲーム — フロー状態管理
 *
 * ①最初の音 → ②つかう音3つ → ③リズム → ④メロディ生成 → ⑤ふんいき → ⑥かんせい
 * 生成はすべて KanadeEngine（generateTheme / harmonize / generateAccompaniment）に委譲。
 */

import { create } from 'zustand';
import type { KNote } from '@/kanade/scale';
import type { GenerateResult } from '@/kanade/KanadeEngine';
import { generateTheme } from '@/kanade/KanadeEngine';
import { generateAccompaniment } from '@/kanade/AccompanimentGen';
import type { MotifCandidate } from '@/kanade/MotifBuilder';
import { buildMotifCandidates } from '@/kanade/MotifBuilder';
import type { MoodPreset } from '@/constants/noteComposeMoods';
import { getMoodPreset } from '@/constants/noteComposeMoods';

export type NoteComposeStep =
  | 'first-note'
  | 'pick-notes'
  | 'rhythm'
  | 'melody'
  | 'mood'
  | 'result';

/** 新しいシード */
const newSeed = () => (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) | 0;

interface NoteComposeState {
  step: NoteComposeStep;

  firstDeg: number | null; // ①
  pickedDegs: number[]; // ②（最大3）

  seed: number; // ③候補生成用
  candidates: MotifCandidate[];
  selectedCandidateIdx: number | null;
  motif: KNote[]; // 選択したモチーフ（③確定後）

  melodySeed: number; // ④以降の展開用
  melodyResult: GenerateResult | null; // ④（伴奏なし）

  moodId: MoodPreset['id'] | null; // ⑤
  finalResult: GenerateResult | null; // ⑤（伴奏つき）

  // ── actions ──
  setStep: (step: NoteComposeStep) => void;
  selectFirst: (deg: number) => void;
  toggleDeg: (deg: number) => void;
  buildCandidates: () => void;
  regenerateCandidates: () => void;
  selectCandidate: (idx: number) => void;
  generateMelody: () => void;
  regenerateMelody: () => void;
  applyMood: (id: MoodPreset['id']) => void;
  reset: () => void;
}

const initial = {
  step: 'first-note' as NoteComposeStep,
  firstDeg: null,
  pickedDegs: [] as number[],
  seed: newSeed(),
  candidates: [] as MotifCandidate[],
  selectedCandidateIdx: null,
  motif: [] as KNote[],
  melodySeed: newSeed(),
  melodyResult: null as GenerateResult | null,
  moodId: null as MoodPreset['id'] | null,
  finalResult: null as GenerateResult | null,
};

export const useNoteComposeStore = create<NoteComposeState>((set, get) => ({
  ...initial,

  setStep: (step) => set({ step }),

  selectFirst: (deg) =>
    set((s) => ({ firstDeg: deg, pickedDegs: s.pickedDegs.filter((d) => d !== deg) })),

  toggleDeg: (deg) =>
    set((s) => {
      if (s.pickedDegs.includes(deg)) {
        return { pickedDegs: s.pickedDegs.filter((d) => d !== deg) };
      }
      if (s.pickedDegs.length >= 3) return {}; // 3つまで
      return { pickedDegs: [...s.pickedDegs, deg] };
    }),

  buildCandidates: () => {
    const { firstDeg, pickedDegs, seed } = get();
    if (firstDeg === null || pickedDegs.length !== 3) return;
    set({
      candidates: buildMotifCandidates(firstDeg, pickedDegs, seed),
      selectedCandidateIdx: null,
    });
  },

  regenerateCandidates: () => {
    const { firstDeg, pickedDegs } = get();
    if (firstDeg === null || pickedDegs.length !== 3) return;
    const seed = newSeed();
    set({
      seed,
      candidates: buildMotifCandidates(firstDeg, pickedDegs, seed),
      selectedCandidateIdx: null,
    });
  },

  selectCandidate: (idx) => {
    const { candidates } = get();
    const cand = candidates[idx];
    if (!cand) return;
    set({ selectedCandidateIdx: idx, motif: cand.notes });
  },

  generateMelody: () => {
    const { motif, melodySeed } = get();
    if (motif.length === 0) return;
    const result = generateTheme(motif, {
      devPattern: 'auto',
      phraseTemplate: 'auto',
      mode: 'major', // ④は常に長調で確認（⑤で短調化され得る）
      seed: melodySeed, // texture 省略 → 伴奏なし・メロディのみ
    });
    set({ melodyResult: result });
  },

  regenerateMelody: () => {
    const { motif } = get();
    if (motif.length === 0) return;
    const melodySeed = newSeed();
    const result = generateTheme(motif, {
      devPattern: 'auto',
      phraseTemplate: 'auto',
      mode: 'major',
      seed: melodySeed,
    });
    set({ melodySeed, melodyResult: result });
  },

  applyMood: (id) => {
    const { motif, melodyResult, melodySeed } = get();
    if (!melodyResult) return;
    const preset = getMoodPreset(id);

    let finalResult: GenerateResult;
    if (preset.mode === 'major') {
      // メロディはそのまま保持し、伴奏だけ足す
      const accompaniment = generateAccompaniment(
        melodyResult.chords,
        melodyResult.notes,
        preset.texture,
        preset.bpm,
      );
      finalResult = { ...melodyResult, accompaniment };
    } else {
      // せつない: 同シードで短調再生成（形はほぼ保たれ、終止とソ♯が短調化）
      finalResult = generateTheme(motif, {
        devPattern: 'auto',
        phraseTemplate: 'auto',
        mode: 'minor',
        texture: preset.texture,
        bpm: preset.bpm,
        seed: melodySeed,
      });
    }
    set({ moodId: id, finalResult });
  },

  reset: () =>
    set({
      ...initial,
      seed: newSeed(),
      melodySeed: newSeed(),
      candidates: [],
      pickedDegs: [],
      motif: [],
    }),
}));
