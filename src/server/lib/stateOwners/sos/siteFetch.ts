import { DESKTOP_UA, isChallengePage, looksBlocked } from '../http.js';
import { htmlToText } from '../names.js';
import type { LookupContext } from './context.js';
import { ctxFetch } from './context.js';

const MAX_BYTES = 400_000;

export function originFromDomain(domain: string | null | undefined): string | null {
  const raw = String(domain || '').trim();
  if (!raw) return null;
  try {
    const url = raw.includes('://') ? new URL(raw) : new URL(`https://${raw}`);
    if (!url.hostname) return null;
    return `${url.protocol}//${url.hostname}`;
  } catch {
    return null;
  }
}

export async function fetchSiteText(
  url: string,
  ctx?: LookupContext,
): Promise<{ url: string; text: string; html: string; blocked: boolean; status: number }> {
  if (ctx?.htmlByUrl?.[url]) {
    const html = ctx.htmlByUrl[url];
    return { url, html, text: htmlToText(html), blocked: false, status: 200 };
  }
  if (ctx && ctx.live === false) {
    return { url, html: '', text: '', blocked: false, status: 0 };
  }
  try {
    const res = await ctxFetch(ctx)(url, {
      headers: {
        'User-Agent': DESKTOP_UA,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const html = buf.subarray(0, MAX_BYTES).toString('utf8');
    const blocked = looksBlocked(res.status, html) || isChallengePage(html);
    return {
      url: res.url || url,
      html,
      text: blocked ? '' : htmlToText(html),
      blocked,
      status: res.status,
    };
  } catch {
    return { url, html: '', text: '', blocked: true, status: 0 };
  }
}

export function footerSlice(html: string): string {
  const foot = html.match(/<footer[\s\S]{0,40000}<\/footer>/i);
  if (foot?.[0]) return htmlToText(foot[0]);
  const body = htmlToText(html);
  return body.slice(Math.max(0, body.length - 2500));
}

export function copyrightLine(text: string): string | null {
  const m = text.match(/©\s*(?:copyright\s+)?(?:19|20)\d{2}\s+([^.\n|]{4,80})/i)
    || text.match(/\bcopyright\s+(?:©\s*)?(?:19|20)\d{2}\s+([^.\n|]{4,80})/i);
  return m?.[1]?.replace(/\s+/g, ' ').trim() || null;
}
