import { renderMarkdownWithMath } from './markdown';
import { sanitizeStatementHtml } from '../security/sanitize-statement';

/** Shared display boundary for author previews and published statements. */
export function renderStatement(source?: string | null): string {
  // Compatibility for arrows escaped by older server-side HTML sanitization.
  // Do not decode arbitrary HTML entities into tags or alter persisted source.
  const text = (source || '').replace(/-&gt;/g, '->');
  return sanitizeStatementHtml(renderMarkdownWithMath(text));
}
