/**
 * spreadsheet/validateRows.js
 * ───────────────────────────
 * Pure validation module. No React, no imports.
 *
 * validateDirtyRows(localRows, columns)
 *   → { isValid: bool, errors: {[`${rowIndex}_${colName}`]: string}, errorCount: int }
 *
 * Rules applied per dirty/new row:
 *   1. Required field (nullable=false) — value is null/undefined/''
 *   2. Primary key required — PK column must not be empty
 *      (UNLESS the column is a serial/auto-increment type)
 *   3. Duplicate PK — within the set of dirty/new rows being saved
 *   4. Type-specific validity — wrong format for integer, date, uuid, etc.
 */

// Serial / auto-generated PK types that do NOT require a value on new rows
const AUTO_PK_TYPES = new Set([
  'serial', 'bigserial', 'smallserial',
  'integer', 'bigint', 'smallint', 'int', 'int2', 'int4', 'int8',
]);

const isEmpty = (val) =>
  val === null || val === undefined || val === '';

// ── Type validators ─────────────────────────────────────────────────────────
// Each returns null (OK) or an error string.

const TYPE_VALIDATORS = {

  integer(val) {
    if (isEmpty(val)) return null;
    const s = String(val).trim();
    if (!/^-?\d+$/.test(s)) return 'Must be a whole number (no decimals)';
    const n = Number(s);
    if (!Number.isInteger(n) || !Number.isFinite(n)) return 'Must be a whole number';
    return null;
  },

  decimal(val) {
    if (isEmpty(val)) return null;
    const n = Number(val);
    if (!Number.isFinite(n)) return 'Must be a valid decimal number';
    return null;
  },

  money(val) {
    if (isEmpty(val)) return null;
    // Strip currency symbols before checking
    const s = String(val).replace(/[$€£¥,]/g, '').trim();
    const n = Number(s);
    if (!Number.isFinite(n)) return 'Must be a valid monetary value';
    return null;
  },

  boolean(val) {
    if (isEmpty(val)) return null;
    if (typeof val === 'boolean') return null;
    const s = String(val).toLowerCase().trim();
    if (['true', 'false', 't', 'f', '1', '0', 'yes', 'no'].includes(s)) return null;
    return 'Must be TRUE or FALSE';
  },

  date(val) {
    if (isEmpty(val)) return null;
    const s = String(val).trim();
    // Allow YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return 'Must be a valid date (YYYY-MM-DD)';
    const d = new Date(s);
    if (isNaN(d.getTime())) return 'Invalid date value';
    return null;
  },

  time(val) {
    if (isEmpty(val)) return null;
    const s = String(val).trim();
    if (!/^\d{2}:\d{2}/.test(s)) return 'Must be a valid time (HH:MM or HH:MM:SS)';
    return null;
  },

  datetime(val) {
    if (isEmpty(val)) return null;
    const d = new Date(String(val));
    if (isNaN(d.getTime())) return 'Must be a valid date-time';
    return null;
  },

  json(val) {
    if (isEmpty(val)) return null;
    if (typeof val === 'object') return null; // Already parsed object/array
    try { JSON.parse(String(val)); return null; } catch { return 'Must be valid JSON'; }
  },

  uuid(val) {
    if (isEmpty(val)) return null;
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(String(val).trim())) return 'Must be a valid UUID';
    return null;
  },

  text: () => null,
};

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Validate all dirty/new rows in localRows against the enriched column definitions.
 *
 * @param {Array} localRows     – rows with _isNew / _isDirty metadata flags
 * @param {Array} columns       – enriched columns (with editorDescriptor, nullable, is_primary_key, data_type)
 * @returns {{ isValid, errors, errorCount, errorRows }}
 */
export function validateDirtyRows(localRows, columns) {
  const errors = {}; // key: `${rowIndex}_${colName}` → message

  // Find PK column (first one if composite, which we don't fully support yet)
  const pkColumn = columns.find((c) => c.is_primary_key);

  // First pass: collect PK values of ALL dirty rows to detect duplicates
  const pkSeen = {}; // strPkValue → rowIndex of first occurrence
  if (pkColumn) {
    localRows.forEach((row, rowIndex) => {
      if (!row._isDirty && !row._isNew) return;
      const pkVal = row[pkColumn.name];
      if (!isEmpty(pkVal)) {
        const key = String(pkVal);
        if (pkSeen[key] !== undefined) {
          // Mark both rows
          const prevKey = `${pkSeen[key]}_${pkColumn.name}`;
          errors[prevKey] = 'Duplicate primary key';
          errors[`${rowIndex}_${pkColumn.name}`] = 'Duplicate primary key';
        } else {
          pkSeen[key] = rowIndex;
        }
      }
    });
  }

  // Second pass: validate each dirty/new row
  localRows.forEach((row, rowIndex) => {
    if (!row._isDirty && !row._isNew) return; // skip unmodified rows

    columns.forEach((col) => {
      const errorKey = `${rowIndex}_${col.name}`;
      if (errors[errorKey]) return; // duplicate PK already set above

      const val = row[col.name];
      const valIsEmpty = isEmpty(val);

      // ── 1. Primary key required (skip for auto-generated serials on new rows) ──
      if (col.is_primary_key) {
        const isSerial = AUTO_PK_TYPES.has((col.data_type ?? '').toLowerCase());
        if (valIsEmpty && !isSerial) {
          errors[errorKey] = 'Primary key cannot be empty';
          return;
        }
        if (valIsEmpty && isSerial && !row._isNew) {
          // Existing row whose PK was cleared
          errors[errorKey] = 'Primary key cannot be cleared on an existing row';
          return;
        }
        // PK on new row with serial type: skip (DB will generate it)
        return;
      }

      // ── 2. Required field (NOT NULL) ─────────────────────────────────────────
      if (col.nullable === false && valIsEmpty) {
        errors[errorKey] = 'This field is required (NOT NULL)';
        return;
      }

      // ── 3. Type-specific validation (only when not empty) ────────────────────
      if (!valIsEmpty) {
        const editorType = col.editorDescriptor?.editorType ?? 'text';
        const validator  = TYPE_VALIDATORS[editorType] ?? TYPE_VALIDATORS.text;
        const typeError  = validator(val);
        if (typeError) {
          errors[errorKey] = typeError;
        }
      }
    });
  });

  const errorCount = Object.keys(errors).length;
  const errorRows  = new Set(
    Object.keys(errors).map((k) => parseInt(k.split('_')[0], 10))
  );

  return {
    isValid: errorCount === 0,
    errors,
    errorCount,
    errorRows,
  };
}
