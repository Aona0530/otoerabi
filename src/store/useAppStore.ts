import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ActionId, Character, Emotion, Screen, SongData } from '@/types';

interface AppState {
  screen: Screen;
  character: Character;
  currentSong: SongData | null;
  songLibrary: SongData[];

  setScreen: (screen: Screen) => void;
  setEmotion: (emotion: Emotion) => void;
  setActionId: (id: ActionId) => void;
  setMessage: (message: string) => void;
  addExp: (amount: number) => void;
  setCurrentSong: (song: SongData | null) => void;
  addToLibrary: (song: SongData) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      screen: 'title',
      character: {
        actionId: 'fuwafuwa',
        emotion: 'normal',
        exp: 0,
        message: 'こんにちは！',
      },
      currentSong: null,
      songLibrary: [],

      setScreen: (screen) => set({ screen }),
      setEmotion: (emotion) => set((s) => ({ character: { ...s.character, emotion } })),
      setActionId: (id) => set((s) => ({ character: { ...s.character, actionId: id } })),
      setMessage: (message) => set((s) => ({ character: { ...s.character, message } })),
      addExp: (amount) =>
        set((s) => ({ character: { ...s.character, exp: s.character.exp + amount } })),
      setCurrentSong: (song) => set({ currentSong: song }),
      addToLibrary: (song) =>
        set((s) => ({ songLibrary: [...s.songLibrary, song].slice(-50) })),
    }),
    {
      name: 'otoerabi-store',
      storage: createJSONStorage(() => localStorage),
      // screen・emotion・message・currentSong は揮発性なので保存しない
      partialize: (s) => ({
        character: { exp: s.character.exp },
        songLibrary: s.songLibrary,
      }),
      // character を丸ごと置き換えず exp だけ引き継ぐ（浅いマージ対策）
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        return {
          ...current,
          songLibrary: p.songLibrary ?? current.songLibrary,
          character: { ...current.character, exp: p.character?.exp ?? current.character.exp },
        };
      },
    },
  ),
);
