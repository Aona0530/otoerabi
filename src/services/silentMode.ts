/**
 * silentMode — iPhone の消音スイッチ（マナーモード）でも音を鳴らす
 *
 * iOS Safari は既定でオーディオを「ambient」扱いにするため、
 * 本体の消音スイッチが入っていると Web Audio も HTML audio も無音になる。
 * これを「playback（音楽再生）」扱いに切り替えると、消音中でも鳴るようになる。
 *
 * 1. Audio Session API（iOS 16.4+ / Safari）… navigator.audioSession.type = 'playback'
 *    → 公式の方法。現在の iPhone はほぼこれで解決する。
 * 2. それ以前の iOS 向けフォールバック … 無音ループを再生してセッション種別を変えさせる。
 *
 * Android は通常マナーモードでもメディア音は鳴るため、主に iOS 対策。
 */

interface AudioSessionLike {
  type: string;
}

/** 1度だけ適用すればよい処理の実行済みフラグ */
let sessionApplied = false;
let fallbackPrimed = false;
let silentEl: HTMLAudioElement | null = null;

/** ごく短い無音WAV（44バイトのヘッダ＋無音データ） */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPadOS はデスクトップSafariを詐称するので maxTouchPoints で判定を補う
  return /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * オーディオの種別を「playback」にする。
 * 副作用がないので、アプリ起動時など早い段階で呼んでよい。
 */
export function enableSilentModePlayback(): void {
  if (sessionApplied) return;
  sessionApplied = true;

  const nav = navigator as Navigator & { audioSession?: AudioSessionLike };
  if (nav.audioSession) {
    try {
      // 'playback' = 音楽アプリと同じ扱い。消音スイッチの影響を受けなくなる
      nav.audioSession.type = 'playback';
    } catch {
      // 未対応の値を弾く実装向け。フォールバックに任せる
      sessionApplied = false;
    }
  }
}

/**
 * Audio Session API が無い古い iOS 向けのフォールバック。
 * 無音ループを鳴らしておくとセッションが「再生中」となり、消音でも音が出るようになる。
 *
 * 必ずユーザー操作（タップ）の中から呼ぶこと。
 */
export function primeSilentModeFallback(): void {
  if (fallbackPrimed) return;

  const nav = navigator as Navigator & { audioSession?: AudioSessionLike };
  // 公式APIが使えるならフォールバックは不要（無駄な再生を避ける）
  if (nav.audioSession || !isIOS()) return;

  fallbackPrimed = true;
  try {
    silentEl = document.createElement('audio');
    silentEl.src = SILENT_WAV;
    silentEl.loop = true;
    silentEl.volume = 0;
    silentEl.setAttribute('playsinline', '');
    silentEl.setAttribute('aria-hidden', 'true');
    silentEl.style.display = 'none';
    // iOS では DOM に接続されている方が確実に再生できる
    document.body.appendChild(silentEl);
    void silentEl.play().catch(() => {
      // 再生できなくても本体の音には影響しないので無視する
    });
  } catch {
    /* 失敗しても通常再生は継続できる */
  }
}

/** 音を鳴らす直前に呼ぶ入口（両方まとめて適用） */
export function unlockAudioForSilentMode(): void {
  enableSilentModePlayback();
  primeSilentModeFallback();
}
