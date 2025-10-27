/**
 * Link Extraction and Following for Rating Announcements
 *
 * Extracts PDF links and "Read More" links from search result pages
 * to find full rating announcement content.
 */

import * as cheerio from 'cheerio';
import { jlog } from '@/lib/log';

export interface ExtractedLink {
  url: string;
  type: 'pdf' | 'article';
  text: string;
  priority: number; // 1=high, 2=medium, 3=low
}

/**
 * Extract PDF and article links from HTML
 * Priority based on link text/context
 */
export function extractLinks(html: string, baseUrl: string): ExtractedLink[] {
  const $ = cheerio.load(html);
  const links: ExtractedLink[] = [];
  const seenUrls = new Set<string>();

  // Extract all links
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;

    // Resolve relative URLs
    const absoluteUrl = resolveUrl(href, baseUrl);
    if (!absoluteUrl || seenUrls.has(absoluteUrl)) return;
    seenUrls.add(absoluteUrl);

    const linkText = $(el).text().trim().toLowerCase();
    const isPdf = /\.pdf($|\?)/i.test(absoluteUrl);

    // Skip unwanted links
    if (/login|subscribe|paywall|methodology|glossary/i.test(absoluteUrl)) return;

    if (isPdf) {
      // PDF links - high priority if text suggests rating content
      const priority =
        /rating|outlook|credit|affirm|assign|upgrade|downgrade/i.test(linkText) ? 1 : 2;

      links.push({
        url: absoluteUrl,
        type: 'pdf',
        text: linkText,
        priority
      });
    } else {
      // Article links - prioritize based on text
      const isReadMore = /read more|full story|view|details|press release/i.test(linkText);
      const isRatingRelated = /rating|outlook|credit|affirm|assign/i.test(linkText);

      if (isReadMore || isRatingRelated) {
        const priority = isRatingRelated ? 1 : 2;
        links.push({
          url: absoluteUrl,
          type: 'article',
          text: linkText,
          priority
        });
      }
    }
  });

  // Sort by priority
  links.sort((a, b) => a.priority - b.priority);

  jlog({
    component: 'link-extractor',
    outcome: 'success',
    meta: {
      base_url: baseUrl,
      links_found: links.length,
      pdfs: links.filter(l => l.type === 'pdf').length,
      articles: links.filter(l => l.type === 'article').length
    }
  });

  return links;
}

/**
 * Resolve relative URL to absolute
 */
function resolveUrl(href: string, baseUrl: string): string | null {
  try {
    // Already absolute
    if (/^https?:\/\//i.test(href)) {
      return href;
    }

    const base = new URL(baseUrl);

    // Protocol-relative
    if (href.startsWith('//')) {
      return `${base.protocol}${href}`;
    }

    // Absolute path
    if (href.startsWith('/')) {
      return `${base.protocol}//${base.host}${href}`;
    }

    // Relative path
    const basePath = base.pathname.replace(/[^/]*$/, '');
    return `${base.protocol}//${base.host}${basePath}${href}`;
  } catch {
    return null;
  }
}
