import cron from 'node-cron';
import { getTotalArticleCount } from '@/lib/db';
import { refreshNews } from '@/lib/ingest';

declare global {
  // eslint-disable-next-line no-var
  var __auNewsCronInitialized: boolean | undefined;
}

export function getCronSchedule(): string {
  const configured = process.env.CRON_SCHEDULE?.trim();
  if (configured && cron.validate(configured)) {
    return configured;
  }
  return '0 */2 * * *';
}

export function initNewsScheduler(): void {
  if (globalThis.__auNewsCronInitialized) {
    return;
  }
  globalThis.__auNewsCronInitialized = true;

  const schedule = getCronSchedule();
  const timezone = process.env.TZ || 'Australia/Sydney';

  cron.schedule(
    schedule,
    () => {
      console.log(`[Cron] Triggered scheduled refresh (${schedule}, ${timezone})`);
      void refreshNews('cron');
    },
    { timezone }
  );

  console.log(`[Cron] AU News Digest scheduler active: "${schedule}" (${timezone})`);

  // Auto-populate once on fresh database startup (non-blocking)
  if (process.env.DISABLE_STARTUP_SYNC !== 'true') {
    setTimeout(async () => {
      try {
        const count = await getTotalArticleCount();
        if (count === 0) {
          console.log('[Cron] Empty database detected on startup — triggering initial RSS sync...');
          await refreshNews('startup');
        }
      } catch (err) {
        console.error('[Cron] Startup sync check failed:', err);
      }
    }, 1500);
  }
}
