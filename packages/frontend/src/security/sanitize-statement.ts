import DOMPurify from 'dompurify';

export function sanitizeStatementHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, mathMl: true },
    ALLOWED_URI_REGEXP: /^(?:(?:https?):|\/|#)/i,
  });
}
