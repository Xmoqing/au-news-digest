'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  ChevronDown,
  RefreshCw,
  X,
} from 'lucide-react';
import { formatSydneyClock } from '@/lib/format';
import type { FxRateInfo } from '@/types/news';

interface FxConverterBadgeProps {
  fxRate: FxRateInfo;
  refreshing: boolean;
  onRefresh: () => void;
}

const PRESETS: Array<{ label: string; currency: 'AUD' | 'CNY'; amount: string }> = [
  { label: 'A$10', currency: 'AUD', amount: '10' },
  { label: 'A$100', currency: 'AUD', amount: '100' },
  { label: 'A$1,000', currency: 'AUD', amount: '1000' },
  { label: '¥1,000', currency: 'CNY', amount: '1000' },
];

let cachedDisplayTransitionSupport: boolean | undefined;

function canTransitionDisplay(): boolean {
  if (cachedDisplayTransitionSupport !== undefined) return cachedDisplayTransitionSupport;
  if (
    typeof window === 'undefined' ||
    !window.CSS?.supports?.('transition-behavior', 'allow-discrete') ||
    !document.body
  ) {
    return false;
  }
  const probe = document.createElement('div');
  probe.style.cssText = 'transition: display 1s allow-discrete !important; display: block;';
  document.body.appendChild(probe);
  void getComputedStyle(probe).display;
  probe.style.display = 'none';
  cachedDisplayTransitionSupport = getComputedStyle(probe).display === 'block';
  probe.remove();
  return cachedDisplayTransitionSupport;
}

function supportsTopLayerExit(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.CSS?.supports?.('overlay', 'auto')) &&
    canTransitionDisplay()
  );
}

function sanitizeDecimalInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '');
  const parts = cleaned.split('.');
  if (parts.length <= 2) return cleaned;
  return `${parts[0]}.${parts.slice(1).join('')}`;
}

export function FxConverterBadge({
  fxRate,
  refreshing,
  onRefresh,
}: FxConverterBadgeProps) {
  const popoverId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const [audValue, setAudValue] = useState('100');
  const [cnyValue, setCnyValue] = useState(() => (100 * fxRate.rate).toFixed(2));
  const [lastEdited, setLastEdited] = useState<'AUD' | 'CNY'>('AUD');

  // Conditionally load popover polyfill ONLY when native Popover API is missing
  useEffect(() => {
    if (
      typeof HTMLElement !== 'undefined' &&
      !Object.hasOwn(HTMLElement.prototype, 'popover')
    ) {
      void import('@oddbird/popover-polyfill');
    }
  }, []);

  // Recompute opposite field whenever live exchange rate updates
  useEffect(() => {
    if (lastEdited === 'AUD') {
      const n = Number.parseFloat(audValue);
      setCnyValue(Number.isFinite(n) && n >= 0 ? (n * fxRate.rate).toFixed(2) : '');
    } else {
      const n = Number.parseFloat(cnyValue);
      setAudValue(Number.isFinite(n) && n >= 0 ? (n / fxRate.rate).toFixed(2) : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fxRate.rate]);

  const handleAudChange = (raw: string) => {
    const clean = sanitizeDecimalInput(raw);
    setLastEdited('AUD');
    setAudValue(clean);
    const num = Number.parseFloat(clean);
    if (!clean || !Number.isFinite(num)) {
      setCnyValue('');
      return;
    }
    setCnyValue((num * fxRate.rate).toFixed(2));
  };

  const handleCnyChange = (raw: string) => {
    const clean = sanitizeDecimalInput(raw);
    setLastEdited('CNY');
    setCnyValue(clean);
    const num = Number.parseFloat(clean);
    if (!clean || !Number.isFinite(num)) {
      setAudValue('');
      return;
    }
    setAudValue((num / fxRate.rate).toFixed(2));
  };

  const applyPreset = (currency: 'AUD' | 'CNY', amount: string) => {
    if (currency === 'AUD') {
      handleAudChange(amount);
    } else {
      handleCnyChange(amount);
    }
  };

  const handleClosePopover = async () => {
    const el = popoverRef.current as (HTMLDivElement & { hidePopover?: () => void }) | null;
    if (el && typeof el.hidePopover === 'function') {
      try {
        if (!supportsTopLayerExit()) {
          el.setAttribute('data-closing', '');
          const animations = el.getAnimations?.({ subtree: true }) ?? [];
          if (animations.length > 0) {
            await Promise.race([
              Promise.allSettled(animations.map((a) => a.finished)),
              new Promise((r) => setTimeout(r, 400)),
            ]);
          }
          el.removeAttribute('data-closing');
        }
        el.hidePopover();
      } catch {
        el.removeAttribute('data-closing');
      }
    }
    triggerRef.current?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        popoverTarget={popoverId}
        aria-label={`当前汇率 1 澳元约等于 ${fxRate.rate.toFixed(4)} 人民币，点击打开双向换算工具`}
        className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-slate-200/70 bg-white/85 px-2.5 py-1 text-xs font-medium text-slate-900 shadow-[0_2px_10px_rgba(15,23,42,0.04)] backdrop-blur-md transition-all duration-200 hover:border-emerald-500/40 hover:bg-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:border-white/10 dark:border-t-white/20 dark:bg-gradient-to-r dark:from-emerald-500/15 dark:via-teal-500/10 dark:to-zinc-900/80 dark:text-zinc-100 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_4px_16px_rgba(16,185,129,0.12)] dark:hover:border-emerald-400/35 dark:hover:from-emerald-500/25 dark:hover:to-zinc-800/85 tabular-nums"
      >
        <span aria-hidden="true">🇦🇺</span>
        <span className="whitespace-nowrap">
          1 AUD ≈ <strong className="font-bold text-emerald-700 dark:text-emerald-300">¥{fxRate.rate.toFixed(4)}</strong>{' '}
          <span className="hidden xs:inline sm:inline">CNY</span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-zinc-400" aria-hidden="true" />
      </button>

      {/* Native Popover API ("auto" supports light-dismiss on outside click & Esc key) */}
      <div
        ref={popoverRef}
        id={popoverId}
        popover="auto"
        className="fx-converter-popover w-[min(20.5rem,calc(100vw-1.5rem))] rounded-2xl border border-white/10 border-t-white/20 bg-zinc-900/95 p-4 text-zinc-100 shadow-[0_24px_60px_rgba(0,0,0,0.65),0_0_24px_rgba(16,185,129,0.12)] backdrop-blur-xl"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <ArrowLeftRight className="h-4 w-4 text-emerald-300" aria-hidden="true" />
            <span className="text-sm font-bold text-zinc-100">澳元 ⇄ 人民币换算</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              aria-label="立即刷新汇率"
              title="立即刷新最新汇率"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-all hover:bg-zinc-800 hover:text-emerald-300 active:scale-[0.96] disabled:opacity-50"
            >
              <RefreshCw
                className={['h-3.5 w-3.5', refreshing ? 'animate-spin text-emerald-300' : ''].join(' ')}
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              onClick={() => void handleClosePopover()}
              aria-label="关闭汇率换算窗口"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-all hover:bg-zinc-800 hover:text-zinc-100 active:scale-[0.96]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Live rate summary strip */}
        <div className="mb-3.5 rounded-xl border border-white/10 bg-zinc-800/75 px-3 py-2 text-xs tabular-nums">
          <div className="flex items-center justify-between text-zinc-100">
            <span>1 澳元 (AUD)</span>
            <strong className="text-sm font-bold text-emerald-300">¥{fxRate.rate.toFixed(4)} CNY</strong>
          </div>
          <div className="mt-0.5 flex items-center justify-between text-[11px] text-zinc-400">
            <span>1 人民币 (CNY)</span>
            <span>A${fxRate.inverseRate.toFixed(4)} AUD</span>
          </div>
        </div>

        {/* Two-way converter inputs */}
        <div className="space-y-2.5">
          <div>
            <label
              htmlFor={`${popoverId}-aud`}
              className="mb-1 block text-xs font-medium text-zinc-300"
            >
              澳元 (AUD)
            </label>
            <div className="relative">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-zinc-400"
              >
                A$
              </span>
              <input
                id={`${popoverId}-aud`}
                type="text"
                inputMode="decimal"
                value={audValue}
                onChange={(e) => handleAudChange(e.target.value)}
                placeholder="输入澳元金额"
                className="min-h-11 w-full rounded-xl border border-white/10 bg-zinc-950/80 pl-9 pr-3 text-base font-semibold text-zinc-100 placeholder:text-zinc-500 tabular-nums transition-colors focus:border-emerald-400/60 focus:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-emerald-400/20"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor={`${popoverId}-cny`}
              className="mb-1 block text-xs font-medium text-zinc-300"
            >
              人民币 (CNY)
            </label>
            <div className="relative">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-zinc-400"
              >
                ¥
              </span>
              <input
                id={`${popoverId}-cny`}
                type="text"
                inputMode="decimal"
                value={cnyValue}
                onChange={(e) => handleCnyChange(e.target.value)}
                placeholder="输入人民币金额"
                className="min-h-11 w-full rounded-xl border border-white/10 bg-zinc-950/80 pl-9 pr-3 text-base font-semibold text-zinc-100 placeholder:text-zinc-500 tabular-nums transition-colors focus:border-emerald-400/60 focus:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-emerald-400/20"
              />
            </div>
          </div>
        </div>

        {/* Quick family reference presets */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset.currency, preset.amount)}
              className="rounded-lg border border-white/10 bg-zinc-800/80 px-2.5 py-1 text-xs font-medium text-zinc-200 transition-all hover:border-emerald-400/40 hover:bg-zinc-800 hover:text-emerald-300 active:scale-[0.97] tabular-nums"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <p className="mt-3 flex items-center justify-between border-t border-white/10 pt-2.5 text-[11px] text-zinc-400 tabular-nums">
          <span>来源：{fxRate.source}</span>
          <span>更新：{formatSydneyClock(fxRate.updatedAt)}</span>
        </p>
      </div>
    </>
  );
}
