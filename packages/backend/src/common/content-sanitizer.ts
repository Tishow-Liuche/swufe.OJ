import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = [
  'p', 'br', 'h1', 'h2', 'h3', 'h4', 'pre', 'code', 'blockquote',
  'ul', 'ol', 'li', 'strong', 'em', 'table', 'thead', 'tbody', 'tr',
  'th', 'td', 'a', 'img', 'span', 'div',
];

export function sanitizeProblemContent(value: string): string {
  return sanitizeHtml(String(value || ''), {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'title'],
      img: ['src', 'alt', 'title'],
      '*': ['class'],
    },
    allowedSchemes: ['http', 'https'],
    allowProtocolRelative: false,
  });
}
