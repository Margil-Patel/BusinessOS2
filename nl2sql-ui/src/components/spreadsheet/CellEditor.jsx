import React from 'react';
import TextInputEditor     from './editors/TextInputEditor';
import NumberInputEditor   from './editors/NumberInputEditor';
import BooleanInputEditor  from './editors/BooleanInputEditor';
import DateInputEditor     from './editors/DateInputEditor';
import TimeInputEditor     from './editors/TimeInputEditor';
import DateTimeInputEditor from './editors/DateTimeInputEditor';
import JsonInputEditor     from './editors/JsonInputEditor';

/**
 * CellEditor
 * Dispatches the correct INPUT editor based on editorDescriptor.editorType.
 * Mirrors CellRenderer but for edit mode.
 *
 * Props:
 *   value            – current staged value
 *   editorDescriptor – { editorType, … } from pgTypeToEditor
 *   onChange         – (newValue) => void
 *   onCommit         – () => void
 *   onCancel         – () => void
 *   autoFocus        – boolean
 *   onKeyDown        – (e) => void forwarded from grid
 *
 * Adding a new editor type:
 *   1. Create XxxInputEditor.jsx in editors/
 *   2. Add to INPUT_EDITOR_MAP below
 *   3. Add to pgTypeToEditor.js mapping
 */

const INPUT_EDITOR_MAP = {
  text:     TextInputEditor,
  integer:  (props) => <NumberInputEditor {...props} step="1" />,
  decimal:  (props) => <NumberInputEditor {...props} step="any" />,
  money:    (props) => <NumberInputEditor {...props} step="0.01" />,
  boolean:  BooleanInputEditor,
  date:     DateInputEditor,
  time:     TimeInputEditor,
  datetime: DateTimeInputEditor,
  json:     JsonInputEditor,
  uuid:     TextInputEditor,
};

const CellEditor = ({ value, editorDescriptor, onChange, onCommit, onCancel, autoFocus = true, onKeyDown }) => {
  const type    = editorDescriptor?.editorType ?? 'text';
  const Editor  = INPUT_EDITOR_MAP[type] ?? TextInputEditor;

  return (
    <Editor
      value={value}
      onChange={onChange}
      onCommit={onCommit}
      onCancel={onCancel}
      autoFocus={autoFocus}
      onKeyDown={onKeyDown}
    />
  );
};

export default CellEditor;
