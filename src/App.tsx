import { useEffect, useRef, useState } from 'react';
import { Headphones, Music, Play, Sparkles, Square } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { preloadPiano } from '@/services/PianoSynth';
import { enableSilentModePlayback, unlockAudioForSilentMode } from '@/services/silentMode';
import { getLevel } from '@/types';
import { NoteComposePage } from '@/pages/NoteComposePage';

function TitlePage() {
  const { setScreen, character, songLibrary } = useAppStore();
  const level = getLevel(character.exp);

  const fileRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const urlRef = useRef<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // タイトルを見ている間にピアノ音源を先読みしておく（ゲーム開始時の待ちをなくす）
  useEffect(() => {
    enableSilentModePlayback(); // 消音スイッチ対策は早めに適用しておく
    const id = setTimeout(() => void preloadPiano(), 300);
    return () => {
      clearTimeout(id);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // 同じファイルを続けて選べるように値をリセット
    e.target.value = '';
    if (!file) return;

    const isMp3 =
      file.type === 'audio/mpeg' || file.name.toLowerCase().endsWith('.mp3');
    if (!isMp3) {
      setError('MP3の おんがくファイルを えらんでね');
      return;
    }

    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const url = URL.createObjectURL(file);
    urlRef.current = url;
    setError(null);
    setFileName(file.name);

    // 読み込み後に自動再生
    const audio = audioRef.current;
    if (audio) {
      unlockAudioForSilentMode(); // 消音スイッチ中でも鳴るようにする
      audio.src = url;
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio || !urlRef.current) return;
    if (playing) {
      audio.pause();
      audio.currentTime = 0;
      setPlaying(false);
    } else {
      unlockAudioForSilentMode();
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  }

  return (
    <div className="min-h-dvh bg-orange-50 flex flex-col items-center justify-center gap-6 px-6 py-10">
      <div className="text-center flex flex-col items-center gap-3">
        <div className="text-7xl">🫧</div>
        <h1 className="text-4xl font-black text-orange-800 tracking-wide">おとえらび</h1>
        <p className="text-base font-bold text-orange-500">
          おとを えらんで きょくを つくろう！
        </p>
      </div>

      <div className="w-full max-w-xs flex flex-col gap-3">
        {/* つくる */}
        <button
          onClick={() => setScreen('note-compose')}
          className="w-full min-h-[76px] rounded-[2rem] bg-orange-500 text-white text-2xl font-black shadow-lg border-b-8 border-orange-700 active:translate-y-1 active:border-b-2 hover:brightness-105 transition-all flex items-center justify-center gap-3"
        >
          <Sparkles size={26} />
          はじめる
        </button>

        {/* きく（保存したMP3を選ぶ） */}
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full min-h-[68px] rounded-[2rem] bg-white text-orange-700 text-xl font-black border-4 border-orange-300 active:scale-95 hover:bg-orange-100 transition-all flex items-center justify-center gap-3"
        >
          <Headphones size={24} />
          つくった音楽を きく
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/mpeg,.mp3"
          onChange={handlePick}
          className="hidden"
        />
      </div>

      {/* かくれた音声プレイヤー */}
      <audio ref={audioRef} onEnded={() => setPlaying(false)} className="hidden" />

      {error && (
        <p className="text-sm font-bold text-red-500 bg-red-50 px-4 py-2 rounded-2xl">{error}</p>
      )}

      {/* えらんだ曲のプレイヤー */}
      {fileName && (
        <div className="w-full max-w-xs bg-white rounded-[1.75rem] border-4 border-orange-100 p-4 flex flex-col items-center gap-3 shadow">
          <p className="flex items-center gap-2 text-sm font-bold text-orange-700 text-center break-all">
            <Music size={18} className="shrink-0" />
            {fileName}
          </p>
          <button
            onClick={togglePlay}
            className="w-full min-h-[56px] rounded-2xl bg-orange-400 text-white text-lg font-black shadow active:scale-95 flex items-center justify-center gap-2"
          >
            {playing ? <Square size={22} /> : <Play size={22} />}
            {playing ? 'とめる' : 'きく'}
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="text-sm font-bold text-orange-500 min-h-11"
          >
            べつの曲を えらぶ
          </button>
        </div>
      )}

      <div className="flex items-center gap-4 text-sm font-bold text-orange-400">
        <span>Lv. {level}</span>
        <span>つくったきょく: {songLibrary.length}</span>
      </div>
    </div>
  );
}

export default function App() {
  const screen = useAppStore((st) => st.screen);
  return screen === 'note-compose' ? <NoteComposePage /> : <TitlePage />;
}
