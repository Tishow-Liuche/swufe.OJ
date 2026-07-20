import { marked } from 'marked';
import katex from 'katex';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderFormula(formula: string, displayMode: boolean): string {
  try {
    return katex.renderToString(formula.trim(), {
      throwOnError: false,
      displayMode,
    });
  } catch {
    const escaped = escapeHtml(formula);
    return displayMode
      ? `<div class="math-fallback">${escaped}</div>`
      : `<span class="math-fallback">${escaped}</span>`;
  }
}

function replaceEvery(text: string, search: string, replacement: string): string {
  return text.split(search).join(replacement);
}

export function renderMarkdownWithMath(text?: string | null): string {
  if (!text) return '';

  try {
    const protectedMarkdown = new Map<string, string>();
    const renderedMath = new Map<string, string>();
    let protectedIndex = 0;
    let mathIndex = 0;

    let raw = text;

    raw = raw.replace(/```[\s\S]*?```/g, (codeBlock: string) => {
      const key = `@@MD_CODE_${protectedIndex++}@@`;
      protectedMarkdown.set(key, codeBlock);
      return key;
    });

    raw = raw.replace(/`[^`\n]*`/g, (codeSpan: string) => {
      const key = `@@MD_CODE_${protectedIndex++}@@`;
      protectedMarkdown.set(key, codeSpan);
      return key;
    });

    raw = raw.replace(/\$\$([\s\S]+?)\$\$/g, (_match: string, formula: string) => {
      const key = `@@MD_MATH_${mathIndex++}@@`;
      renderedMath.set(key, renderFormula(formula, true));
      return key;
    });

    raw = raw.replace(/(^|[^\\$])\$([^\n$]+?)\$/g, (match: string, prefix: string, formula: string) => {
      if (!formula.trim()) return match;
      const key = `@@MD_MATH_${mathIndex++}@@`;
      renderedMath.set(key, renderFormula(formula, false));
      return `${prefix}${key}`;
    });

    protectedMarkdown.forEach((markdown, key) => {
      raw = replaceEvery(raw, key, markdown);
    });

    let html = marked.parse(raw, { async: false }) as string;

    renderedMath.forEach((rendered, key) => {
      html = replaceEvery(html, key, rendered);
    });

    return html;
  } catch {
    return escapeHtml(text).replace(/\n/g, '<br>');
  }
}
