import { getMeta, setMeta } from '@/lib/db';
import type { FxRateInfo } from '@/types/news';

const FX_META_KEY = 'fx_aud_cny_cache';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

declare global {
  // eslint-disable-next-line no-var
  var __auNewsFxCache: { data: FxRateInfo; fetchedAtMs: number } | undefined;
  // eslint-disable-next-line no-var
  var __auNewsFxInflight: Promise<FxRateInfo | null> | undefined;
}

async function fetchWithTimeout(url: string, timeoutMs = 7000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFromFrankfurter(): Promise<FxRateInfo | null> {
  const res = await fetchWithTimeout(
    'https://api.frankfurter.app/latest?from=AUD&to=CNY',
    6500
  );
  if (!res.ok) return null;

  const json = (await res.json()) as {
    rates?: { CNY?: number };
    date?: string;
  };
  const rate = json?.rates?.CNY;
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
    return null;
  }

  return {
    pair: 'AUD/CNY',
    rate: Number(rate.toFixed(4)),
    inverseRate: Number((1 / rate).toFixed(4)),
    change: null,
    changePercent: null,
    updatedAt: json.date
      ? new Date(`${json.date}T00:00:00Z`).toISOString()
      : new Date().toISOString(),
    source: 'Frankfurter (ECB)',
  };
}

async function fetchFromExchangeRateApi(): Promise<FxRateInfo | null> {
  const res = await fetchWithTimeout('https://open.er-api.com/v6/latest/AUD', 6500);
  if (!res.ok) return null;

  const json = (await res.json()) as {
    result?: string;
    rates?: { CNY?: number };
    time_last_update_unix?: number;
  };

  const rate = json?.rates?.CNY;
  if (
    json?.result !== 'success' ||
    typeof rate !== 'number' ||
    !Number.isFinite(rate) ||
    rate <= 0
  ) {
    return null;
  }

  const updatedAt =
    typeof json.time_last_update_unix === 'number' && json.time_last_update_unix > 0
      ? new Date(json.time_last_update_unix * 1000).toISOString()
      : new Date().toISOString();

  return {
    pair: 'AUD/CNY',
    rate: Number(rate.toFixed(4)),
    inverseRate: Number((1 / rate).toFixed(4)),
    change: null,
    changePercent: null,
    updatedAt,
    source: 'ExchangeRate-API',
  };
}

async function loadPersistedFx(): Promise<FxRateInfo | null> {
  try {
    const raw = await getMeta(FX_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FxRateInfo;
    if (typeof parsed?.rate === 'number' && parsed.rate > 0) {
      return parsed;
    }
  } catch {
    // ignore corrupted cache
  }
  return null;
}

async function fetchLiveFxRate(): Promise<FxRateInfo | null> {
  // Primary: Frankfurter (ECB) -> Backup: ExchangeRate-API
  const providers: Array<() => Promise<FxRateInfo | null>> = [
    fetchFromFrankfurter,
    fetchFromExchangeRateApi,
  ];

  for (const provider of providers) {
    try {
      const result = await provider();
      if (result) {
        globalThis.__auNewsFxCache = {
          data: result,
          fetchedAtMs: Date.now(),
        };
        await setMeta(FX_META_KEY, JSON.stringify(result)).catch(() => { });
        return result;
      }
    } catch {
      // try next provider
    }
  }

  return globalThis.__auNewsFxCache?.data ?? (await loadPersistedFx());
}

export async function getAudCnyRate(forceRefresh = false): Promise<FxRateInfo | null> {
  const cached = globalThis.__auNewsFxCache;
  if (!forceRefresh && cached && Date.now() - cached.fetchedAtMs < CACHE_TTL_MS) {
    return cached.data;
  }

  if (globalThis.__auNewsFxInflight) {
    return globalThis.__auNewsFxInflight;
  }

  globalThis.__auNewsFxInflight = fetchLiveFxRate().finally(() => {
    globalThis.__auNewsFxInflight = undefined;
  });

  return globalThis.__auNewsFxInflight;
}

