export interface EditorDraft { language: string; sourceCode: string; updatedAt: number }
export function editorDraftKey(userId: string, problemId: string, context: string) {
  return 'swufe:editor:v1:' + JSON.stringify([userId, context, problemId]);
}
export function readEditorDraft(key: string): EditorDraft | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value && ['cpp', 'c', 'python', 'java'].includes(value.language)
      && typeof value.sourceCode === 'string' && Number.isFinite(value.updatedAt) ? value : null;
  } catch { return null; }
}
export function saveEditorDraft(key: string, language: string, sourceCode: string) {
  if (!key) return;
  try { localStorage.setItem(key, JSON.stringify({ language, sourceCode, updatedAt: Date.now() })); }
  catch { /* Unavailable browser storage must not interrupt editing. */ }
}
