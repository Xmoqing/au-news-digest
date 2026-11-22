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

export function getSourceBadgeClass(sourceId: SourceId): string {
  switch (sourceId) {
    case 'abc-au':
      return 'bg-blue-500/15 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300 border-blue-500/20';
    case 'abc-nsw':
      return 'bg-sky-500/15 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300 border-sky-500/20';
    case 'abc-business':
      return 'bg-amber-500/15 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300 border-amber-500/25';
    case 'guardian-au':
      return 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300 border-emerald-500/20';
    case 'guardian-au-biz':
      return 'bg-emerald-600/15 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200 border-emerald-500/25';
    case 'sbs-news':
      return 'bg-yellow-500/15 text-yellow-800 dark:bg-yellow-400/15 dark:text-yellow-300 border-yellow-500/25';
    case 'smh-sydney':
      return 'bg-slate-600/15 text-slate-800 dark:bg-slate-300/15 dark:text-slate-200 border-slate-500/25';
    case 'smh-business':
      return 'bg-zinc-600/15 text-zinc-800 dark:bg-amber-300/15 dark:text-amber-200 border-amber-400/25';
    case 'bbc-world':
      return 'bg-rose-500/15 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300 border-rose-500/20';
    case 'bbc-business':
      return 'bg-pink-500/15 text-pink-700 dark:bg-pink-400/15 dark:text-pink-300 border-pink-500/20';
    case 'guardian-world':
      return 'bg-teal-500/15 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300 border-teal-500/20';
    case 'aljazeera':
      return 'bg-orange-500/15 text-orange-700 dark:bg-orange-400/15 dark:text-orange-300 border-orange-500/20';
    case 'asx-smallcaps':
      return 'bg-amber-500/15 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300 border-amber-400/30';
    case 'cnbc-investing':
      return 'bg-indigo-500/15 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300 border-indigo-500/25';
    case 'cnbc-markets':
      return 'bg-blue-600/15 text-blue-700 dark:bg-blue-400/15 dark:text-blue-200 border-blue-500/25';
    case 'cnbc-top':
    case 'cnbc-finance':
      return 'bg-indigo-500/15 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300 border-indigo-500/25';
    case 'marketwatch-live':
    case 'marketwatch':
      return 'bg-green-600/15 text-green-800 dark:bg-green-400/15 dark:text-green-300 border-green-500/25';
    case 'seeking-alpha':
      return 'bg-orange-600/15 text-orange-800 dark:bg-orange-400/15 dark:text-orange-300 border-orange-500/25';
    case 'techcrunch':
      return 'bg-lime-500/15 text-lime-800 dark:bg-lime-400/15 dark:text-lime-300 border-lime-500/25';
    case 'npr-news':
      return 'bg-purple-500/15 text-purple-700 dark:bg-purple-400/15 dark:text-purple-300 border-purple-500/20';
    default:
      return 'bg-slate-500/15 text-slate-700 dark:bg-slate-400/15 dark:text-slate-300 border-slate-500/20';
  }
}

export function getCategoryPillClass(category: NewsCategory): string {
  switch (category) {
    case '澳洲要闻':
      return 'text-teal-700 dark:text-teal-300 bg-teal-500/15';
    case '国际热点':
      return 'text-rose-700 dark:text-rose-300 bg-rose-500/15';
    case '财经市场':
      return 'text-amber-700 dark:text-amber-300 bg-amber-500/15';
    case '科技前沿':
      return 'text-cyan-700 dark:text-cyan-300 bg-cyan-500/15';
    case '社会生活':
      return 'text-violet-700 dark:text-violet-300 bg-violet-500/15';
  }
}
