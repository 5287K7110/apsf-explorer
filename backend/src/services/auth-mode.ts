/**
 * AUTH_MODE の厳密な解決（demo / basic）
 *
 * 不正値を黙って demo に降格させない — 「認証があるように見えて何も
 * 守っていない」状態を設定ミスで再導入させないため:
 * - 未設定・空:  demo（既定）
 * - 'demo':      demo
 * - 'basic':     basic
 * - それ以外:    invalid（本番では起動拒否、開発では明示エラー + demo 継続）
 */
export type AuthMode = 'demo' | 'basic';

export interface AuthModeResolution {
  mode: AuthMode;
  invalid: boolean;
  raw: string;
}

export function resolveAuthMode(): AuthModeResolution {
  const raw = (process.env.AUTH_MODE ?? '').trim();
  if (raw === '' || raw === 'demo') return { mode: 'demo', invalid: false, raw };
  if (raw === 'basic') return { mode: 'basic', invalid: false, raw };
  return { mode: 'demo', invalid: true, raw };
}

export function getAuthMode(): AuthMode {
  return resolveAuthMode().mode;
}
