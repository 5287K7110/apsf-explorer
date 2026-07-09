import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { authAPI } from '../services/authAPI';

export function LoginPage() {
  const { login, register, loading, error, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  // 認証モード: null（未取得）→ demo | basic。
  // 判明するまで Sign-up トグルも Demo ヒントも出さない（basic デプロイでの一瞬露出を防止）。
  // apiClient 経由で VITE_API_URL を尊重する（分離デプロイ対応）。
  const [authMode, setAuthMode] = useState<'demo' | 'basic' | null>(null);

  useEffect(() => {
    authAPI.getMode()
      .then((mode) => setAuthMode(mode))
      .catch(() => {
        // backend 未起動等: unknown のまま — demo 表示にフォールバックしない
      });
  }, []);

  // basic ではユーザー管理は管理者の USERS_FILE 運用 — Sign-up UI は出さない。
  // mode 応答がトグル操作より後に届いた場合もサインインに戻す
  useEffect(() => {
    if (authMode === 'basic') setIsSignUp(false);
  }, [authMode]);

  useEffect(() => {
    if (isAuthenticated) {
      // Navigation will be handled by ProtectedRoute wrapper
      window.location.href = '/';
    }
  }, [isAuthenticated]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    // Validation
    if (!email || !password) {
      setLocalError('Email and password are required');
      return;
    }

    if (isSignUp) {
      if (!name) {
        setLocalError('Name is required for sign up');
        return;
      }
      const success = await register(email, password, name);
      if (!success) {
        setLocalError(error || 'Registration failed');
      }
    } else {
      const success = await login({ email, password });
      if (!success) {
        setLocalError(error || 'Login failed');
      }
    }
  };

  const displayError = localError || error;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="w-full max-w-md p-8 bg-slate-900 rounded-xl border border-slate-800 shadow-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 mx-auto mb-4">
            <span className="text-lg font-bold text-white">A</span>
          </div>
          <h1 className="text-2xl font-bold text-white">
            {isSignUp ? 'Create Account' : 'Sign In'}
          </h1>
          <p className="text-sm text-slate-400 mt-2">APSF Explorer</p>
        </div>

        {/* Error Message */}
        {displayError && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-100 text-sm">
            {displayError}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none transition"
                placeholder="John Doe"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none transition"
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none transition"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition duration-200"
          >
            {loading ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                {isSignUp ? 'Creating account...' : 'Signing in...'}
              </div>
            ) : isSignUp ? (
              'Sign Up'
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        {/* Toggle Sign Up / Sign In — demo 確定時のみ表示（null/basic では出さない） */}
        {authMode === 'demo' && (
          <div className="mt-6 text-center" data-testid="auth-signup-toggle">
            <p className="text-sm text-slate-400">
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setLocalError(null);
                  setEmail('');
                  setPassword('');
                  setName('');
                }}
                className="ml-2 text-blue-400 hover:text-blue-300 font-medium transition"
              >
                {isSignUp ? 'Sign in' : 'Sign up'}
              </button>
            </p>
          </div>
        )}

        {/* Demo Hint — AUTH_MODE=demo のときだけ表示（/api/auth/mode 連動） */}
        {authMode === 'demo' && (
          <div className="mt-6 p-3 bg-slate-800/50 border border-slate-700 rounded-lg text-xs text-slate-400" data-testid="auth-demo-hint">
            <p className="font-medium text-slate-300 mb-1">Demo Mode</p>
            <p>Use any email and password to test. Authentication is mocked.</p>
          </div>
        )}
        {authMode === 'basic' && (
          <div className="mt-6 p-3 bg-slate-800/50 border border-slate-700 rounded-lg text-xs text-slate-400" data-testid="auth-basic-hint">
            <p>Sign in with credentials provided by your administrator.</p>
          </div>
        )}
      </div>
    </div>
  );
}
