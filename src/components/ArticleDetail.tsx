'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion';
import {
  ArrowLeft,
  Check,
  Clock,
  ExternalLink,
  Languages,
  Layers,
  ListChecks,
  Newspaper,
  Share2,
  Sparkles,
  User,
} from 'lucide-react';
import {
  formatRelativeTime,
  formatSydneyTime,
  getCategoryPillClass,
  getSourceBadgeClass,
} from '@/lib/format';
import type { NewsItem } from '@/types/news';

interface ArticleDetailProps {
  article: NewsItem | null;
  showEnglishOriginal: boolean;
  onToggleEnglishOriginal: () => void;
  showBackButton?: boolean;
  onBack?: () => void;
  backButtonRef?: RefObject<HTMLButtonElement | null>;
  scrollContainerRef?: RefObject<HTMLElement | null>;
}

export function ArticleDetail({
  article,
  showEnglishOriginal,
  onToggleEnglishOriginal,
  showBackButton = false,
  onBack,
  backButtonRef,
  scrollContainerRef,
}: ArticleDetailProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [imgFailed, setImgFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const sourceTabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Smooth spring-damped reading progress bar tied to the reading pane scroller
  const rawProgress = useMotionValue(0);
  const smoothProgress = useSpring(rawProgress, {
    stiffness: 260,
    damping: 32,
    restDelta: 0.001,
  });

  // Reset selected source tab and scroll progress when switching to a different topic
  useEffect(() => {
    setActiveIndex(0);
    setImgFailed(false);
    setCopied(false);
    rawProgress.set(0);
  }, [article?.id, rawProgress]);

  const clusterMembers = useMemo(() => {
    if (!article) return [];
    if (article.related_articles && article.related_articles.length > 1) {
      return article.related_articles;
    }
    return [article];
  }, [article]);

  const currentArticle = clusterMembers[activeIndex] ?? article;

  // Reset image error, copy badge, and progress when switching media perspective within a cluster
  useEffect(() => {
    setImgFailed(false);
    setCopied(false);
    rawProgress.set(0);
  }, [currentArticle?.id, rawProgress]);

  // Listen to parent scroll container to update reading progress smoothly
  useEffect(() => {
    const container = scrollContainerRef?.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollable = container.scrollHeight - container.clientHeight;
      if (scrollable <= 16) {
        rawProgress.set(0);
        return;
      }
      const ratio = Math.min(1, Math.max(0, container.scrollTop / scrollable));
      rawProgress.set(ratio);
    };

    handleScroll();
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [scrollContainerRef, currentArticle?.id, rawProgress]);

  if (!article || !currentArticle) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 py-16 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-surface-subtle text-ink-muted">
          <Newspaper className="h-7 w-7" aria-hidden="true" />
        </div>
        <p className="text-base font-medium text-ink">选择左侧新闻查看全文编译</p>
        <p className="mt-1.5 max-w-xs text-sm text-ink-muted">
          展开内屏即可体验左侧目录、右侧深度阅读的折叠屏双栏视图。
        </p>
      </div>
    );
  }

  const hasMultipleSources = clusterMembers.length > 1;
  const uniqueSourceCount = new Set(clusterMembers.map((m) => m.source_name)).size;

  const paragraphs = currentArticle.zh_content
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const keyPoints = currentArticle.zh_key_points ?? [];

  const handleSourceTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    const count = clusterMembers.length;
    let nextIdx: number | null = null;
    if (e.key === 'ArrowRight') nextIdx = (idx + 1) % count;
    else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + count) % count;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = count - 1;

    if (nextIdx !== null) {
      e.preventDefault();
      setActiveIndex(nextIdx);
      sourceTabRefs.current[nextIdx]?.focus();
      sourceTabRefs.current[nextIdx]?.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
      });
    }
  };

  const handleShare = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: currentArticle.zh_title,
          text: currentArticle.zh_summary,
          url: currentArticle.original_url,
        });
        return;
      }
      await navigator.clipboard.writeText(
        `${currentArticle.zh_title}\n${currentArticle.zh_summary}\n${currentArticle.original_url}`
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // User cancelled share sheet or clipboard denied
    }
  };

  return (
    <div className="flex min-h-full flex-col bg-transparent">
      {/* Top sticky dark frosted-glass action bar + luminous gradient hairline + reading progress */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl dark:bg-zinc-900/75">
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            {showBackButton && onBack ? (
              <button
                ref={backButtonRef}
                type="button"
                onClick={onBack}
                aria-label="返回新闻列表"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-ink transition-all hover:bg-surface-subtle active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>返回列表</span>
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                <span
                  className={[
                    'inline-flex items-center rounded-md border px-2 py-0.5 font-medium',
                    getSourceBadgeClass(currentArticle.source_id),
                  ].join(' ')}
                >
                  {currentArticle.source_name}
                </span>
                <span
                  className={[
                    'inline-flex items-center rounded-md px-2 py-0.5 font-medium',
                    getCategoryPillClass(currentArticle.category),
                  ].join(' ')}
                >
                  {currentArticle.category}
                </span>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {/* English Original Title Comparison Toggle */}
            <button
              type="button"
              onClick={onToggleEnglishOriginal}
              aria-pressed={showEnglishOriginal}
              className={[
                'inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                showEnglishOriginal
                  ? 'border-emerald-400/40 bg-emerald-500/15 text-accent dark:text-emerald-300 dark:shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                  : 'border-slate-200/70 bg-white/80 text-ink-secondary hover:bg-surface-subtle dark:border-white/10 dark:bg-zinc-800/60 dark:hover:border-white/20',
              ].join(' ')}
            >
              <Languages className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>英文对照</span>
            </button>

            {/* Share / Copy button */}
            <button
              type="button"
              onClick={handleShare}
              aria-label="分享或复制新闻链接"
              className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-slate-200/70 bg-white/80 text-ink-secondary transition-all hover:bg-surface-subtle active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:border-white/10 dark:bg-zinc-800/60 dark:hover:border-white/20"
            >
              {copied ? (
                <Check className="h-4 w-4 text-accent dark:text-emerald-300" aria-hidden="true" />
              ) : (
                <Share2 className="h-4 w-4" aria-hidden="true" />
              )}
            </button>

            {/* External original link button */}
            <a
              href={currentArticle.original_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-3 text-xs font-semibold text-white shadow-[0_2px_12px_rgba(16,185,129,0.25)] transition-all hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface dark:from-emerald-400 dark:to-teal-300 dark:text-slate-950 dark:shadow-[0_0_16px_rgba(16,185,129,0.3)]"
            >
              <span>访问原文</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            </a>
          </div>
        </div>

        {/* Luminous 1px gradient divider + reading progress overlay */}
        <div className="relative h-px w-full bg-gradient-to-r from-transparent via-slate-300/60 to-transparent dark:via-emerald-400/30">
          <motion.div
            aria-hidden="true"
            style={{ scaleX: smoothProgress, transformOrigin: '0% 50%' }}
            className="absolute inset-x-0 -top-[1px] h-[2px] bg-gradient-to-r from-emerald-400 via-teal-300 to-blue-400 shadow-[0_0_8px_rgba(16,185,129,0.65)]"
          />
        </div>
      </div>

      {/* Article reading body with clear horizontal "page-turn" transition on topic or media switch */}
      <div className="mx-auto w-full max-w-[70ch] flex-1 overflow-x-clip px-4 py-5 sm:px-6 md:px-8 md:py-7">
        {/* Multi-perspective Media Source Switcher Tabs kept outside AnimatePresence so spring pill glides cleanly */}
        {hasMultipleSources && (
          <div className="mb-4 rounded-xl border border-emerald-500/25 bg-surface-subtle/60 px-3 pt-2.5 pb-1.5 backdrop-blur-md dark:border-white/10 dark:border-t-emerald-400/30 dark:bg-zinc-900/70">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-accent dark:text-emerald-300">
              <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                {uniqueSourceCount > 1
                  ? `综合 ${uniqueSourceCount} 家媒体报道（共 ${clusterMembers.length} 篇）· 点击切换不同媒体视角`
                  : `综合 ${clusterMembers.length} 篇关联报道 · 点击切换查看`}
              </span>
            </div>
            <div
              role="tablist"
              aria-label="切换媒体报道来源"
              className="category-tablist pb-0.5"
            >
              {clusterMembers.map((member, idx) => {
                const selected = idx === activeIndex;
                return (
                  <button
                    key={member.id}
                    ref={(el) => {
                      sourceTabRefs.current[idx] = el;
                    }}
                    type="button"
                    role="tab"
                    id={`source-tab-${member.id}`}
                    aria-selected={selected}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => setActiveIndex(idx)}
                    onKeyDown={(e) => handleSourceTabKeyDown(e, idx)}
                    className="category-tab relative z-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                  >
                    {selected && (
                      <motion.span
                        layoutId={`source-active-pill-${article.id}`}
                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-0.5 inset-y-0.5 -z-10 rounded-lg border border-emerald-500/30 bg-emerald-500/15 shadow-xs dark:border-emerald-400/40 dark:bg-gradient-to-r dark:from-emerald-500/25 dark:to-teal-500/15 dark:shadow-[0_0_14px_rgba(16,185,129,0.28)]"
                      />
                    )}
                    <span>{member.source_name}</span>
                    <span className="text-[10px] font-normal text-ink-muted tabular-nums">
                      {formatRelativeTime(member.published_at)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <AnimatePresence mode="wait" initial={false}>
          <motion.article
            key={currentArticle.id}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Mobile source/category row */}
            {showBackButton && (
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={[
                    'inline-flex items-center rounded-md border px-2 py-0.5 font-medium',
                    getSourceBadgeClass(currentArticle.source_id),
                  ].join(' ')}
                >
                  {currentArticle.source_name}
                </span>
                <span
                  className={[
                    'inline-flex items-center rounded-md px-2 py-0.5 font-medium',
                    getCategoryPillClass(currentArticle.category),
                  ].join(' ')}
                >
                  {currentArticle.category}
                </span>
              </div>
            )}

            {/* Scalable Headline */}
            <h1 className="article-headline break-words font-bold text-ink">
              {currentArticle.zh_title}
            </h1>

            {/* English original title & excerpt comparison panel */}
            <AnimatePresence initial={false}>
              {showEnglishOriginal && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  className="mt-3 rounded-xl border border-slate-200/70 bg-slate-100/90 px-4 py-3 text-slate-900 dark:border-white/10 dark:border-t-white/15 dark:bg-zinc-900/90 dark:text-zinc-100"
                >
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                    <Languages className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300" aria-hidden="true" />
                    Original Headline · 英文原标题
                  </div>
                  <p lang="en" className="text-[15px] font-medium leading-snug text-slate-900 dark:text-zinc-100">
                    {currentArticle.original_title}
                  </p>
                  {currentArticle.original_excerpt &&
                    currentArticle.original_excerpt !== currentArticle.original_title && (
                      <p
                        lang="en"
                        className="mt-1.5 text-[13px] leading-relaxed text-slate-600 dark:text-zinc-400"
                      >
                        {currentArticle.original_excerpt}
                      </p>
                    )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Byline & Sydney Time */}
            <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-muted">
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                <time dateTime={currentArticle.published_at}>
                  悉尼时间 {formatSydneyTime(currentArticle.published_at)}（
                  {formatRelativeTime(currentArticle.published_at)}）
                </time>
              </span>
              {currentArticle.author && (
                <span className="inline-flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{currentArticle.author}</span>
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5 text-accent dark:text-emerald-300" aria-hidden="true" />
                <span>
                  {currentArticle.ai_translated ? 'Gemini AI 编译' : '英文原文待翻译'}
                </span>
              </span>
            </div>

            {/* Hero News Image (LCP candidate: fetchPriority="high", no loading="lazy", aspect-ratio prevents CLS) */}
            {currentArticle.image_url && !imgFailed && (
              <figure className="mt-5 overflow-hidden rounded-2xl border border-slate-200/70 bg-surface-subtle shadow-[0_12px_36px_rgba(0,0,0,0.08)] aspect-[16/9] dark:border-white/10 dark:border-t-white/20 dark:shadow-[0_16px_44px_rgba(0,0,0,0.5)]">
                <img
                  src={currentArticle.image_url}
                  alt={currentArticle.zh_title}
                  fetchPriority="high"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onError={() => setImgFailed(true)}
                  className="h-full w-full object-cover"
                />
              </figure>
            )}

            {/* AI Core Summary Card with Animated Gradient Border & Forced Dark Charcoal Glass Interior */}
            <div className="ai-summary-glow-frame mt-5 rounded-2xl p-[1px]">
              <section
                aria-label="核心速览与要点"
                className="relative overflow-hidden rounded-[15px] bg-[#14181f] px-4 py-4 text-zinc-100 shadow-[inset_0_1px_0_rgba(52,211,153,0.18),inset_0_0_32px_rgba(16,185,129,0.08)] sm:px-5"
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_90%_at_0%_0%,rgba(16,185,129,0.12),transparent_65%),radial-gradient(60%_80%_at_100%_100%,rgba(99,102,241,0.10),transparent_65%)]"
                />

                <div className="relative z-10">
                  <div className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-emerald-300">
                    <ListChecks className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>核心速览</span>
                    <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                      <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
                      AI 提炼
                    </span>
                  </div>

                  <p className="article-summary-scaled mt-2.5 font-medium text-zinc-100">
                    {currentArticle.zh_summary}
                  </p>

                  {keyPoints.length > 0 && (
                    <div className="mt-3.5 border-t border-white/10 pt-3">
                      <p className="mb-2.5 text-xs font-semibold text-zinc-400">
                        重点一看就懂（发生了什么 · 有何影响）
                      </p>
                      <ol className="space-y-2.5">
                        {keyPoints.map((point, idx) => (
                          <li key={idx} className="flex items-start gap-2.5">
                            <span
                              aria-hidden="true"
                              className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-300 text-xs font-bold text-slate-950 shadow-[0_0_10px_rgba(16,185,129,0.45)]"
                            >
                              {idx + 1}
                            </span>
                            <span className="article-keypoint-scaled break-words text-zinc-200">
                              {point}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* Full Chinese Translated Body */}
            <div className="article-body-scaled mt-6 space-y-5 text-ink-secondary">
              {paragraphs.map((para, idx) => (
                <p key={idx} className="break-words">
                  {para}
                </p>
              ))}
            </div>

            {/* Footer CTA */}
            <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 pt-5 pb-10 dark:border-white/10">
              <div className="text-xs text-ink-muted">
                来源：{currentArticle.source_name} · 自动去重归档
              </div>
              <a
                href={currentArticle.original_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200/80 bg-surface-subtle/80 px-4 py-2 text-sm font-medium text-ink transition-all hover:border-emerald-400/45 hover:text-accent active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:border-white/10 dark:border-t-white/15 dark:bg-zinc-900/70 dark:hover:text-emerald-300"
              >
                <span>前往 {currentArticle.source_name} 阅读完整原文</span>
                <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
              </a>
            </footer>
          </motion.article>
        </AnimatePresence>
      </div>
    </div>
  );
}
