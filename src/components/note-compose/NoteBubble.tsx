/**
 * NoteBubble — シャボン玉のような音の選択ボタン（①②共用）
 *
 * ・タップで試聴＋選択でふわっと発色＋光るリング
 * ・浮遊アニメーションは CSS Keyframes のみ（NoteComposePage 側の <style> で定義）
 *
 * 【スマホ性能上の配慮】
 *  - 光沢に filter:blur を使わない（11個が常時アニメーションするため描画が重くなる）
 *  - React.memo + 安定した onTap(deg) で、1つ選んでも他の玉を再描画しない
 */

import { memo } from 'react';

interface NoteBubbleProps {
  /** 度数（onTap にそのまま渡す。ハンドラを安定させて再描画を防ぐため） */
  deg: number;
  /** 中央の階名ラベル（「ど」など） */
  label: string;
  /** 高いオクターブの添え字（「たかい」など。無ければ省略） */
  sub?: string;
  /** HSL の色相（音の高さで変える。低い=寒色 / 高い=暖色） */
  hue: number;
  selected: boolean;
  disabled?: boolean;
  /** 玉ごとに揺れをずらす秒数 */
  floatDelay: number;
  onTap: (deg: number) => void;
}

function NoteBubbleBase({
  deg,
  label,
  sub,
  hue,
  selected,
  disabled = false,
  floatDelay,
  onTap,
}: NoteBubbleProps) {
  const base = `hsl(${hue}, 70%, 72%)`;
  const deep = `hsl(${hue}, 75%, 58%)`;

  return (
    <button
      type="button"
      onClick={() => onTap(deg)}
      disabled={disabled}
      aria-pressed={selected}
      className={[
        'relative rounded-full shrink-0 select-none touch-manipulation',
        'w-[84px] h-[84px] flex flex-col items-center justify-center',
        // transform は float アニメーションが握るため、選択強調は色・枠・影で表現する
        'transition-[box-shadow,border-color,background] duration-200 ease-out',
        'note-bubble',
        disabled ? 'opacity-35' : '',
      ].join(' ')}
      style={{
        animationDelay: `${floatDelay}s`,
        background: selected
          ? `radial-gradient(circle at 32% 28%, #ffffff 0%, ${base} 42%, ${deep} 100%)`
          : `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.9) 0%, ${base}bb 45%, ${deep}77 100%)`,
        border: selected ? '3px solid #ffffff' : '2px solid rgba(255,255,255,0.85)',
        boxShadow: selected
          ? `0 0 0 4px ${deep}66, 0 6px 14px ${deep}55`
          : '0 3px 8px rgba(0,0,0,0.12)',
      }}
    >
      {/* 光沢ハイライト（blurを使わず半透明のまま重ねる＝描画が軽い） */}
      <span
        className="absolute rounded-full pointer-events-none"
        style={{
          top: '15%',
          left: '21%',
          width: '28%',
          height: '20%',
          background: 'rgba(255,255,255,0.7)',
        }}
      />
      {sub && (
        <span className="text-[11px] font-bold leading-none text-white/90">{sub}</span>
      )}
      <span
        className="text-2xl font-black leading-none"
        style={{ color: selected ? '#ffffff' : '#3a2e2e' }}
      >
        {label}
      </span>
      {selected && (
        <span className="absolute -top-1.5 -right-1.5 text-lg" aria-hidden>
          ✓
        </span>
      )}
    </button>
  );
}

export const NoteBubble = memo(NoteBubbleBase);
