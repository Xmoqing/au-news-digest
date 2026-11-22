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
        className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-3 py-1 text-xs font-medium text-[#1D1D1F] transition-colors hover:bg-[#F2F2F7] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF] dark:border-white/[0.10] dark:bg-[#1C1C1E] dark:text-[#F5F5F7] dark:hover:bg-[#2C2C2E] tabular-nums"
      >
        <span aria-hidden="true">🇦🇺</span>
        <span className="whitespace-nowrap">
          1 AUD ≈ <strong className="font-semibold text-[#007AFF] dark:text-[#0A84FF]">¥{fxRate.rate.toFixed(4)}</strong>{' '}
          <span className="hidden xs:inline sm:inline text-[#86868B]">CNY</span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#86868B]" aria-hidden="true" />
      </button>

      {/* Native Popover API ("auto" supports light-dismiss on outside click & Esc key) */}
      <div
        ref={popoverRef}
        id={popoverId}
        popover="auto"
        className="fx-converter-popover w-[min(20.5rem,calc(100vw-1.5rem))] rounded-2xl border border-white/[0.12] bg-[#1C1C1E]/95 p-4 text-[#F5F5F7] shadow-[0_24px_60px_rgba(0,0,0,0.65)] backdrop-blur-2xl saturate-150"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <ArrowLeftRight className="h-4 w-4 text-[#0A84FF]" aria-hidden="true" />
            <span className="text-sm font-semibold tracking-tight text-[#F5F5F7]">澳元 ⇄ 人民币换算</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              aria-label="立即刷新汇率"
              title="立即刷新最新汇率"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#86868B] transition-colors hover:bg-white/[0.10] hover:text-[#F5F5F7] active:scale-[0.96] disabled:opacity-50"
            >
              <RefreshCw
                className={['h-3.5 w-3.5', refreshing ? 'animate-spin text-[#0A84FF]' : ''].join(' ')}
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              onClick={() => void handleClosePopover()}
              aria-label="关闭汇率换算窗口"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#86868B] transition-colors hover:bg-white/[0.10] hover:text-[#F5F5F7] active:scale-[0.96]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Live rate summary strip */}
        <div className="mb-3.5 rounded-xl bg-[#2C2C2E] px-3.5 py-2.5 text-xs tabular-nums">
          <div className="flex items-center justify-between text-[#F5F5F7]">
            <span>1 澳元 (AUD)</span>
            <strong className="text-sm font-semibold text-[#0A84FF]">¥{fxRate.rate.toFixed(4)} CNY</strong>
          </div>
          <div className="mt-0.5 flex items-center justify-between text-[11px] text-[#86868B]">
            <span>1 人民币 (CNY)</span>
            <span>A${fxRate.inverseRate.toFixed(4)} AUD</span>
          </div>
        </div>

        {/* Two-way converter inputs */}
        <div className="space-y-2.5">
          <div>
            <label
              htmlFor={`${popoverId}-aud`}
              className="mb-1 block text-xs font-medium text-[#AEAEB2]"
            >
              澳元 (AUD)
            </label>
            <div className="relative">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#86868B]"
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
                className="min-h-11 w-full rounded-xl border border-white/[0.10] bg-[#000000]/70 pl-9 pr-3 text-base font-semibold text-[#F5F5F7] placeholder:text-[#86868B] tabular-nums transition-colors focus:border-[#0A84FF] focus:bg-[#000000] focus:outline-none focus:ring-2 focus:ring-[#0A84FF]/25"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor={`${popoverId}-cny`}
              className="mb-1 block text-xs font-medium text-[#AEAEB2]"
            >
              人民币 (CNY)
            </label>
            <div className="relative">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#86868B]"
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
                className="min-h-11 w-full rounded-xl border border-white/[0.10] bg-[#000000]/70 pl-9 pr-3 text-base font-semibold text-[#F5F5F7] placeholder:text-[#86868B] tabular-nums transition-colors focus:border-[#0A84FF] focus:bg-[#000000] focus:outline-none focus:ring-2 focus:ring-[#0A84FF]/25"
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
              className="rounded-full bg-white/[0.08] px-3 py-1 text-xs font-medium text-[#E5E5EA] transition-colors hover:bg-[#0A84FF]/20 hover:text-[#409CFF] active:scale-[0.97] tabular-nums"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <p className="mt-3 flex items-center justify-between border-t border-white/[0.08] pt-2.5 text-[11px] text-[#86868B] tabular-nums">
          <span>来源：{fxRate.source}</span>
          <span>更新：{formatSydneyClock(fxRate.updatedAt)}</span>
        </p>
      </div>
    </>
  );
}
