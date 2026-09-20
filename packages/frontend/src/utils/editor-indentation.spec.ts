import { beforeAll, expect, it, vi } from 'vitest';
import { autocompletion, completionStatus, startCompletion } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { cpp } from '@codemirror/lang-cpp';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { editorIndentation } from './editor-indentation';

// JSDOM has no layout engine; completion tooltips still request range geometry.
beforeAll(() => {
  Object.defineProperties(Range.prototype, {
    getClientRects: { configurable: true, value: () => [] },
    getBoundingClientRect: { configurable: true, value: () => new DOMRect() },
  });
});

it.each([['cpp', cpp], ['python', python], ['java', java]] as const)('%s: Tab inserts four spaces and Enter preserves current indentation', (_, language) => {
  const view = new EditorView({ parent: document.body, state: EditorState.create({
    doc: '    statement', selection: { anchor: 13 }, extensions: [editorIndentation, basicSetup, language()],
  }) });
  try {
    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(view.state.doc.toString()).toBe('    statement\n    ');
    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(view.state.doc.line(2).text).toBe('        ');
    expect(view.state.facet(EditorState.tabSize)).toBe(4);
  } finally { view.destroy(); }
});

it('does not add a language-derived indent after an opening brace', () => {
  const view = new EditorView({parent:document.body, state:EditorState.create({doc:'    if (ok) {',selection:{anchor:13},extensions:[editorIndentation,basicSetup,cpp()]})});
  try {
    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
    expect(view.state.doc.toString()).toBe('    if (ok) {\n    ');
  } finally {view.destroy();}
});

it('keeps Enter as newline even while a completion menu is open', async () => {
  const view = new EditorView({parent:document.body,state:EditorState.create({doc:'    con',selection:{anchor:7},extensions:[editorIndentation,basicSetup,autocompletion({override:[()=>({from:4,options:[{label:'continue'}]})]})]})});
  try {
    startCompletion(view);
    await vi.waitFor(()=>expect(completionStatus(view.state)).toBe('active'));
    await new Promise(resolve=>setTimeout(resolve,100));
    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
    expect(view.state.doc.toString()).toBe('    con\n    ');
  } finally {view.destroy();}
});
