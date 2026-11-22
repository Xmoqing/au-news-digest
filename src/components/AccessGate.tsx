'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Globe2, Lock } from 'lucide-react';

const AUTH_STORAGE_KEY = 'au-news-auth-verified-at';

interface AccessGateProps {
  hasDeepLinkArticle?: boolean;
}

export function AccessGate({ hasDeepLinkArticle = false }: AccessGateProps) {
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
    <main className="flex min-h-[100dvh] flex-col items-center bg-[#F5F5F7] px-4 pt-12 pb-8 dark:bg-[#000000] sm:pt-20">
      {/* Positioned near top so mobile virtual keyboard never obscures the submit button */}
      <section className="w-full max-w-sm rounded-2xl border border-black/[0.08] bg-white p-6 text-[#1D1D1F] shadow-xl dark:border-white/[0.10] dark:bg-[#1C1C1E] dark:text-[#F5F5F7]">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#007AFF] text-white dark:bg-[#0A84FF]">
            <Globe2 className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-[#1D1D1F] dark:text-[#F5F5F7]">
              澳洲与国际热点速览
            </h1>
            <p className="text-xs text-[#86868B]">AU &amp; Global News Digest</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="access-password"
              className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-[#1D1D1F] dark:text-[#E5E5EA]"
            >
              <Lock className="h-3.5 w-3.5 text-[#007AFF] dark:text-[#0A84FF]" aria-hidden="true" />
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
                className="min-h-12 w-full rounded-xl border border-black/[0.10] bg-[#F5F5F7] pl-3.5 pr-12 text-base text-[#1D1D1F] placeholder:text-[#86868B] focus:border-[#007AFF] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#007AFF]/25 dark:border-white/[0.10] dark:bg-[#000000]/70 dark:text-[#F5F5F7] dark:placeholder:text-[#86868B] dark:focus:border-[#0A84FF] dark:focus:bg-[#000000]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? '隐藏口令' : '显示口令'}
                aria-pressed={showPassword}
                className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-[#86868B] transition-colors hover:bg-black/[0.06] hover:text-[#1D1D1F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF] dark:hover:bg-white/[0.10] dark:hover:text-[#F5F5F7]"
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
              className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300"
            >
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !password.trim()}
            className="min-h-12 w-full rounded-full bg-[#007AFF] px-4 py-2.5 text-base font-semibold text-white transition-colors hover:bg-[#0071E3] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1C1C1E] dark:bg-[#0A84FF] dark:hover:bg-[#409CFF]"
          >
            {submitting ? '正在验证...' : '验证并进入'}
          </button>

          <p className="text-center text-xs leading-relaxed text-[#86868B]">
            {hasDeepLinkArticle
              ? '验证通过后将直接为您打开分享的这篇文章，并在本设备自动记住 30 天。'
              : '验证通过后将在本设备自动记住 30 天，下次打开免输入。'}
          </p>
        </form>
      </section>
    </main>
  );
}
