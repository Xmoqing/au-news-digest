'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Globe2, Lock } from 'lucide-react';

const AUTH_STORAGE_KEY = 'au-news-auth-verified-at';

export function AccessGate() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!password.trim() || submitting) return;

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };

      if (!res.ok || !data.ok) {
        setErrorMessage(data.message || '访问口令不正确，请重试');
        setSubmitting(false);
        return;
      }

      try {
        window.localStorage.setItem(AUTH_STORAGE_KEY, String(Date.now()));
      } catch {
        // ignore storage errors
      }

      router.refresh();
    } catch {
      setErrorMessage('网络连接失败，请稍后重试');
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-[100dvh] flex-col items-center bg-canvas px-4 pt-12 pb-8 sm:pt-20">
      {/* Positioned near top so mobile virtual keyboard never obscures the submit button */}
      <section className="w-full max-w-sm rounded-2xl border border-slate-200/70 bg-white/95 p-6 text-slate-900 shadow-lg backdrop-blur-xl dark:border-white/10 dark:border-t-white/20 dark:bg-zinc-900/95 dark:text-zinc-100">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_4px_14px_rgba(16,185,129,0.35)] dark:from-emerald-400 dark:to-teal-500 dark:text-slate-950">
            <Globe2 className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-zinc-100">
              澳洲与国际热点速览
            </h1>
            <p className="text-xs text-slate-500 dark:text-zinc-400">AU &amp; Global News Digest</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="access-password"
              className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-800 dark:text-zinc-200"
            >
              <Lock className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300" aria-hidden="true" />
              <span>请输入访问口令</span>
            </label>
            <div className="relative">
              <input
                id="access-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                enterKeyHint="done"
                required
                autoFocus
                placeholder="输入家庭访问口令"
                className="min-h-12 w-full rounded-xl border border-slate-200 bg-slate-100/80 pl-3.5 pr-12 text-base text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/25 dark:border-white/10 dark:bg-zinc-950/80 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-emerald-400/60 dark:focus:bg-zinc-950"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? '隐藏口令' : '显示口令'}
                aria-pressed={showPassword}
                className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-200/70 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {errorMessage && (
            <p
              role="alert"
              className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300"
            >
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !password.trim()}
            className="min-h-12 w-full rounded-xl bg-accent px-4 py-2.5 text-base font-semibold text-white dark:text-slate-950 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            {submitting ? '正在验证...' : '验证并进入'}
          </button>

          <p className="text-center text-xs leading-relaxed text-ink-muted">
            验证通过后将在本设备自动记住 30 天，下次打开免输入。
          </p>
        </form>
      </section>
    </main>
  );
}
