import type { NewsCategory, SourceId } from '@/types/news';

const SYDNEY_TZ = 'Australia/Sydney';

export function formatSydneyTime(iso: string | null): string {
  if (!iso) return '尚未同步';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '未知时间';

  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: SYDNEY_TZ,
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatSydneyClock(iso: string | null): string {
  if (!iso) return '--:--';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--:--';

  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: SYDNEY_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return '尚未同步';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '未知时间';

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟前`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}小时前`;

  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}天前`;

  return formatSydneyTime(iso);
}

/**
 * Apple Native Minimalist Source Capsule:
 * Unified restrained frosted neutral pill with crisp legibility in both Light and Dark Mode.
 */
export function getSourceBadgeClass(_sourceId?: SourceId): string {
  return 'bg-black/[0.06] text-[#1D1D1F] dark:bg-white/[0.08] dark:text-[#E5E5EA]';
}

/**
 * Apple Native Lightweight Category Label:
 * Pure secondary gray text (rendered as "· 分类名") for calm editorial hierarchy.
 */
export function getCategoryPillClass(_category?: NewsCategory): string {
  return 'text-[#86868B]';
}
