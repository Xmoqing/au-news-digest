'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import {
  AlertCircle,
  Globe2,
  LogOut,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { ArticleDetail } from '@/components/ArticleDetail';
import { FxConverterBadge } from '@/components/FxConverterBadge';
import { NewsCard } from '@/components/NewsCard';
import { formatRelativeTime, formatSydneyClock } from '@/lib/format';
import {
  CATEGORY_FILTERS,
  type CategoryFilter,
  type FxRateInfo,
  type NewsItem,
  type NewsListResponse,
  type RefreshResult,
  type RefreshState,
} from '@/types/news';

interface NewsDigestClientProps {
  initialData: NewsListResponse;
  initialArticleId?: number | null;
}

type FontSizeLevel = 'standard' | 'large' | 'xlarge';

const FONT_SIZE_ORDER: readonly FontSizeLevel[] = ['standard', 'large', 'xlarge'] as const;

const FONT_SIZE_LABELS: Record<FontSizeLevel, string> = {
  standard: '标准',
  large: '大号',
  xlarge: '特大',
};

const ENGLISH_TOGGLE_STORAGE_KEY = 'au-news-show-english-original';
const FONT_SIZE_STORAGE_KEY = 'au-news-font-size';

export function NewsDigestClient({
  initialData,
  initialArticleId = null,
}: NewsDigestClientProps) {
  const router = useRouter();

  const [items, setItems] = useState<NewsItem[]>(initialData.items);
  const [categoryCounts, setCategoryCounts] = useState(initialData.categoryCounts);
  const [lastUpdated, setLastUpdated] = useState<string | null>(initialData.lastUpdated);
  const [hasGeminiKey, setHasGeminiKey] = useState<boolean>(initialData.hasGeminiKey);
  const [fxRate, setFxRate] = useState<FxRateInfo | null>(initialData.fxRate);
  const [fxRefreshing, setFxRefreshing] = useState(false);
  const [refreshPulseCount, setRefreshPulseCount] = useState(0);
  const authEnabled = initialData.authEnabled;

  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('全部');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  // Elder-friendly font size toggle (standard / large / xlarge)
  const [fontSize, setFontSize] = useState<FontSizeLevel>('standard');

  const [selectedId, setSelectedId] = useState<number | null>(() => {
    if (initialArticleId) {
      const matched = initialData.items.find(
        (a) =>
          a.id === initialArticleId ||
          a.related_articles?.some((r) => r.id === initialArticleId)
      );
      if (matched) return matched.id;
    }
    return initialData.items[0]?.id ?? null;
  });

  // Mobile (< 768px) drill-down drawer visibility
  const [mobileDetailOpen, setMobileDetailOpen] = useState<boolean>(
    Boolean(
      initialArticleId &&
        initialData.items.some(
          (a) =>
            a.id === initialArticleId ||
            a.related_articles?.some((r) => r.id === initialArticleId)
        )
    )
  );

  const [showEnglishOriginal, setShowEnglishOriginal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(
    initialData.refreshState.isRefreshing
  );
  const [refreshStage, setRefreshStage] = useState<string | null>(
    initialData.refreshState.progress?.stage ?? null
  );
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [isDesktop, setIsDesktop] = useState(false);

  const tablistRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const backButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastTriggerRef = useRef<HTMLAnchorElement | null>(null);
  const desktopDetailScrollerRef = useRef<HTMLElement | null>(null);
  const mobileDetailScrollerRef = useRef<HTMLDivElement | null>(null);
  const lastProgressCurrentRef = useRef<number>(0);

  // Restore user preferences from localStorage (English toggle + elder font size)
  useEffect(() => {
    try {
      const savedEnglish = window.localStorage.getItem(ENGLISH_TOGGLE_STORAGE_KEY);
      if (savedEnglish === 'true') setShowEnglishOriginal(true);

      const savedFont = window.localStorage.getItem(FONT_SIZE_STORAGE_KEY);
      if (savedFont === 'standard' || savedFont === 'large' || savedFont === 'xlarge') {
        setFontSize(savedFont);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const updateFontSize = useCallback((next: FontSizeLevel) => {
    setFontSize(next);
    try {
      window.localStorage.setItem(FONT_SIZE_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const handleDecreaseFont = useCallback(() => {
    const idx = FONT_SIZE_ORDER.indexOf(fontSize);
    if (idx > 0) updateFontSize(FONT_SIZE_ORDER[idx - 1]);
  }, [fontSize, updateFontSize]);

  const handleIncreaseFont = useCallback(() => {
    const idx = FONT_SIZE_ORDER.indexOf(fontSize);
    if (idx < FONT_SIZE_ORDER.length - 1) updateFontSize(FONT_SIZE_ORDER[idx + 1]);
  }, [fontSize, updateFontSize]);

  const handleCycleFont = useCallback(() => {
    const idx = FONT_SIZE_ORDER.indexOf(fontSize);
    updateFontSize(FONT_SIZE_ORDER[(idx + 1) % FONT_SIZE_ORDER.length]);
  }, [fontSize, updateFontSize]);

  const toggleEnglishOriginal = useCallback(() => {
    setShowEnglishOriginal((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(ENGLISH_TOGGLE_STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // Track fold / viewport breakpoint (>= 768px = unfolded inner screen Master-Detail)
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)');
    const update = () => setIsDesktop(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  // IntersectionObserver fallback for horizontal category tablist edge fades
  useEffect(() => {
    const scroller = tablistRef.current;
    if (!scroller) return;
    if (typeof CSS !== 'undefined' && CSS.supports('animation-timeline', 'scroll()')) {
      return;
    }
    const first = scroller.firstElementChild;
    const last = scroller.lastElementChild;
    if (!first || !last) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const { target, intersectionRatio } of entries) {
          scroller.classList.toggle(
            target === first ? 'more-start' : 'more-end',
            intersectionRatio < 1
          );
        }
      },
      { root: scroller, threshold: 1, rootMargin: '1px' }
    );
    observer.observe(first);
    observer.observe(last);
    return () => observer.disconnect();
  }, []);

  // Sync mobile drill-down with browser history (supports Android OS Back gesture)
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const artId = Number(params.get('article'));
      if (Number.isFinite(artId) && artId > 0) {
        setSelectedId(artId);
        setMobileDetailOpen(true);
      } else {
        setMobileDetailOpen(false);
        requestAnimationFrame(() => {
          lastTriggerRef.current?.focus({ preventScroll: true });
        });
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const fetchLatestNews = useCallback(async () => {
    try {
      const res = await fetch('/api/news?limit=300', { cache: 'no-store' });
      if (res.status === 401) {
        router.refresh();
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as NewsListResponse;
      setItems(data.items);
      setCategoryCounts(data.categoryCounts);
      setLastUpdated(data.lastUpdated);
      setHasGeminiKey(data.hasGeminiKey);
      if (data.fxRate) setFxRate(data.fxRate);
      setIsRefreshing(data.refreshState.isRefreshing);
      setRefreshStage(data.refreshState.progress?.stage ?? null);
    } catch {
      // silent retry on next user action
    }
  }, [router]);

  const refreshFxRate = useCallback(
    async (force = false) => {
      if (fxRefreshing) return;
      setFxRefreshing(true);
      try {
        const res = await fetch(
          force ? '/api/exchange-rate?refresh=1' : '/api/exchange-rate',
          { cache: 'no-store' }
        );
        if (res.status === 401) {
          router.refresh();
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as { fx?: FxRateInfo | null };
        if (data.fx) {
          setFxRate(data.fx);
        }
      } catch {
        // keep last displayed rate
      } finally {
        setFxRefreshing(false);
      }
    },
    [fxRefreshing, router]
  );

  // Auto-refresh AUD/CNY exchange rate every 15 minutes while page is visible
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshFxRate(false);
      }
    }, 15 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [refreshFxRate]);

  // Poll refresh state while server is syncing (streams newly translated batches live!)
  useEffect(() => {
    if (!isRefreshing) return;
    const timer = window.setInterval(async () => {
      try {
        const res = await fetch('/api/refresh', { cache: 'no-store' });
        if (res.status === 401) {
          router.refresh();
          return;
        }
        if (!res.ok) return;
        const state = (await res.json()) as RefreshState;
        setRefreshStage(state.progress?.stage ?? null);

        const currentCount = state.progress?.current ?? 0;
        if (currentCount > lastProgressCurrentRef.current) {
          lastProgressCurrentRef.current = currentCount;
          await fetchLatestNews();
        }

        if (!state.isRefreshing) {
          lastProgressCurrentRef.current = 0;
          setIsRefreshing(false);
          setRefreshStage(null);
          await fetchLatestNews();
          if (state.lastResult?.message) {
            setToast({
              type: state.lastResult.ok ? 'success' : 'error',
              text: state.lastResult.message,
            });
          }
        }
      } catch {
        // ignore transient poll errors
      }
    }, 1500);

    return () => window.clearInterval(timer);
  }, [isRefreshing, fetchLatestNews, router]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (activeCategory !== '全部' && item.category !== activeCategory) {
        return false;
      }
      if (!q) return true;
      const pool = item.related_articles ?? [item];
      return pool.some(
        (a) =>
          a.zh_title.toLowerCase().includes(q) ||
          a.zh_summary.toLowerCase().includes(q) ||
          a.original_title.toLowerCase().includes(q) ||
          a.source_name.toLowerCase().includes(q)
      );
    });
  }, [items, activeCategory, searchQuery]);

  useEffect(() => {
    if (filteredItems.length === 0) return;
    if (!selectedId || !filteredItems.some((a) => a.id === selectedId)) {
      setSelectedId(filteredItems[0].id);
    }
  }, [filteredItems, selectedId]);

  const selectedArticle = useMemo(() => {
    if (!selectedId) return filteredItems[0] ?? null;
    return (
      filteredItems.find((a) => a.id === selectedId) ??
      items.find((a) => a.id === selectedId) ??
      filteredItems[0] ??
      null
    );
  }, [filteredItems, items, selectedId]);

  useEffect(() => {
    if (!selectedArticle) {
      document.title = 'AU News Digest · 澳洲与国际热点速览';
      return;
    }
    if (mobileDetailOpen || isDesktop) {
      document.title = `${selectedArticle.zh_title} | 热点速览`;
    } else {
      document.title = 'AU News Digest · 澳洲与国际热点速览';
    }
  }, [selectedArticle, mobileDetailOpen, isDesktop]);

  const handleSelectArticle = useCallback(
    (item: NewsItem, triggerEl: HTMLAnchorElement) => {
      lastTriggerRef.current = triggerEl;
      setSelectedId(item.id);

      if (!isDesktop) {
        setMobileDetailOpen(true);
        const url = new URL(window.location.href);
        url.searchParams.set('article', String(item.id));
        window.history.pushState({ articleId: item.id }, '', url.toString());
        requestAnimationFrame(() => {
          mobileDetailScrollerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
          backButtonRef.current?.focus({ preventScroll: true });
        });
      } else {
        const url = new URL(window.location.href);
        url.searchParams.set('article', String(item.id));
        window.history.replaceState({ articleId: item.id }, '', url.toString());
        desktopDetailScrollerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
      }
    },
    [isDesktop]
  );

  const handleMobileBack = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('article') && window.history.length > 1) {
      window.history.back();
    } else {
      setMobileDetailOpen(false);
      const url = new URL(window.location.href);
      url.searchParams.delete('article');
      window.history.replaceState({}, '', url.toString());
      requestAnimationFrame(() => {
        lastTriggerRef.current?.focus({ preventScroll: true });
      });
    }
  }, []);

  const handleManualRefresh = async () => {
    if (isRefreshing) return;
    lastProgressCurrentRef.current = 0;
    setRefreshPulseCount((c) => c + 1);
    setIsRefreshing(true);
    setRefreshStage('正在连接澳洲与国际主流媒体 RSS...');
    void refreshFxRate(true);
    try {
      const res = await fetch('/api/refresh?async=1', { method: 'POST' });
      if (res.status === 401) {
        setIsRefreshing(false);
        setRefreshStage(null);
        setToast({ type: 'error', text: '登录状态已失效，请重新验证访问口令' });
        router.refresh();
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as Partial<RefreshResult>;
        setIsRefreshing(false);
        setRefreshStage(null);
        setToast({
          type: 'error',
          text: data.message || '触发刷新失败，请稍后重试',
        });
      }
    } catch (err) {
      setIsRefreshing(false);
      setRefreshStage(null);
      setToast({
        type: 'error',
        text: `网络错误: ${err instanceof Error ? err.message : '无法刷新'}`,
      });
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.localStorage.removeItem('au-news-auth-verified-at');
    } catch {
      // ignore
    }
    router.refresh();
  };

  const handleSelectCategory = (cat: CategoryFilter, idx: number) => {
    setActiveCategory(cat);
    const btn = tabRefs.current[idx];
    btn?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  };

  const handleTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const count = CATEGORY_FILTERS.length;
    let nextIdx: number | null = null;
    if (e.key === 'ArrowRight') nextIdx = (index + 1) % count;
    else if (e.key === 'ArrowLeft') nextIdx = (index - 1 + count) % count;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = count - 1;

    if (nextIdx !== null) {
      e.preventDefault();
      const targetCat = CATEGORY_FILTERS[nextIdx];
      handleSelectCategory(targetCat, nextIdx);
      tabRefs.current[nextIdx]?.focus();
    }
  };

  const listIsInertOnMobile = !isDesktop && mobileDetailOpen;
  const fontScaleClass = `reader-scale-${fontSize}`;

  return (
    <MotionConfig reducedMotion="user">
      <div
        className={[
          fontScaleClass,
          'relative flex min-h-[100dvh] flex-col bg-canvas text-ink md:h-[100dvh] md:overflow-hidden',
        ].join(' ')}
      >
        {/* Clearly visible top ambient radial glow (emerald -> deep indigo) */}
        <div
          aria-hidden="true"
          className="ambient-top-glow pointer-events-none fixed inset-x-0 top-0 z-0 h-80"
        />

        {/* Main app shell (inert on mobile while full-screen detail drawer is open) */}
        <div
          inert={listIsInertOnMobile || undefined}
          className="relative z-10 flex min-h-[100dvh] flex-1 flex-col md:min-h-0 md:overflow-hidden"
        >
          {/* Top Sticky Dark Frosted-Glass Header + 1px Luminous Gradient Bottom Divider */}
          <header className="sticky top-0 z-20 shrink-0 bg-white/80 shadow-[0_1px_16px_rgba(15,23,42,0.04)] backdrop-blur-xl dark:bg-zinc-900/75 dark:shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
            <div className="flex items-center justify-between gap-2 px-3.5 pt-2.5 pb-1.5 md:px-5">
              {/* Brand + Status */}
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_4px_14px_rgba(16,185,129,0.38)] dark:from-emerald-400 dark:to-teal-500 dark:text-slate-950 dark:shadow-[0_0_18px_rgba(16,185,129,0.45)]">
                  <Globe2 className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="truncate text-[15px] font-bold tracking-tight text-ink">
                      热点速览
                    </span>
                    <span className="hidden text-[11px] font-medium tracking-wide text-ink-muted sm:inline">
                      澳亚 · 国际
                    </span>
                  </div>
                  <p className="truncate text-[11px] text-ink-muted tabular-nums">
                    {isRefreshing
                      ? refreshStage || '正在同步最新资讯...'
                      : lastUpdated
                        ? `更新 ${formatSydneyClock(lastUpdated)} · ${formatRelativeTime(lastUpdated)}`
                        : '等待首次同步'}
                  </p>
                </div>
              </div>

              {/* Right Controls: Elder A-/A+ Font Size Toggle + Search + Manual Refresh + Optional Lock */}
              <div className="flex shrink-0 items-center gap-1.5">
                {/* Elder-friendly A- / A+ font size switcher */}
                <div
                  role="group"
                  aria-label="字号大小调节"
                  className="inline-flex min-h-9 items-center rounded-lg border border-slate-200/70 bg-surface-subtle/60 p-0.5 backdrop-blur-md dark:border-white/10 dark:bg-zinc-800/60 md:min-h-8"
                >
                  <button
                    type="button"
                    onClick={handleDecreaseFont}
                    disabled={fontSize === 'standard'}
                    aria-label="减小字号"
                    className="inline-flex h-8 w-7 items-center justify-center rounded-md text-xs font-semibold text-ink transition-all hover:bg-surface active:scale-[0.96] disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:hover:bg-zinc-700/70 md:h-7"
                  >
                    A-
                  </button>
                  <button
                    type="button"
                    onClick={handleCycleFont}
                    aria-label={`当前字号：${FONT_SIZE_LABELS[fontSize]}，点击切换`}
                    title="点击循环切换 标准 / 大号 / 特大"
                    className="inline-flex h-8 items-center justify-center rounded-md bg-white/95 px-1.5 text-[11px] font-semibold text-accent shadow-xs transition-transform active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:bg-emerald-500/20 dark:text-emerald-300 md:h-7"
                  >
                    {FONT_SIZE_LABELS[fontSize]}
                  </button>
                  <button
                    type="button"
                    onClick={handleIncreaseFont}
                    disabled={fontSize === 'xlarge'}
                    aria-label="增大字号"
                    className="inline-flex h-8 w-7 items-center justify-center rounded-md text-xs font-bold text-ink transition-all hover:bg-surface active:scale-[0.96] disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:hover:bg-zinc-700/70 md:h-7"
                  >
                    A+
                  </button>
                </div>

                {/* Desktop inline search */}
                <div className="relative hidden lg:block">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="搜索标题或媒体..."
                    aria-label="搜索新闻"
                    enterKeyHint="search"
                    className="h-8 w-44 rounded-lg border border-slate-200/70 bg-white/75 pl-8 pr-7 text-xs text-ink placeholder:text-ink-muted backdrop-blur-sm transition-colors focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-white/10 dark:bg-zinc-800/60 dark:focus:border-emerald-400/50 dark:focus:bg-zinc-900"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label="清除搜索"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted transition-transform hover:text-ink active:scale-[0.95]"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>

                {/* Mobile / tablet search toggle */}
                <button
                  type="button"
                  onClick={() => setSearchOpen((v) => !v)}
                  aria-label="搜索新闻"
                  aria-expanded={searchOpen}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200/70 bg-white/80 text-ink-secondary transition-all hover:bg-surface-subtle active:scale-[0.98] dark:border-white/10 dark:bg-zinc-800/60 dark:hover:border-white/20 lg:hidden md:h-8 md:w-8"
                >
                  {searchOpen ? (
                    <X className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Search className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>

                {/* Manual refresh trigger with damped spring rotation */}
                <button
                  type="button"
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  aria-label="手动刷新澳洲与国际新闻"
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200/70 bg-white/80 px-2.5 text-xs font-medium text-ink shadow-[0_1px_4px_rgba(15,23,42,0.03)] transition-all hover:border-accent/40 hover:bg-white hover:text-accent active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:border-white/10 dark:border-t-white/15 dark:bg-zinc-800/65 dark:hover:border-emerald-400/40 dark:hover:text-emerald-300 md:min-h-8"
                >
                  <motion.span
                    key={isRefreshing ? 'spinning' : `idle-${refreshPulseCount}`}
                    animate={
                      isRefreshing
                        ? { rotate: 360 }
                        : { rotate: refreshPulseCount > 0 ? 360 : 0 }
                    }
                    transition={
                      isRefreshing
                        ? { repeat: Infinity, duration: 0.95, ease: 'linear' }
                        : { type: 'spring', stiffness: 180, damping: 20 }
                    }
                    className="inline-flex items-center justify-center"
                  >
                    <RefreshCw
                      className={['h-3.5 w-3.5', isRefreshing ? 'text-accent dark:text-emerald-300' : ''].join(' ')}
                      aria-hidden="true"
                    />
                  </motion.span>
                  <span className="hidden sm:inline">{isRefreshing ? '同步中' : '刷新'}</span>
                </button>

                {/* Lock / Logout button (only visible when ACCESS_PASSWORD is enabled) */}
                {authEnabled && (
                  <button
                    type="button"
                    onClick={handleLogout}
                    aria-label="退出访问口令验证"
                    title="锁定退出"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200/70 bg-white/80 text-ink-muted transition-all hover:bg-surface-subtle hover:text-ink active:scale-[0.98] dark:border-white/10 dark:bg-zinc-800/60 md:h-8 md:w-8"
                  >
                    <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>

            {/* Mobile / tablet expandable search bar */}
            <AnimatePresence initial={false}>
              {searchOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden px-3.5 lg:hidden"
                >
                  <div className="relative pb-2">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="搜索中文标题、英文关键词或来源..."
                      enterKeyHint="search"
                      autoFocus
                      className="h-9 w-full rounded-xl border border-slate-200/70 bg-surface-subtle/80 pl-9 pr-8 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:bg-surface focus:outline-none dark:border-white/10 dark:bg-zinc-800/70"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        aria-label="清除搜索"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Compact AUD / CNY Frosted-Glass Capsule Card + Two-way Converter Popover */}
            {fxRate && (
              <div className="border-t border-slate-200/50 bg-white/40 px-3.5 py-1.5 backdrop-blur-xl dark:border-white/[0.06] dark:bg-zinc-900/55 md:px-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <FxConverterBadge
                    fxRate={fxRate}
                    refreshing={fxRefreshing}
                    onRefresh={() => void refreshFxRate(true)}
                  />
                  <span className="text-[11px] text-ink-muted tabular-nums">
                    100 澳元 ≈ ¥{(fxRate.rate * 100).toFixed(1)} · 点击汇率打开双向换算
                  </span>
                </div>
              </div>
            )}

            {/* Single-row horizontally scrollable Category Tabs with Glowing Spring Capsule Slider */}
            <div className="border-t border-slate-200/40 px-3 py-1.5 dark:border-white/[0.06] md:px-4">
              <div
                ref={tablistRef}
                role="tablist"
                aria-label="新闻分类筛选"
                className="category-tablist"
              >
                {CATEGORY_FILTERS.map((cat, idx) => {
                  const selected = activeCategory === cat;
                  const count = categoryCounts[cat] ?? 0;
                  return (
                    <button
                      key={cat}
                      ref={(el) => {
                        tabRefs.current[idx] = el;
                      }}
                      type="button"
                      role="tab"
                      id={`tab-${cat}`}
                      aria-selected={selected}
                      tabIndex={selected ? 0 : -1}
                      onClick={() => handleSelectCategory(cat, idx)}
                      onKeyDown={(e) => handleTabKeyDown(e, idx)}
                      className="category-tab relative z-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[14px] font-medium transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                    >
                      {selected && (
                        <motion.span
                          layoutId="category-active-pill"
                          transition={{
                            type: 'spring',
                            stiffness: 380,
                            damping: 30,
                          }}
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-x-0.5 inset-y-0.5 -z-10 rounded-full border border-emerald-500/35 bg-gradient-to-r from-emerald-500/15 to-teal-500/10 shadow-[0_2px_12px_rgba(16,185,129,0.14)] dark:border-emerald-400/45 dark:from-emerald-500/30 dark:to-teal-500/20 dark:shadow-[0_0_18px_rgba(16,185,129,0.32),inset_0_1px_0_rgba(255,255,255,0.16)]"
                        />
                      )}
                      <span className={selected ? 'dark:text-emerald-200 font-semibold' : ''}>
                        {cat}
                      </span>
                      <span
                        className={[
                          'rounded-full px-1.5 py-0.5 text-[10px] leading-none tabular-nums transition-colors',
                          selected
                            ? 'bg-emerald-500/20 text-accent dark:bg-emerald-400/20 dark:text-emerald-200'
                            : 'bg-surface-subtle text-ink-muted dark:bg-zinc-800/90',
                        ].join(' ')}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Subtle luminous 1px bottom divider line */}
            <div
              aria-hidden="true"
              className="h-px w-full bg-gradient-to-r from-transparent via-slate-300/70 to-transparent dark:via-emerald-400/40"
            />
          </header>

          {/* Subtle Notice Banner when GEMINI_API_KEY is not configured */}
          {!hasGeminiKey && (
            <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-800 dark:text-amber-200 md:px-5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <p className="leading-snug">
                当前未检测到 <code className="rounded bg-black/10 px-1 py-0.5 font-mono dark:bg-white/10">GEMINI_API_KEY</code>，已展示 RSS 原始资讯。在环境变量中配置后点击「刷新」即可自动启用 Gemini AI 中文编译与要点提炼。
              </p>
            </div>
          )}

          {/* Toast notification with subtle spring entrance/exit */}
          <AnimatePresence>
            {toast && (
              <motion.div
                role="status"
                aria-live="polite"
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="pointer-events-none fixed bottom-5 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2"
              >
                <div
                  className={[
                    'rounded-xl border px-4 py-2.5 text-center text-xs font-medium shadow-lg backdrop-blur-md',
                    toast.type === 'success'
                      ? 'border-emerald-400/35 bg-zinc-900/95 text-zinc-100'
                      : 'border-red-500/35 bg-red-950/95 text-red-100',
                  ].join(' ')}
                >
                  {toast.text}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Responsive Workspace:
              - Outer / Narrow (< 768px): Single-column card stream
              - Inner Unfolded / Desktop (>= 768px): 38% Left List + 62% Right Reading Detail */}
          <main className="flex-1 md:grid md:min-h-0 md:grid-cols-[38%_62%]">
            {/* Left Master Directory List (translucent so top emerald/blue ambient glow shines through) */}
            <section
              role="tabpanel"
              aria-labelledby={`tab-${activeCategory}`}
              className="pane-scroller bg-transparent md:h-full md:overflow-y-auto md:border-r md:border-slate-200/60 dark:md:border-white/[0.07]"
            >
              {filteredItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
                  <p className="text-sm font-medium text-ink">
                    {isRefreshing
                      ? '正在从澳洲与国际主流媒体拉取最新资讯...'
                      : searchQuery
                        ? '未找到匹配的新闻'
                        : '该分类下暂无新闻'}
                  </p>
                  <p className="mt-1.5 text-xs text-ink-muted">
                    {isRefreshing
                      ? refreshStage || '请稍候片刻'
                      : '点击右上角「刷新」立即拉取最新澳洲与国际热点'}
                  </p>
                  {!isRefreshing && !searchQuery && (
                    <button
                      type="button"
                      onClick={handleManualRefresh}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-medium text-white transition-[opacity,transform] hover:opacity-90 active:scale-[0.98] dark:text-slate-950"
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>立即拉取新闻</span>
                    </button>
                  )}
                </div>
              ) : (
                <div key={activeCategory} className="py-1.5">
                  {filteredItems.map((item, idx) => (
                    <NewsCard
                      key={item.id}
                      item={item}
                      index={idx}
                      isSelected={selectedArticle?.id === item.id}
                      onSelect={handleSelectArticle}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Right Detail Reading Pane (translucent glass surface so top ambient glow blends naturally) */}
            <section
              ref={desktopDetailScrollerRef}
              aria-label="新闻正文阅读区"
              className="pane-scroller hidden bg-white/60 dark:bg-zinc-950/45 md:block md:h-full md:overflow-y-auto"
            >
              <ArticleDetail
                article={selectedArticle}
                showEnglishOriginal={showEnglishOriginal}
                onToggleEnglishOriginal={toggleEnglishOriginal}
                scrollContainerRef={desktopDetailScrollerRef}
              />
            </section>
          </main>
        </div>

        {/* Mobile (< 768px) Full-screen Drill-down Detail View */}
        <div
          ref={mobileDetailScrollerRef}
          role="region"
          aria-label="新闻详情页"
          aria-hidden={!mobileDetailOpen || isDesktop}
          inert={(!mobileDetailOpen || isDesktop) || undefined}
          className={[
            'mobile-detail-drawer pane-scroller fixed inset-0 z-40 h-[100dvh] w-full overflow-y-auto bg-surface md:hidden',
            mobileDetailOpen
              ? 'translate-x-0 opacity-100 pointer-events-auto shadow-2xl'
              : 'translate-x-full opacity-0 pointer-events-none',
          ].join(' ')}
        >
          <ArticleDetail
            article={selectedArticle}
            showEnglishOriginal={showEnglishOriginal}
            onToggleEnglishOriginal={toggleEnglishOriginal}
            showBackButton
            onBack={handleMobileBack}
            backButtonRef={backButtonRef}
            scrollContainerRef={mobileDetailScrollerRef}
          />
        </div>
      </div>
    </MotionConfig>
  );
}
