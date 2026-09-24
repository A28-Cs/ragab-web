/**
 * Output/stored-text hygiene (§15 XSS). We do NOT rely on sanitizing HTML — the
 * frontend renders text, never dangerouslySetInnerHTML from these fields — but we
 * still strip control characters and cap lengths on stored free text as defense in
 * depth. The primary XSS control is contextual escaping at render time (React) plus
 * a strict CSP. `escapeHtml` is available for the rare server-rendered email/HTML.
 */

// Strip C0/C1 control characters (keep \t \n \r).
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

/** Normalize user free text: strip control chars, trim, cap length. */
export function cleanText(input: string, maxLen = 5000): string {
  return input.replace(CONTROL_CHARS, '').trim().slice(0, maxLen);
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape for safe interpolation into server-generated HTML (emails, invoices). */
export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

/**
 * Open-redirect guard (§15). Only allow redirect targets that are same-site relative
 * paths (start with a single '/', not '//' or a scheme).
 */
export function safeRelativeRedirect(target: string | null | undefined, fallback = '/'): string {
  if (!target) return fallback;
  if (!target.startsWith('/') || target.startsWith('//')) return fallback;
  if (/[\r\n]/.test(target)) return fallback;
  return target;
}

/**
 * SSRF guard for any URL we might fetch server-side (§15). Blocks non-http(s),
 * localhost, and private IP ranges. Used before any outbound fetch of a user-supplied
 * URL (none today, but the payment/webhook layer must never fetch attacker URLs).
 */
export function isSafeOutboundUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  const host = url.hostname;
  if (host === 'localhost' || host === '0.0.0.0' || host.endsWith('.local')) return false;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  if (/^169\.254\./.test(host)) return false;
  if (host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) return false;
  return true;
}
