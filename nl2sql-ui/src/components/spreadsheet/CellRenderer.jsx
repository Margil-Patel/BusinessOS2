import React from 'react';
import TextRenderer     from './editors/TextRenderer';
import IntegerRenderer  from './editors/IntegerRenderer';
import DecimalRenderer  from './editors/DecimalRenderer';
import MoneyRenderer    from './editors/MoneyRenderer';
import BooleanRenderer  from './editors/BooleanRenderer';
import DateRenderer     from './editors/DateRenderer';
import TimeRenderer     from './editors/TimeRenderer';
import DateTimeRenderer from './editors/DateTimeRenderer';
import JsonRenderer     from './editors/JsonRenderer';
import UuidRenderer     from './editors/UuidRenderer';

/**
 * CellRenderer
 * ─────────────
 * Dispatches the correct display renderer based on `editorDescriptor.editorType`.
 * The descriptor comes from pgTypeToEditor.js and is pre-attached to each column
 * by `enrichColumns()` inside SpreadsheetPage.
 *
 * Props:
 *   value            – raw cell value (any type from JSON response)
 *   editorDescriptor – { editorType, align, fontMono, label }  (required)
 *   style            – optional style overrides passed to the renderer
 *
 * Adding a new type:
 *   1. Create a new *Renderer.jsx in editors/
 *   2. Add it to the RENDERER_MAP below
 *   3. Add the mapping in pgTypeToEditor.js
 */

const RENDERER_MAP = {
  text:     TextRenderer,
  integer:  IntegerRenderer,
  decimal:  DecimalRenderer,
  money:    MoneyRenderer,
  boolean:  BooleanRenderer,
  date:     DateRenderer,
  time:     TimeRenderer,
  datetime: DateTimeRenderer,
  json:     JsonRenderer,
  uuid:     UuidRenderer,
};

const CellRenderer = ({ value, editorDescriptor, style = {} }) => {
  const type      = editorDescriptor?.editorType ?? 'text';
  const Renderer  = RENDERER_MAP[type] ?? TextRenderer;

  return <Renderer value={value} style={style} />;
};

export default CellRenderer;
