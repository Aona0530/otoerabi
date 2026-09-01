import { Sparkles } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { getLevel } from '@/types';
import { NoteComposePage } from '@/pages/NoteComposePage';

function TitlePage() {
  const { setScreen, character, songLibrary } = useAppStore();
  const level = getLevel(character.exp);

  return (
    <div className="min-h-dvh bg-orange-50 flex flex-col items-center justify-center gap-8 px-6">
      <div className="text-center flex flex-col items-center gap-3">
        <div className="text-7xl">🫧</div>
        <h1 className="text-4xl font-black text-orange-800 tracking-wide">おとえらび</h1>
        <p className="text-base font-bold text-orange-500">
          おとを えらんで きょくを つくろう！
        </p>
      </div>

      <button
        onClick={() => setScreen('note-compose')}
        className="w-full max-w-xs min-h-[76px] rounded-[2rem] bg-orange-500 text-white text-2xl font-black shadow-lg border-b-8 border-orange-700 active:translate-y-1 active:border-b-2 hover:brightness-105 transition-all flex items-center justify-center gap-3"
      >
        <Sparkles size={26} />
        はじめる
      </button>

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
