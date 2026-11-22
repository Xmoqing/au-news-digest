import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import type { RssSource, SourceId } from '@/types/news';

export interface ParsedFeedItem {
  original_url: string;
  source_id: SourceId;
  source_name: string;
  region: 'au' | 'global';
  original_title: string;
  original_excerpt: string;
  rss_categories: string[];
  image_url: string | null;
  author: string | null;
  published_at: string;
}

interface CustomRssItem {
  title?: string;
  link?: string;
  guid?: string;
  pubDate?: string;
  isoDate?: string;
  creator?: string;
  author?: string;
  content?: string;
  contentSnippet?: string;
  description?: string;
  categories?: Array<string | { _: string }>;
  enclosure?: { url?: string; type?: string };
  mediaGroup?: {
    'media:content'?: Array<{ $?: { url?: string; width?: string; medium?: string } }>;
  };
  mediaContent?:
    | { $?: { url?: string; width?: string; medium?: string } }
    | Array<{ $?: { url?: string; width?: string; medium?: string } }>;
  mediaThumbnail?:
    | { $?: { url?: string; width?: string } }
    | Array<{ $?: { url?: string; width?: string } }>;
  contentEncoded?: string;
}

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const rssParser = new Parser<Record<string, unknown>, CustomRssItem>({
  timeout: 12000,
  headers: {
    'User-Agent': USER_AGENT,
    Accept: 'application/rss+xml, application/xml, text/xml, */*',
  },
  customFields: {
    item: [
      ['media:group', 'mediaGroup'],
      ['media:content', 'mediaContent'],
      ['media:thumbnail', 'mediaThumbnail'],
      ['content:encoded', 'contentEncoded'],
      ['dc:creator', 'creator'],
    ],
  },
});

export function normalizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.trim());
    parsed.hash = '';
    const dropPrefixes = ['utm_', 'fbclid', 'gclid', 'ref', 'CMP', 'at_medium', 'at_campaign'];
    for (const key of [...parsed.searchParams.keys()]) {
      if (dropPrefixes.some((p) => key.startsWith(p))) {
        parsed.searchParams.delete(key);
      }
    }
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return rawUrl.trim();
  }
}

function stripHtml(html: string): string {
  if (!html) return '';
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();
  return $.text().replace(/\s+/g, ' ').trim();
}

function upgradeImageResolution(url: string | null): string | null {
  if (!url) return null;
  // Upgrade BBC 240px RSS thumbnail to crisp 800px wide image for unfolded screens
  if (url.includes('ichef.bbci.co.uk/ace/standard/240/')) {
    return url.replace('/ace/standard/240/', '/ace/standard/800/');
  }
  return url;
}

function extractImageFromItem(item: CustomRssItem): string | null {
  // 1. ABC News media:group -> pick widest landscape image
  const groupContents = item.mediaGroup?.['media:content'];
  if (Array.isArray(groupContents) && groupContents.length > 0) {
    const images = groupContents
      .map((entry) => ({
        url: entry?.$?.url,
        width: Number(entry?.$?.width ?? 0),
        medium: entry?.$?.medium,
      }))
      .filter((img) => img.url && (!img.medium || img.medium === 'image'));

    if (images.length > 0) {
      images.sort((a, b) => b.width - a.width);
      return upgradeImageResolution(images[0].url ?? null);
    }
  }

  // 2. media:content (Guardian / SBS / Al Jazeera)
  const mediaContent = item.mediaContent;
  if (Array.isArray(mediaContent) && mediaContent.length > 0) {
    const images = mediaContent
      .map((entry) => ({
        url: entry?.$?.url,
        width: Number(entry?.$?.width ?? 0),
      }))
      .filter((img) => img.url);
    if (images.length > 0) {
      images.sort((a, b) => b.width - a.width);
      return upgradeImageResolution(images[0].url ?? null);
    }
  } else if (mediaContent && !Array.isArray(mediaContent) && mediaContent.$?.url) {
    return upgradeImageResolution(mediaContent.$.url);
  }

  // 3. media:thumbnail (BBC World News)
  const mediaThumb = item.mediaThumbnail;
  if (Array.isArray(mediaThumb) && mediaThumb.length > 0) {
    const images = mediaThumb
      .map((entry) => ({
        url: entry?.$?.url,
        width: Number(entry?.$?.width ?? 0),
      }))
      .filter((img) => img.url);
    if (images.length > 0) {
      images.sort((a, b) => b.width - a.width);
      return upgradeImageResolution(images[0].url ?? null);
    }
  } else if (mediaThumb && !Array.isArray(mediaThumb) && mediaThumb.$?.url) {
    return upgradeImageResolution(mediaThumb.$.url);
  }

  // 4. enclosure (SBS / Al Jazeera)
  if (item.enclosure?.url && (!item.enclosure.type || item.enclosure.type.startsWith('image/'))) {
    return upgradeImageResolution(item.enclosure.url);
  }

  // 5. Embedded <img> inside HTML content/description
  const htmlSource = item.contentEncoded || item.content || item.description || '';
  if (htmlSource.includes('<img')) {
    const $ = cheerio.load(htmlSource);
    const src = $('img').first().attr('src');
    if (src && src.startsWith('http')) {
      return upgradeImageResolution(src);
    }
  }

  return null;
}

function extractCategories(item: CustomRssItem): string[] {
  if (!Array.isArray(item.categories)) return [];
  return item.categories
    .map((c) => (typeof c === 'string' ? c : c?._ ?? ''))
    .map((s) => s.trim())
    .filter(Boolean);
}

function parsePublishedDate(item: CustomRssItem): string {
  const raw = item.isoDate || item.pubDate;
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString();
    }
  }
  return new Date().toISOString();
}

export async function fetchRssSource(source: RssSource, maxItems: number): Promise<ParsedFeedItem[]> {
  const feed = await rssParser.parseURL(source.url);
  const parsedItems: ParsedFeedItem[] = [];
  const seenUrls = new Set<string>();
  const staleCutoffMs = Date.now() - 14 * 24 * 60 * 60 * 1000; // Ignore pinned/archived items older than 14 days

  for (const rawItem of feed.items ?? []) {
    const rawLink = rawItem.link || rawItem.guid;
    const title = rawItem.title?.trim();
    if (!rawLink || !title || !rawLink.startsWith('http')) continue;

    const cleanUrl = normalizeUrl(rawLink);
    if (seenUrls.has(cleanUrl)) continue;
    seenUrls.add(cleanUrl);

    const publishedIso = parsePublishedDate(rawItem);
    const publishedMs = new Date(publishedIso).getTime();
    if (Number.isFinite(publishedMs) && publishedMs < staleCutoffMs) {
      continue;
    }

    const rawHtml = rawItem.contentEncoded || rawItem.content || rawItem.description || '';
    const excerpt = (rawItem.contentSnippet?.trim() || stripHtml(rawHtml))
      .replace(/Continue reading\.\.\.?$/i, '')
      .trim();

    parsedItems.push({
      original_url: cleanUrl,
      source_id: source.id,
      source_name: source.shortName,
      region: source.region,
      original_title: title,
      original_excerpt: excerpt,
      rss_categories: extractCategories(rawItem),
      image_url: extractImageFromItem(rawItem),
      author: rawItem.creator?.trim() || rawItem.author?.trim() || null,
      published_at: publishedIso,
    });
  }

  // Sort strictly by published_at DESC BEFORE slicing so editor-curated feeds (Guardian / BBC / CNBC) always deliver the newest breaking news
  parsedItems.sort((a, b) => b.published_at.localeCompare(a.published_at));

  return parsedItems.slice(0, maxItems);
}

function extractJsonLdArticleBody($: cheerio.CheerioAPI): string | null {
  const scripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < scripts.length; i++) {
    const text = $(scripts[i]).html();
    if (!text) continue;
    try {
      const parsed = JSON.parse(text);
      const candidates = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.['@graph'])
          ? parsed['@graph']
          : [parsed];
      for (const node of candidates) {
        if (typeof node?.articleBody === 'string' && node.articleBody.trim().length > 180) {
          return node.articleBody.trim();
        }
      }
    } catch {
      // ignore malformed JSON-LD blocks
    }
  }
  return null;
}

export async function fetchArticleFullText(
  url: string,
  fallbackExcerpt: string
): Promise<{ content: string; imageUrl: string | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-AU,en;q=0.9',
      },
    });

    if (!response.ok) {
      return { content: fallbackExcerpt, imageUrl: null };
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const ogImage =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      null;

    const ldBody = extractJsonLdArticleBody($);

    $(
      'script, style, noscript, nav, header, footer, aside, form, figure figcaption, [role="navigation"], [aria-hidden="true"], .ad, .advertisement'
    ).remove();

    const selectors = [
      'article [data-component="text-block"] p',
      'div[data-gu-name="body"] p',
      '.ArticleBody-articleBody p',
      'article .wysiwyg p',
      'article .article-body-commercial-selector p',
      'article p',
      'main p',
    ];

    let paragraphs: string[] = [];
    for (const sel of selectors) {
      const found = $(sel)
        .map((_, el) => $(el).text().replace(/\s+/g, ' ').trim())
        .get()
        .filter(
          (text) =>
            text.length >= 35 &&
            !/^(Sign up|Subscribe|Follow|Download the|Listen to|Read more|Share|Copyright|ABC News|SBS News|BBC News|CNBC|Al Jazeera)/i.test(
              text
            )
        );
      if (found.length >= 3) {
        paragraphs = found;
        break;
      }
    }

    const uniqueParagraphs = Array.from(new Set(paragraphs));
    const extractedFromDom = uniqueParagraphs.join('\n\n');

    let bestContent = fallbackExcerpt;
    if (extractedFromDom.length >= 220) {
      bestContent = extractedFromDom;
    } else if (ldBody && ldBody.length >= 180) {
      bestContent = ldBody;
    } else if (extractedFromDom.length > fallbackExcerpt.length) {
      bestContent = extractedFromDom;
    }

    if (bestContent.length > 4800) {
      bestContent = `${bestContent.slice(0, 4800).trim()}...`;
    }

    return {
      content: bestContent || fallbackExcerpt,
      imageUrl: ogImage && ogImage.startsWith('http') ? upgradeImageResolution(ogImage) : null,
    };
  } catch {
    return { content: fallbackExcerpt, imageUrl: null };
  } finally {
    clearTimeout(timeout);
  }
}
