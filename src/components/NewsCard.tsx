'use client';

import { useState, type MouseEvent } from 'react';
import { motion } from 'framer-motion';
import { Clock, Layers, Sparkles } from 'lucide-react';
import {
  formatRelativeTime,
  getCategoryPillClass,
  getSourceBadgeClass,
} from '@/lib/format';
import type { NewsItem } from '@/types/news';

interface NewsCardProps {
  item: NewsItem;
  index: number;
  isSelected: boolean;
  onSelect: (item: NewsItem, triggerEl: HTMLAnchorElement) => void;
}

export function NewsCard({ item, index, isSelected, onSelect }: NewsCardProps) {
  const [imgFailed, setImgFailed] = useState(false);

  const related = item.related_articles ?? [];
  const hasCluster = related.length > 1;
  const uniqueSourcesCount = hasCluster
    ? new Set(related.map((a) => a.source_name)).size
    : 1;

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // Preserve native modifier clicks (Cmd/Ctrl/Shift/middle-click) for opening in new tab
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }
    e.preventDefault();
    onSelect(item, e.currentTarget);
  };

  const staggerDelay = Math.min(index, 12) * 0.03;

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.28,
        delay: staggerDelay,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="px-2.5 py-1.5"
    >
      <motion.div
        whileTap={{ scale: 0.985 }}
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        className={[
          'group relative overflow-hidden rounded-xl border transition-all duration-300',
          isSelected
            ? 'border-teal-500/30 bg-gradient-to-r from-emerald-500/15 via-teal-500/[0.06] to-white/95 shadow-[0_8px_30px_rgb(0,0,0,0.05)] dark:border-emerald-400/35 dark:border-t-emerald-300/45 dark:bg-gradient-to-r dark:from-emerald-500/[0.18] dark:via-teal-500/[0.07] dark:to-zinc-900/75 dark:shadow-[0_10px_30px_rgba(0,0,0,0.45),0_0_22px_rgba(16,185,129,0.14),inset_0_1px_0_rgba(52,211,153,0.2)]'
            : 'border-slate-200/60 bg-white/80 hover:-translate-y-[1.5px] hover:border-slate-300/80 hover:bg-white hover:shadow-[0_8px_30px_rgb(0,0,0,0.05)] dark:border-white/[0.06] dark:border-t-white/10 dark:bg-zinc-900/60 dark:backdrop-blur-md dark:hover:border-white/20 dark:hover:border-t-white/25 dark:hover:bg-zinc-800/75 dark:hover:shadow-[0_12px_32px_rgba(0,0,0,0.45),0_0_20px_rgba(16,185,129,0.08)]',
        ].join(' ')}
      >
        {/* Subtle hover spotlight sheen across card top edge */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_20%_0%,rgba(16,185,129,0.10),transparent_70%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        />

        {/* 3px Glowing left active indicator bar */}
        {isSelected && (
          <motion.span
            layoutId="active-news-accent-bar"
            transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.8 }}
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-gradient-to-b from-emerald-400 via-teal-400 to-cyan-400 shadow-[0_0_14px_rgba(16,185,129,0.85)]"
          />
        )}

        <a
          href={`/?article=${item.id}`}
          onClick={handleClick}
          aria-current={isSelected ? 'true' : undefined}
          className="relative z-10 block rounded-xl px-3.5 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              {/* Meta row: Source badge + Multi-media cluster badge + Category pill + Time */}
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs leading-none">
                <span
                  className={[
                    'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium',
                    getSourceBadgeClass(item.source_id),
                  ].join(' ')}
                >
                  {item.source_name}
                </span>

                {hasCluster && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/35 bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                    <Layers className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span>
                      {uniqueSourcesCount > 1
                        ? `综合 ${uniqueSourcesCount} 家媒体报道`
                        : `综合 ${related.length} 篇关联报道`}
                    </span>
                  </span>
                )}

                <span
                  className={[
                    'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium',
                    getCategoryPillClass(item.category),
                  ].join(' ')}
                >
                  {item.category}
                </span>

                {!item.ai_translated && (
                  <span className="inline-flex items-center gap-0.5 rounded-md bg-surface-subtle px-1.5 py-0.5 text-[11px] text-ink-muted">
                    <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
                    原文
                  </span>
                )}

                <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-ink-muted tabular-nums">
                  <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <time dateTime={item.published_at}>
                    {formatRelativeTime(item.published_at)}
                  </time>
                </span>
              </div>

              {/* Scalable Chinese Headline */}
              <h2
                className={[
                  'card-title-scaled line-clamp-3 break-words font-semibold tracking-tight transition-colors duration-200',
                  isSelected
                    ? 'text-accent dark:text-emerald-300'
                    : 'text-ink group-hover:text-accent dark:group-hover:text-emerald-300',
                ].join(' ')}
              >
                {item.zh_title}
              </h2>

              {/* Scalable 60-char core summary */}
              <p className="card-summary-scaled mt-1.5 line-clamp-3 break-words text-ink-secondary">
                {item.zh_summary}
              </p>
            </div>

            {/* Compact 4:3 thumbnail with reserved aspect-ratio to prevent CLS */}
            {item.image_url && !imgFailed && (
              <div className="mt-0.5 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200/70 bg-surface-subtle aspect-[4/3] dark:border-white/10 sm:w-24">
                <img
                  src={item.image_url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onError={() => setImgFailed(true)}
                  className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.05]"
                />
              </div>
            )}
          </div>
        </a>
      </motion.div>
    </motion.article>
  );
}
