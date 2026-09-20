import { beforeEach, expect, it, vi } from 'vitest';
import { editorDraftKey, readEditorDraft, saveEditorDraft } from './editor-draft';
beforeEach(() => localStorage.clear());
it('isolates accounts, problems and contest/practice contexts', () => {
  const key = editorDraftKey('u1', 'p1', 'contest:c1');
  saveEditorDraft(key, 'python', 'print(42)');
  expect(readEditorDraft(key)?.sourceCode).toBe('print(42)');
  for (const other of [editorDraftKey('u2','p1','contest:c1'), editorDraftKey('u1','p2','contest:c1'), editorDraftKey('u1','p1','practice')]) {
    expect(readEditorDraft(other)).toBeNull();
  }
});
it('preserves intentionally empty code and selected language', () => {
  saveEditorDraft('key', 'java', '');
  expect(readEditorDraft('key')).toMatchObject({language:'java', sourceCode:''});
});
it('ignores invalid storage and does not interrupt editing on quota errors', () => {
  localStorage.setItem('key','invalid');
  expect(readEditorDraft('key')).toBeNull();
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  expect(() => saveEditorDraft('key','cpp','code')).not.toThrow();
  spy.mockRestore();
});
