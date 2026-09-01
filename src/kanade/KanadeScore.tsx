/**
 * KanadeScore — 生成された8小節テーマを五線譜（SVG）として描画する。
 *
 * 外部ライブラリを使わず、ト音記号・音符・休符・小節線を直接描く。
 * ハ長調・4/4・C4〜G5 のダイアトニック音のみを前提とした簡易レンダラー。
 */

import type { KNote } from './scale';
import { STEPS_PER_BAR } from './scale';

interface Props {
  notes: KNote[];
  bars: number;
  /** 再生中の音のインデックス（notes 配列内）。-1 で非表示 */
  activeIndex?: number;
  /** 各小節のコードネーム（8要素） */
  chordNames?: string[];
}

const INK = '#2B2B2B';
const ACCENT = '#A63636';

const LINE_GAP = 10;
const HALF = LINE_GAP / 2;
const CLEF_W = 64;
const MEASURE_W = 160;
const ROW_H = 130;
const TOP = 42;
const SLOT_W = 17;

/** 音名の文字インデックス（C=0 … B=6）。派生音は幹音と同位置 */
const LETTER_OF_PC: Record<number, number> = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 8: 4, 9: 5, 11: 6 };

/** ♯ が必要なピッチクラス */
const SHARP_PCS = new Set([8]); // G# のみ

/** 五線上の位置: E4（第1線）= 0、1つ上の音名ごとに +1 */
function staffPos(midi: number): number {
  const letter = LETTER_OF_PC[midi % 12] ?? 0;
  const octave = Math.floor(midi / 12) - 1;
  return letter + octave * 7 - 30; // E4 = 2 + 4*7 = 30
}

/** 休符をベクター形状で描く（Unicode音楽記号はフォント非対応環境があるため） */
function Rest({ len, x, midY }: { len: number; x: number; midY: number }) {
  if (len === 4) {
    // 二分休符: 中線の上に乗る箱
    return <rect x={x - 6} y={midY - 4.5} width={12} height={4.5} fill={INK} />;
  }
  if (len === 2) {
    // 四分休符: ジグザグ
    return (
      <path
        d={`M ${x - 2} ${midY - 13} l 5 6 c -4 3 -4 6 0 10 c -6 -1 -7 3 -4 8`}
        stroke={INK}
        strokeWidth={2.4}
        strokeLinecap="round"
        fill="none"
      />
    );
  }
  // 八分休符: 玉とフック付きの斜め棒
  return (
    <g>
      <circle cx={x - 2.5} cy={midY - 5} r={2.6} fill={INK} />
      <path
        d={`M ${x - 2.5} ${midY - 4} q 4 3 7 0 l -4.5 14`}
        stroke={INK}
        strokeWidth={1.6}
        strokeLinecap="round"
        fill="none"
      />
    </g>
  );
}

export function KanadeScore({ notes, bars, activeIndex = -1, chordNames }: Props) {
  const barsPerRow = Math.min(4, bars);
  const rows = Math.ceil(bars / barsPerRow);
  const width = CLEF_W + barsPerRow * MEASURE_W + 16;
  const height = TOP + rows * ROW_H - 24;

  const els: React.ReactNode[] = [];

  // ── 五線・記号・小節線 ──
  for (let row = 0; row < rows; row++) {
    const sTop = TOP + row * ROW_H;
    const sBottom = sTop + LINE_GAP * 4;
    const rowRight = CLEF_W + barsPerRow * MEASURE_W;

    for (let l = 0; l < 5; l++) {
      const y = sTop + l * LINE_GAP;
      els.push(<line key={`l${row}-${l}`} x1={8} y1={y} x2={rowRight} y2={y} stroke={INK} strokeWidth={1} />);
    }
    // ト音記号（G線=第2線の中心に記号の巻き部分が来るよう配置）
    els.push(
      <text key={`clef${row}`} x={12} y={sTop + LINE_GAP * 3 + 8} fontSize={62} fill={INK} style={{ fontFamily: 'serif' }}>
        𝄞
      </text>,
    );
    if (row === 0) {
      els.push(
        <text key="ts1" x={46} y={sTop + LINE_GAP * 2 - 1} fontSize={21} fontWeight="bold" fill={INK}>4</text>,
        <text key="ts2" x={46} y={sBottom - 1} fontSize={21} fontWeight="bold" fill={INK}>4</text>,
      );
    }
    // 小節線
    for (let c = 0; c <= barsPerRow; c++) {
      const x = CLEF_W + c * MEASURE_W;
      const isLast = row === rows - 1 && c === barsPerRow;
      if (isLast) {
        els.push(
          <line key={`bl${row}-${c}a`} x1={x - 4} y1={sTop} x2={x - 4} y2={sBottom} stroke={INK} strokeWidth={1} />,
          <line key={`bl${row}-${c}b`} x1={x} y1={sTop} x2={x} y2={sBottom} stroke={INK} strokeWidth={3} />,
        );
      } else {
        els.push(<line key={`bl${row}-${c}`} x1={x} y1={sTop} x2={x} y2={sBottom} stroke={INK} strokeWidth={1} />);
      }
    }
    // 小節番号 + コードネーム
    for (let c = 0; c < barsPerRow; c++) {
      const barNo = row * barsPerRow + c + 1;
      if (barNo > bars) break;
      els.push(
        <text key={`bn${row}-${c}`} x={CLEF_W + c * MEASURE_W + 4} y={sTop - 8} fontSize={10} fill="#9A938A">
          {barNo}
        </text>,
      );
      if (chordNames && chordNames[barNo - 1]) {
        els.push(
          <text
            key={`ch${row}-${c}`}
            x={CLEF_W + c * MEASURE_W + MEASURE_W / 2}
            y={sTop - 8}
            fontSize={13}
            fontWeight="bold"
            fill="#A63636"
            textAnchor="middle"
            style={{ fontFamily: "'Shippori Mincho', serif" }}
          >
            {chordNames[barNo - 1]}
          </text>,
        );
      }
    }
  }

  const slotX = (start: number) => {
    const bar = Math.floor(start / STEPS_PER_BAR);
    const row = Math.floor(bar / barsPerRow);
    const col = bar % barsPerRow;
    const slot = start % STEPS_PER_BAR;
    return { x: CLEF_W + col * MEASURE_W + 18 + slot * SLOT_W, row };
  };

  // ── 休符（音のない8分スロットを拍に揃えてまとめる） ──
  const restEls: React.ReactNode[] = [];
  for (let bar = 0; bar < bars; bar++) {
    const barStart = bar * STEPS_PER_BAR;
    const occupied = new Array<boolean>(STEPS_PER_BAR).fill(false);
    for (const n of notes) {
      for (let s = n.start; s < n.start + n.dur; s++) {
        if (s >= barStart && s < barStart + STEPS_PER_BAR) occupied[s - barStart] = true;
      }
    }
    let pos = 0;
    while (pos < STEPS_PER_BAR) {
      if (occupied[pos]) {
        pos++;
        continue;
      }
      let gap = 0;
      while (pos + gap < STEPS_PER_BAR && !occupied[pos + gap]) gap++;
      let p = pos;
      while (p < pos + gap) {
        let len = 1;
        if (p % 4 === 0 && pos + gap - p >= 4) len = 4;
        else if (p % 2 === 0 && pos + gap - p >= 2) len = 2;
        const { x, row } = slotX(barStart + p);
        const midY = TOP + row * ROW_H + LINE_GAP * 2;
        restEls.push(<Rest key={`r${barStart + p}`} len={len} x={x} midY={midY} />);
        p += len;
      }
      pos += gap;
    }
  }
  els.push(...restEls);

  // ── 音符 ──
  notes.forEach((n, i) => {
    const { x, row } = slotX(n.start);
    const sTop = TOP + row * ROW_H;
    const pos = staffPos(n.midi);
    const cy = sTop + LINE_GAP * 4 - pos * HALF;
    const color = i === activeIndex ? ACCENT : INK;
    const isHalf = n.dur === 4;
    const stemUp = pos < 4;

    // 加線（C4 のみ対象）
    if (pos <= -2) {
      els.push(
        <line key={`lg${i}`} x1={x - 9} y1={cy} x2={x + 9} y2={cy} stroke={color} strokeWidth={1.2} />,
      );
    }

    // ♯ 臨時記号
    if (SHARP_PCS.has(n.midi % 12)) {
      const sx = x - 11;
      els.push(
        <g key={`sh${i}`}>
          <line x1={sx - 3} y1={cy - 6} x2={sx - 3} y2={cy + 6} stroke={color} strokeWidth={1.2} />
          <line x1={sx + 1} y1={cy - 7} x2={sx + 1} y2={cy + 5} stroke={color} strokeWidth={1.2} />
          <line x1={sx - 5.5} y1={cy - 2} x2={sx + 3.5} y2={cy - 3.5} stroke={color} strokeWidth={2} />
          <line x1={sx - 5.5} y1={cy + 3} x2={sx + 3.5} y2={cy + 1.5} stroke={color} strokeWidth={2} />
        </g>,
      );
    }

    // 符頭
    els.push(
      <ellipse
        key={`h${i}`}
        cx={x}
        cy={cy}
        rx={5.8}
        ry={4.3}
        transform={`rotate(-18 ${x} ${cy})`}
        fill={isHalf ? 'none' : color}
        stroke={color}
        strokeWidth={isHalf ? 1.8 : 1}
      />,
    );

    // 符幹
    const stemX = stemUp ? x + 5.2 : x - 5.2;
    const stemY1 = stemUp ? cy - 2 : cy + 2;
    const stemY2 = stemUp ? cy - 32 : cy + 32;
    els.push(<line key={`s${i}`} x1={stemX} y1={stemY1} x2={stemX} y2={stemY2} stroke={color} strokeWidth={1.4} />);

    // 8分音符の旗
    if (n.dur === 1) {
      const d = stemUp
        ? `M ${stemX} ${stemY2} c 6 4, 9 8, 7 18 c 2 -8, -1 -12, -7 -15 z`
        : `M ${stemX} ${stemY2} c 6 -4, 9 -8, 7 -18 c 2 8, -1 12, -7 15 z`;
      els.push(<path key={`f${i}`} d={d} fill={color} />);
    }
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      role="img"
      aria-label="生成された楽譜"
      style={{ maxWidth: width }}
    >
      {els}
    </svg>
  );
}
