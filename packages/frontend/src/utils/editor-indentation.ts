import { indentWithTab, insertNewlineKeepIndent } from '@codemirror/commands';
import { keymap } from '@codemirror/view';
import { EditorState, Prec } from '@codemirror/state';
import { indentUnit } from '@codemirror/language';

export const editorIndentation = [
  EditorState.tabSize.of(4),
  indentUnit.of('    '),
  Prec.highest(keymap.of([{ key: 'Enter', run: insertNewlineKeepIndent }, indentWithTab])),
];
