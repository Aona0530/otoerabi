/**
 * おとえらび作曲ゲーム — 6ステップ・ウィザード
 *
 * ① さいしょの音（ド/ミ/ソ）      … シャボン玉から1つ
 * ② つかう音3つ                   … 残り11音のシャボン玉から3つ
 * ③ リズムえらび                  … MotifBuilder の3候補から1つ
 * ④ メロディづくり                … KanadeEngine で8小節に展開（伴奏なし・おまかせ）
 * ⑤ ふんいきえらび                … 4プリセットで mode/BPM/伴奏テクスチャ決定
 * ⑥ かんせい                      … 再生・EXP・ライブラリ保存
 */

import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ChevronLeft,
  Download,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  Square,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useNoteComposeStore } from '@/store/noteComposeStore';
import type { NoteComposeStep } from '@/store/noteComposeStore';
import { NoteBubble } from '@/components/note-compose/NoteBubble';
import { KanadeScore } from '@/kanade/KanadeScore';
import { DEG_LABELS, THEME_BARS, degToMidi } from '@/kanade/scale';
import { playTheme, previewNote, stopTheme } from '@/kanade/KanadePlayer';
import { downloadBlob, toSongData } from '@/kanade/exporters';
import { exportSongToMp3 } from '@/kanade/audioExport';
import { MOOD_PRESETS, getMoodPreset } from '@/constants/noteComposeMoods';

const BASE = 'bg-orange-50';
const PREVIEW_BPM = 96;

/** ①の音: ド(0) / ミ(2) / ソ(4) */
const FIRST_NOTE_DEGS = [0, 2, 4];
const ALL_DEGS = Array.from({ length: 12 }, (_, i) => i);

/** 音の高さ → 色相（低い=寒色 / 高い=暖色） */
function hueFor(deg: number): number {
  return Math.round(220 - (deg / 11) * 200);
}

/** 度数 → 表示ラベルと高オクターブ添え字 */
function labelFor(deg: number): { label: string; sub?: string } {
  return { label: DEG_LABELS[deg], sub: deg >= 7 ? 'たかい' : undefined };
}

const STEP_ORDER: NoteComposeStep[] = [
  'first-note',
  'pick-notes',
  'rhythm',
  'melody',
  'mood',
  'result',
];
const STEP_LABELS: Record<NoteComposeStep, string> = {
  'first-note': 'おと',
  'pick-notes': '3つ',
  rhythm: 'リズム',
  melody: 'メロディ',
  mood: 'ふんいき',
  result: 'かんせい',
};

// ── 進行インジケーター ──
function StepDots({ step }: { step: NoteComposeStep }) {
  const idx = STEP_ORDER.indexOf(step);
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5 py-2">
      {STEP_ORDER.map((s, i) => {
        const done = i < idx;
        const current = i === idx;
        return (
          <span
            key={s}
            className={[
              'px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors',
              current
                ? 'bg-orange-500 text-white'
                : done
                  ? 'bg-orange-200 text-orange-700'
                  : 'bg-orange-100 text-orange-300',
            ].join(' ')}
          >
            {STEP_LABELS[s]}
          </span>
        );
      })}
    </div>
  );
}

/** 大きな確定ボタン（シニア要件: 高さ72px以上・角丸強め） */
function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        'w-full min-h-[72px] rounded-[2rem] text-xl font-black shadow-lg transition-all',
        'flex items-center justify-center gap-2',
        disabled
          ? 'bg-orange-200 text-white/70 cursor-not-allowed'
          : 'bg-orange-500 text-white border-b-8 border-orange-700 active:translate-y-1 active:border-b-2 hover:brightness-105',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

export function NoteComposePage() {
  const { setScreen, addExp, addToLibrary, setCurrentSong, setEmotion, setMessage, setActionId } =
    useAppStore();
  const s = useNoteComposeStore();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [saving, setSaving] = useState(false);
  const awarded = useRef(false);

  async function saveMp3() {
    const p = s.moodId ? getMoodPreset(s.moodId) : null;
    if (!s.finalResult || !p || saving) return;
    setSaving(true);
    stopAll();
    try {
      const blob = await exportSongToMp3(s.finalResult.notes, s.finalResult.accompaniment, p.bpm);
      downloadBlob('おとえらび.mp3', blob);
    } catch (e) {
      console.error('MP3書き出しに失敗:', e);
    } finally {
      setSaving(false);
    }
  }

  // 入場時に新しいゲームとして初期化
  useEffect(() => {
    s.reset();
    awarded.current = false;
    return () => stopTheme();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 再生ヘルパー ──
  async function playNotes(
    id: string,
    notes: { start: number; dur: 1 | 2 | 4; midi: number }[],
    bpm: number,
    accomp?: { start: number; dur: 1 | 2 | 4; midi: number }[],
  ) {
    stopTheme();
    setPlayingId(id);
    setActiveIdx(-1);
    await playTheme(
      notes,
      bpm,
      'piano',
      (i) => setActiveIdx(i),
      () => {
        setPlayingId(null);
        setActiveIdx(-1);
      },
      accomp && accomp.length ? accomp : undefined,
    );
  }
  function stopAll() {
    stopTheme();
    setPlayingId(null);
    setActiveIdx(-1);
  }

  function tapBubble(deg: number, toggle: boolean) {
    previewNote(degToMidi(deg), 'piano');
    if (toggle) s.toggleDeg(deg);
  }

  // ── ナビゲーション ──
  function goBack() {
    stopAll();
    const idx = STEP_ORDER.indexOf(s.step);
    if (idx <= 0) {
      setScreen('title');
    } else {
      s.setStep(STEP_ORDER[idx - 1]);
    }
  }

  // ⑥到達で EXP付与・保存（1回だけ）
  useEffect(() => {
    if (s.step !== 'result' || !s.finalResult || !s.moodId || awarded.current) return;
    awarded.current = true;
    const preset = getMoodPreset(s.moodId);
    const song = toSongData(s.finalResult, {
      title: 'おとの きょく',
      mood: preset.mood,
      bpm: preset.bpm,
    });
    addExp(40);
    addToLibrary(song);
    setCurrentSong(song);
    setEmotion('happy');
    setActionId('poyon');
    setMessage('すてきな きょくが できたね！');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.step, s.finalResult, s.moodId]);

  const preset = s.moodId ? getMoodPreset(s.moodId) : null;

  return (
    <div className={`min-h-dvh ${BASE}`}>
      <style>{`
        @keyframes nc-bubble-float {
          0%, 100% { transform: translateY(0) translateX(0); }
          33%      { transform: translateY(-8px) translateX(3px); }
          66%      { transform: translateY(-4px) translateX(-3px); }
        }
        .note-bubble { animation: nc-bubble-float 4.2s ease-in-out infinite; }
      `}</style>

      <div className="max-w-xl mx-auto px-4 py-4 flex flex-col gap-3">
        {/* ヘッダー */}
        <header className="flex items-center gap-2">
          <button
            onClick={goBack}
            className="flex items-center gap-1 text-base font-bold text-orange-700 min-h-11 px-2"
          >
            <ChevronLeft size={22} />
            {s.step === 'first-note' ? 'もどる' : 'まえへ'}
          </button>
          <h1 className="flex-1 text-center text-xl font-black text-orange-800">🫧 おとえらび</h1>
          <div className="w-16 shrink-0" />
        </header>

        <StepDots step={s.step} />

        {/* ════════ ① さいしょの音 ════════ */}
        {s.step === 'first-note' && (
          <section className="flex flex-col gap-6 items-center">
            <p className="text-lg font-bold text-orange-800 text-center">
              どの おとから はじめる？
            </p>
            <div className="flex items-center justify-center gap-6 py-6">
              {FIRST_NOTE_DEGS.map((deg, i) => {
                const { label } = labelFor(deg);
                return (
                  <NoteBubble
                    key={deg}
                    label={label}
                    hue={hueFor(deg)}
                    selected={s.firstDeg === deg}
                    floatDelay={i * 0.5}
                    onTap={() => {
                      previewNote(degToMidi(deg), 'piano');
                      s.selectFirst(deg);
                    }}
                  />
                );
              })}
            </div>
            <PrimaryButton
              disabled={s.firstDeg === null}
              onClick={() => s.setStep('pick-notes')}
            >
              この おとにする！ <ArrowRight size={22} />
            </PrimaryButton>
          </section>
        )}

        {/* ════════ ② つかう音3つ ════════ */}
        {s.step === 'pick-notes' && (
          <section className="flex flex-col gap-5 items-center">
            <p className="text-lg font-bold text-orange-800 text-center">
              つかいたい おとを 3つ えらんでね
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 py-2">
              {ALL_DEGS.filter((d) => d !== s.firstDeg)
                .slice()
                .sort((a, b) => b - a) /* 高い音を上に */
                .map((deg, i) => {
                  const { label, sub } = labelFor(deg);
                  const selected = s.pickedDegs.includes(deg);
                  const full = s.pickedDegs.length >= 3 && !selected;
                  return (
                    <NoteBubble
                      key={deg}
                      label={label}
                      sub={sub}
                      hue={hueFor(deg)}
                      selected={selected}
                      disabled={full}
                      floatDelay={(i % 5) * 0.4}
                      onTap={() => tapBubble(deg, true)}
                    />
                  );
                })}
            </div>
            <p className="text-base font-bold text-orange-600">
              {s.pickedDegs.length < 3 ? `あと ${3 - s.pickedDegs.length}つ` : 'えらべたね！'}
            </p>
            <PrimaryButton
              disabled={s.pickedDegs.length !== 3}
              onClick={() => {
                s.buildCandidates();
                s.setStep('rhythm');
              }}
            >
              この 3つの おとにする！ <ArrowRight size={22} />
            </PrimaryButton>
          </section>
        )}

        {/* ════════ ③ リズムえらび ════════ */}
        {s.step === 'rhythm' && (
          <section className="flex flex-col gap-4">
            <p className="text-lg font-bold text-orange-800 text-center">
              すきな リズムを えらんでね
            </p>
            <div className="flex flex-col gap-3">
              {s.candidates.map((cand, idx) => {
                const active = s.selectedCandidateIdx === idx;
                const pid = `cand-${idx}`;
                return (
                  <div
                    key={cand.templateId}
                    className={[
                      'flex items-center gap-3 p-4 rounded-[1.75rem] border-4 transition-all bg-white',
                      active ? 'border-orange-500 shadow-md' : 'border-orange-100',
                    ].join(' ')}
                  >
                    <button
                      onClick={() =>
                        playingId === pid
                          ? stopAll()
                          : playNotes(pid, cand.notes, PREVIEW_BPM)
                      }
                      className="shrink-0 w-16 h-16 rounded-full bg-orange-400 text-white flex items-center justify-center shadow active:scale-95"
                      aria-label="きく"
                    >
                      {playingId === pid ? <Square size={26} /> : <Play size={26} />}
                    </button>
                    <button
                      onClick={() => s.selectCandidate(idx)}
                      className="flex-1 text-left"
                    >
                      <span className="text-2xl mr-2">{cand.emoji}</span>
                      <span className="text-xl font-black text-orange-800">{cand.label}</span>
                    </button>
                    <span
                      className={[
                        'shrink-0 w-8 h-8 rounded-full border-4 transition-colors',
                        active ? 'bg-orange-500 border-orange-500' : 'border-orange-200',
                      ].join(' ')}
                    />
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => {
                stopAll();
                s.regenerateCandidates();
              }}
              className="flex items-center justify-center gap-2 min-h-12 rounded-2xl border-2 border-orange-300 text-orange-700 font-bold"
            >
              <RefreshCw size={18} /> もういちど つくる
            </button>
            <PrimaryButton
              disabled={s.selectedCandidateIdx === null}
              onClick={() => {
                stopAll();
                s.generateMelody();
                s.setStep('melody');
              }}
            >
              この リズムにする！ <ArrowRight size={22} />
            </PrimaryButton>
          </section>
        )}

        {/* ════════ ④ メロディづくり ════════ */}
        {s.step === 'melody' && (
          <section className="flex flex-col gap-5 items-center">
            <p className="text-lg font-bold text-orange-800 text-center">
              メロディが できたよ！きいてみてね
            </p>
            <div className="w-full bg-white rounded-[2rem] p-5 flex flex-col items-center gap-4 shadow">
              {s.melodyResult && (
                <div className="w-full overflow-x-auto rounded-xl bg-[#FBFAF7] border border-orange-100 p-2">
                  <KanadeScore
                    notes={s.melodyResult.notes}
                    bars={THEME_BARS}
                    activeIndex={playingId === 'melody' ? activeIdx : -1}
                  />
                </div>
              )}
              <button
                onClick={() =>
                  playingId === 'melody'
                    ? stopAll()
                    : s.melodyResult &&
                      playNotes('melody', s.melodyResult.notes, PREVIEW_BPM)
                }
                className="flex items-center gap-3 px-10 min-h-[64px] rounded-[2rem] bg-orange-400 text-white text-xl font-black shadow active:scale-95"
              >
                {playingId === 'melody' ? <Square size={26} /> : <Play size={26} />}
                {playingId === 'melody' ? 'とめる' : 'きく'}
              </button>
            </div>
            <button
              onClick={() => {
                stopAll();
                s.regenerateMelody();
              }}
              className="flex items-center justify-center gap-2 min-h-12 rounded-2xl border-2 border-orange-300 text-orange-700 font-bold w-full"
            >
              <RefreshCw size={18} /> べつの メロディにする
            </button>
            <PrimaryButton
              disabled={!s.melodyResult}
              onClick={() => {
                stopAll();
                s.setStep('mood');
              }}
            >
              この メロディにする！ <ArrowRight size={22} />
            </PrimaryButton>
          </section>
        )}

        {/* ════════ ⑤ ふんいきえらび ════════ */}
        {s.step === 'mood' && (
          <section className="flex flex-col gap-5">
            <p className="text-lg font-bold text-orange-800 text-center">
              どんな かんじに する？
            </p>
            <div className="grid grid-cols-2 gap-3">
              {MOOD_PRESETS.map((m) => {
                const active = s.moodId === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      s.applyMood(m.id);
                      const fin = useNoteComposeStore.getState().finalResult;
                      if (fin) playNotes(`mood-${m.id}`, fin.notes, m.bpm, fin.accompaniment);
                    }}
                    className={[
                      'min-h-[96px] rounded-[1.75rem] border-4 flex flex-col items-center justify-center gap-1 transition-all bg-white',
                      active ? 'shadow-lg scale-[1.03]' : 'border-orange-100',
                    ].join(' ')}
                    style={active ? { borderColor: m.color } : undefined}
                  >
                    <span className="text-4xl">{m.emoji}</span>
                    <span
                      className="text-lg font-black"
                      style={{ color: active ? m.color : '#9a3412' }}
                    >
                      {m.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <PrimaryButton
              disabled={!s.moodId || !s.finalResult}
              onClick={() => {
                stopAll();
                s.setStep('result');
              }}
            >
              この ふんいきで かんせい！ <Sparkles size={22} />
            </PrimaryButton>
          </section>
        )}

        {/* ════════ ⑥ かんせい ════════ */}
        {s.step === 'result' && s.finalResult && preset && (
          <section className="flex flex-col gap-5 items-center">
            <p className="text-2xl font-black text-orange-800 text-center">できあがり！🎉</p>
            <div className="w-full bg-white rounded-[2rem] p-5 flex flex-col items-center gap-4 shadow">
              <p className="text-base font-bold text-orange-600">
                <span className="text-2xl mr-1">{preset.emoji}</span>
                {preset.label}
                {preset.mode === 'minor' ? '（イ短調）' : '（ハ長調）'} ／ ♩={preset.bpm}
              </p>
              <div className="w-full overflow-x-auto rounded-xl bg-[#FBFAF7] border border-orange-100 p-2">
                <KanadeScore
                  notes={s.finalResult.notes}
                  bars={THEME_BARS}
                  activeIndex={playingId === 'final' ? activeIdx : -1}
                  chordNames={s.finalResult.chords.map((c) => c.name)}
                />
              </div>
              <button
                onClick={() =>
                  playingId === 'final'
                    ? stopAll()
                    : playNotes('final', s.finalResult!.notes, preset.bpm, s.finalResult!.accompaniment)
                }
                className="flex items-center gap-3 px-10 min-h-[64px] rounded-[2rem] bg-orange-500 text-white text-xl font-black shadow active:scale-95"
              >
                {playingId === 'final' ? <Square size={26} /> : <Play size={26} />}
                {playingId === 'final' ? 'とめる' : 'きく'}
              </button>
            </div>

            <div className="flex flex-col items-center gap-2 w-full">
              <button
                onClick={saveMp3}
                disabled={saving}
                className={[
                  'flex items-center gap-2 px-6 min-h-[56px] rounded-2xl font-black text-white shadow-md transition-all',
                  saving ? 'bg-orange-300 cursor-wait' : 'bg-orange-500 active:scale-95 hover:brightness-105',
                ].join(' ')}
              >
                {saving ? (
                  <>
                    <Loader2 size={20} className="animate-spin" /> ほぞんちゅう…
                  </>
                ) : (
                  <>
                    <Download size={20} /> 音楽をほぞん！
                  </>
                )}
              </button>
              {saving && <p className="text-xs text-orange-500">MP3を つくっています（すこし まってね）</p>}
            </div>

            <div className="flex flex-col gap-3 w-full">
              <PrimaryButton
                onClick={() => {
                  stopAll();
                  awarded.current = false;
                  s.reset();
                }}
              >
                もういちど つくる！
              </PrimaryButton>
              <button
                onClick={() => {
                  stopAll();
                  setScreen('title');
                }}
                className="min-h-12 rounded-2xl text-orange-700 font-bold"
              >
                さいしょに もどる
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
