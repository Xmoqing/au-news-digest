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
      data-article-id={item.id}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: 'spring',
        stiffness: 420,
        damping: 36,
        mass: 0.8,
        delay: staggerDelay,
      }}
      className="px-3 py-1.5"
    >
      <motion.div
        whileTap={{ scale: 0.985 }}
        transition={{ type: 'spring', stiffness: 420, damping: 36, mass: 0.8 }}
        className={[
          'group relative overflow-hidden rounded-2xl transition-colors duration-200',
          isSelected
            ? 'bg-[#007AFF]/[0.08] ring-1 ring-[#007AFF]/30 dark:bg-white/[0.10] dark:ring-1 dark:ring-white/15'
            : 'bg-white ring-1 ring-black/[0.05] hover:bg-[#F2F2F7] dark:bg-[#1C1C1E] dark:ring-1 dark:ring-white/[0.06] dark:hover:bg-[#2C2C2E]',
        ].join(' ')}
      >
        <a
          href={`/?article=${item.id}`}
          onClick={handleClick}
          aria-current={isSelected ? 'true' : undefined}
          className="relative z-10 block rounded-2xl px-4 py-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0A84FF]"
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              {/* Meta row: Minimalist Apple source capsule + lightweight · category + optional cluster + tabular time */}
              <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs leading-none">
                <span
                  className={[
                    'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
                    getSourceBadgeClass(item.source_id),
                  ].join(' ')}
                >
                  {item.source_name}
                </span>

                <span
                  className={[
                    'inline-flex items-center text-[11px] font-medium',
                    getCategoryPillClass(item.category),
                  ].join(' ')}
                >
                  · {item.category}
                </span>

                {hasCluster && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#007AFF]/10 px-2 py-0.5 text-[11px] font-medium text-[#007AFF] dark:bg-[#0A84FF]/15 dark:text-[#409CFF]">
                    <Layers className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="tabular-nums">
                      {uniqueSourcesCount > 1
                        ? `综合 ${uniqueSourcesCount} 家媒体`
                        : `综合 ${related.length} 篇`}
                    </span>
                  </span>
                )}

                {!item.ai_translated && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] text-[#86868B] dark:bg-white/[0.08]">
                    <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
                    原文
                  </span>
                )}

                <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-[#86868B] tabular-nums">
                  <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <time dateTime={item.published_at}>
                    {formatRelativeTime(item.published_at)}
                  </time>
                </span>
              </div>

              {/* Scalable Chinese Headline */}
              <h2 className="card-title-scaled line-clamp-3 break-words font-semibold tracking-tight text-[#1D1D1F] dark:text-[#F5F5F7]">
                {item.zh_title}
              </h2>

              {/* Scalable 60-char core summary */}
              <p className="card-summary-scaled mt-1.5 line-clamp-3 break-words text-[#6E6E73] dark:text-[#AEAEB2]">
                {item.zh_summary}
              </p>
            </div>

            {/* Compact 4:3 thumbnail with reserved aspect-ratio to prevent CLS */}
            {item.image_url && !imgFailed && (
              <div className="mt-0.5 w-20 shrink-0 overflow-hidden rounded-xl border border-black/[0.06] bg-black/[0.04] aspect-[4/3] dark:border-white/[0.08] dark:bg-white/[0.05] sm:w-24">
                <img
                  src={item.image_url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onError={() => setImgFailed(true)}
                  className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                />
              </div>
            )}
          </div>
        </a>
      </motion.div>
    </motion.article>
  );
}
