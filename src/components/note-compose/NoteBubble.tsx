/**
 * NoteBubble — シャボン玉のような音の選択ボタン（①②共用）
 *
 * ・タップで試聴＋ぷるん反応、選択でふわっと発色＋光るリング
 * ・浮遊アニメーション（bubble-float）は CSS Keyframes のみ（JSアニメ禁止の規約に準拠）
 *   → keyframes は NoteComposePage 側の <style> で一度だけ定義する
 */

interface NoteBubbleProps {
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
  onTap: () => void;
}

export function NoteBubble({
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
      onClick={onTap}
      disabled={disabled}
      aria-pressed={selected}
      className={[
        'relative rounded-full shrink-0 select-none',
        'w-[84px] h-[84px] flex flex-col items-center justify-center',
        // transform は float アニメーションが握るため、選択強調は色・枠・影で表現する
        'transition-[box-shadow,border-color,background] duration-300 ease-out',
        'note-bubble',
        selected ? 'note-bubble--on' : '',
        disabled ? 'opacity-35' : '',
      ].join(' ')}
      style={{
        animationDelay: `${floatDelay}s`,
        background: selected
          ? `radial-gradient(circle at 32% 28%, #ffffff 0%, ${base} 42%, ${deep} 100%)`
          : `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.9) 0%, ${base}bb 45%, ${deep}77 100%)`,
        border: selected ? '3px solid #ffffff' : '2px solid rgba(255,255,255,0.85)',
        boxShadow: selected
          ? `0 0 0 4px ${deep}66, 0 8px 20px ${deep}55`
          : '0 4px 12px rgba(0,0,0,0.12)',
      }}
    >
      {/* 光沢ハイライト */}
      <span
        className="absolute rounded-full pointer-events-none"
        style={{
          top: '14%',
          left: '20%',
          width: '30%',
          height: '22%',
          background: 'rgba(255,255,255,0.85)',
          filter: 'blur(2px)',
        }}
      />
      {sub && (
        <span className="text-[11px] font-bold leading-none text-white/90 drop-shadow-sm">
          {sub}
        </span>
      )}
      <span
        className="text-2xl font-black leading-none drop-shadow-sm"
        style={{ color: selected ? '#ffffff' : '#3a2e2e' }}
      >
        {label}
      </span>
      {selected && (
        <span className="absolute -top-1.5 -right-1.5 text-lg drop-shadow" aria-hidden>
          ✓
        </span>
      )}
    </button>
  );
}
