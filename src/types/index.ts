// ===== 音楽データ型 =====

export type Mood = 'うれしい' | 'かなしい' | 'わくわく' | 'のんびり';

export interface SongData {
  song_id: string;
  creator_user_id: string;
  title: string;
  mood: Mood;
  style: string;
  bpm: number;
  tracks: Track[];
  created_at: string;
  gifted_to: string[];
}

export interface Track {
  instrument:
    | 'synth'
    | 'melody'
    | 'chords'
    | 'bass'
    | 'drums';
  notes: NoteEvent[];
}

export interface NoteEvent {
  bar: number;
  beat: number;
  note: string | string[];
  duration: string; // "4n" | "8n" | "2n" etc.
  velocity?: number;
}

// ===== キャラクター型（単体アプリ用の最小構成） =====

export type ActionId = 'poyon' | 'purupuru' | 'fuwafuwa';
export type Emotion = 'normal' | 'happy' | 'surprise';
export type Screen = 'title' | 'note-compose';

export interface Character {
  actionId: ActionId;
  emotion: Emotion;
  exp: number;
  message: string;
}

export const getLevel = (exp: number) => Math.floor(exp / 50) + 1;
