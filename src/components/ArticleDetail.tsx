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
  initialSubArticleId?: number | null;
  showEnglishOriginal: boolean;
  onToggleEnglishOriginal: () => void;
  showBackButton?: boolean;
  onBack?: () => void;
  backButtonRef?: RefObject<HTMLButtonElement | null>;
  scrollContainerRef?: RefObject<HTMLElement | null>;
  onNotify?: (text: string, type?: 'success' | 'error') => void;
}

async function copyTextWithFallback(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback to execCommand below (e.g. non-HTTPS LAN or restricted WebViews like WeChat)
    }
  }
  if (typeof document !== 'undefined') {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
      document.body.appendChild(textarea);
      textarea.select();
      textarea.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      textarea.remove();
      return ok;
    } catch {
      return false;
    }
  }
  return false;
}

export function ArticleDetail({
  article,
  initialSubArticleId = null,
  showEnglishOriginal,
  onToggleEnglishOriginal,
  showBackButton = false,
  onBack,
  backButtonRef,
  scrollContainerRef,
  onNotify,
}: ArticleDetailProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [imgFailed, setImgFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const sourceTabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Smooth Apple-damped spring reading progress bar tied to the reading pane scroller
  const rawProgress = useMotionValue(0);
  const smoothProgress = useSpring(rawProgress, {
    stiffness: 420,
    damping: 36,
    mass: 0.8,
    restDelta: 0.001,
  });

  const clusterMembers = useMemo(() => {
    if (!article) return [];
    if (article.related_articles && article.related_articles.length > 1) {
      return article.related_articles;
    }
    return [article];
  }, [article]);

  // Reset selected source tab (or jump directly to deep-linked child article tab) when topic changes
  useEffect(() => {
    if (initialSubArticleId && clusterMembers.length > 1) {
      const matchedIdx = clusterMembers.findIndex((m) => m.id === initialSubArticleId);
      setActiveIndex(matchedIdx >= 0 ? matchedIdx : 0);
    } else {
      setActiveIndex(0);
    }
    setImgFailed(false);
    setCopied(false);
    rawProgress.set(0);
  }, [article?.id, initialSubArticleId, clusterMembers, rawProgress]);

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
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-black/[0.05] text-[#86868B] dark:bg-[#1C1C1E]">
          <Newspaper className="h-7 w-7" aria-hidden="true" />
        </div>
        <p className="text-base font-semibold tracking-tight text-[#1D1D1F] dark:text-[#F5F5F7]">
          选择左侧新闻查看全文编译
        </p>
        <p className="mt-1.5 max-w-xs text-sm text-[#86868B]">
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
    const shareUrl = `${window.location.origin}/?article=${currentArticle.id}`;

    // 1. Prefer native Web Share API with our own site's deep link (not external media URL)
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: currentArticle.zh_title,
          text: currentArticle.zh_summary,
          url: shareUrl,
        });
        return;
      } catch (err) {
        // User intentionally dismissed the OS share sheet — ignore silently
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        // Other errors (e.g. WeChat WebView or unsupported context) fall through to clipboard copy
      }
    }

    // 2. Fallback: copy "【中文标题】\n深层链接" to clipboard and show friendly Toast
    const shareText = `【${currentArticle.zh_title}】\n${shareUrl}`;
    const ok = await copyTextWithFallback(shareText);
    if (ok) {
      setCopied(true);
      onNotify?.('已复制文章链接，可直接粘贴发送', 'success');
      setTimeout(() => setCopied(false), 2000);
    } else {
      onNotify?.('复制失败，请手动复制浏览器地址栏链接', 'error');
    }
  };

  return (
    <div className="flex min-h-full flex-col bg-transparent">
      {/* Top sticky macOS vibrancy action bar + hairline divider + subtle Apple Blue progress */}
      <div className="sticky top-0 z-30 border-b border-black/[0.08] bg-[#F5F5F7]/80 backdrop-blur-2xl saturate-150 dark:border-white/[0.08] dark:bg-[#161617]/80">
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            {showBackButton && onBack ? (
              <button
                ref={backButtonRef}
                type="button"
                onClick={onBack}
                aria-label="返回新闻列表"
                className="inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 text-sm font-medium text-[#007AFF] transition-colors hover:bg-black/[0.05] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF] dark:text-[#0A84FF] dark:hover:bg-white/[0.08]"
              >
                <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>返回</span>
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={[
                    'inline-flex items-center rounded-full px-2.5 py-0.5 font-medium',
                    getSourceBadgeClass(currentArticle.source_id),
                  ].join(' ')}
                >
                  {currentArticle.source_name}
                </span>
                <span
                  className={[
                    'inline-flex items-center font-medium',
                    getCategoryPillClass(currentArticle.category),
                  ].join(' ')}
                >
                  · {currentArticle.category}
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
                'inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]',
                showEnglishOriginal
                  ? 'bg-[#007AFF]/15 text-[#007AFF] dark:bg-[#0A84FF]/20 dark:text-[#409CFF]'
                  : 'bg-black/[0.05] text-[#1D1D1F] hover:bg-black/[0.10] dark:bg-white/[0.08] dark:text-[#E5E5EA] dark:hover:bg-white/[0.14]',
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
              className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-full bg-black/[0.05] text-[#1D1D1F] transition-colors hover:bg-black/[0.10] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF] dark:bg-white/[0.08] dark:text-[#E5E5EA] dark:hover:bg-white/[0.14]"
            >
              {copied ? (
                <Check className="h-4 w-4 text-[#007AFF] dark:text-[#0A84FF]" aria-hidden="true" />
              ) : (
                <Share2 className="h-4 w-4" aria-hidden="true" />
              )}
            </button>

            {/* External original link button (Primary Apple Blue Pill) */}
            <a
              href={currentArticle.original_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[#007AFF] px-3.5 text-xs font-semibold text-white transition-colors hover:bg-[#0071E3] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#161617] dark:bg-[#0A84FF] dark:hover:bg-[#409CFF]"
            >
              <span>访问原文</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            </a>
          </div>
        </div>

        {/* Crisp 2px Apple Blue reading progress hairline along bottom edge */}
        <div className="relative h-0 w-full">
          <motion.div
            aria-hidden="true"
            style={{ scaleX: smoothProgress, transformOrigin: '0% 50%' }}
            className="absolute inset-x-0 -bottom-px h-[2px] bg-[#007AFF] dark:bg-[#0A84FF]"
          />
        </div>
      </div>

      {/* Article reading body with restrained Apple spring transition */}
      <div className="mx-auto w-full max-w-[70ch] flex-1 overflow-x-clip px-4 py-6 sm:px-6 md:px-8 md:py-8">
        {/* Multi-perspective Media Source Switcher Tabs */}
        {hasMultipleSources && (
          <div className="mb-5 rounded-2xl bg-white p-3 ring-1 ring-black/[0.06] dark:bg-[#1C1C1E] dark:ring-1 dark:ring-white/[0.08]">
            <div className="mb-2 flex items-center gap-1.5 px-1 text-xs font-medium text-[#007AFF] dark:text-[#409CFF]">
              <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="tabular-nums">
                {uniqueSourceCount > 1
                  ? `综合 ${uniqueSourceCount} 家媒体报道（共 ${clusterMembers.length} 篇）· 点击切换视角`
                  : `综合 ${clusterMembers.length} 篇关联报道 · 点击切换`}
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
                    className="category-tab relative z-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0A84FF]"
                  >
                    {selected && (
                      <motion.span
                        layoutId={`source-active-pill-${article.id}`}
                        transition={{ type: 'spring', stiffness: 420, damping: 36, mass: 0.8 }}
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-[#F2F2F7] ring-1 ring-black/[0.05] dark:bg-[#2C2C2E] dark:ring-1 dark:ring-white/[0.12]"
                      />
                    )}
                    <span className={selected ? 'font-semibold text-[#1D1D1F] dark:text-[#F5F5F7]' : ''}>
                      {member.source_name}
                    </span>
                    <span className="text-[10px] font-normal text-[#86868B] tabular-nums">
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
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ type: 'spring', stiffness: 420, damping: 36, mass: 0.8 }}
          >
            {/* Mobile source/category row */}
            {showBackButton && (
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={[
                    'inline-flex items-center rounded-full px-2.5 py-0.5 font-medium',
                    getSourceBadgeClass(currentArticle.source_id),
                  ].join(' ')}
                >
                  {currentArticle.source_name}
                </span>
                <span
                  className={[
                    'inline-flex items-center font-medium',
                    getCategoryPillClass(currentArticle.category),
                  ].join(' ')}
                >
                  · {currentArticle.category}
                </span>
              </div>
            )}

            {/* Scalable Apple Editorial Headline */}
            <h1 className="article-headline break-words font-semibold tracking-tight text-[#1D1D1F] dark:text-[#F5F5F7]">
              {currentArticle.zh_title}
            </h1>

            {/* English original title & excerpt comparison panel */}
            <AnimatePresence initial={false}>
              {showEnglishOriginal && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 36, mass: 0.8 }}
                  className="mt-3.5 rounded-2xl border border-black/[0.06] bg-white px-4 py-3.5 text-[#1D1D1F] dark:border-white/[0.08] dark:bg-[#1C1C1E] dark:text-[#F5F5F7]"
                >
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#86868B]">
                    <Languages className="h-3.5 w-3.5 text-[#007AFF] dark:text-[#0A84FF]" aria-hidden="true" />
                    Original Headline · 英文原标题
                  </div>
                  <p lang="en" className="text-[15px] font-medium leading-snug text-[#1D1D1F] dark:text-[#F5F5F7]">
                    {currentArticle.original_title}
                  </p>
                  {currentArticle.original_excerpt &&
                    currentArticle.original_excerpt !== currentArticle.original_title && (
                      <p
                        lang="en"
                        className="mt-1.5 text-[13px] leading-relaxed text-[#6E6E73] dark:text-[#86868B]"
                      >
                        {currentArticle.original_excerpt}
                      </p>
                    )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Byline & Sydney Time */}
            <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[#86868B]">
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
                <Sparkles className="h-3.5 w-3.5 text-[#007AFF] dark:text-[#0A84FF]" aria-hidden="true" />
                <span>
                  {currentArticle.ai_translated ? 'Gemini AI 编译' : '英文原文待翻译'}
                </span>
              </span>
            </div>

            {/* Hero News Image (LCP candidate: fetchPriority="high", aspect-ratio prevents CLS) */}
            {currentArticle.image_url && !imgFailed && (
              <figure className="mt-5 overflow-hidden rounded-2xl border border-black/[0.06] bg-black/[0.04] aspect-[16/9] dark:border-white/[0.08] dark:bg-[#1C1C1E]">
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

            {/* Apple Editorial AI Core Summary Card (System Gray 6 Dark, crisp hairline, no neon glow) */}
            <section
              aria-label="核心速览与要点"
              className="mt-5 rounded-2xl border border-black/[0.06] bg-white px-5 py-4 sm:py-5 dark:border-white/[0.08] dark:bg-[#1C1C1E]"
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-[#007AFF] dark:text-[#0A84FF]">
                <ListChecks className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>核心速览</span>
                <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-black/[0.05] px-2.5 py-0.5 text-[10px] font-medium text-[#86868B] dark:bg-white/[0.08] dark:text-[#AEAEB2]">
                  <Sparkles className="h-2.5 w-2.5 text-[#007AFF] dark:text-[#0A84FF]" aria-hidden="true" />
                  AI 提炼
                </span>
              </div>

              <p className="article-summary-scaled mt-2.5 font-medium text-[#1D1D1F] dark:text-[#F5F5F7]">
                {currentArticle.zh_summary}
              </p>

              {keyPoints.length > 0 && (
                <div className="mt-3.5 border-t border-black/[0.06] pt-3.5 dark:border-white/[0.08]">
                  <p className="mb-2.5 text-xs font-medium text-[#86868B]">
                    重点一看就懂（发生了什么 · 有何影响）
                  </p>
                  <ol className="space-y-2.5">
                    {keyPoints.map((point, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <span
                          aria-hidden="true"
                          className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#007AFF] text-[11px] font-semibold text-white tabular-nums dark:bg-[#0A84FF]"
                        >
                          {idx + 1}
                        </span>
                        <span className="article-keypoint-scaled break-words text-[#3A3A3C] dark:text-[#E5E5EA]">
                          {point}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </section>

            {/* Full Chinese Translated Body (Soft Apple White + Comfortable 1.75 Line Height) */}
            <div className="article-body-scaled mt-6 space-y-5 leading-[1.75] text-[#1D1D1F] dark:text-[#F5F5F7]">
              {paragraphs.map((para, idx) => (
                <p key={idx} className="break-words">
                  {para}
                </p>
              ))}
            </div>

            {/* Footer CTA */}
            <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.08] pt-5 pb-10 dark:border-white/[0.08]">
              <div className="text-xs text-[#86868B]">
                来源：{currentArticle.source_name} · 自动去重归档
              </div>
              <a
                href={currentArticle.original_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-black/[0.08] bg-white px-4 py-2 text-sm font-medium text-[#1D1D1F] transition-colors hover:bg-[#F2F2F7] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF] dark:border-white/[0.10] dark:bg-[#1C1C1E] dark:text-[#F5F5F7] dark:hover:bg-[#2C2C2E]"
              >
                <span>前往 {currentArticle.source_name} 阅读完整原文</span>
                <ExternalLink className="h-4 w-4 shrink-0 text-[#86868B]" aria-hidden="true" />
              </a>
            </footer>
          </motion.article>
        </AnimatePresence>
      </div>
    </div>
  );
}
