/**
 * spreadsheet/pgTypeToEditor.js
 * ──────────────────────────────
 * Pure mapping module: PostgreSQL data_type string → editor descriptor.
 *
 * Rules:
 *   - Never import React or DOM here. Pure JS only.
 *   - Add new mappings by extending the TYPE_MAP or the PATTERN list.
 *   - The returned descriptor is consumed by CellRenderer.jsx.
 *
 * Descriptor shape:
 * {
 *   editorType : string   — identifier consumed by CellRenderer
 *   align      : 'left' | 'right' | 'center'
 *   fontMono   : boolean  — use monospace font in cell
 *   label      : string   — human-readable type label for the column header badge
 * }
 */

// Exact type matches (lower-cased pg type string → descriptor)
const EXACT_MAP = {
  // ── Booleans ──────────────────────────────────────────────────────
  'boolean':                  { editorType: 'boolean',   align: 'center', fontMono: false, label: 'bool'      },
  'bool':                     { editorType: 'boolean',   align: 'center', fontMono: false, label: 'bool'      },

  // ── Integers ──────────────────────────────────────────────────────
  'smallint':                 { editorType: 'integer',   align: 'right',  fontMono: true,  label: 'int2'      },
  'integer':                  { editorType: 'integer',   align: 'right',  fontMono: true,  label: 'int4'      },
  'int':                      { editorType: 'integer',   align: 'right',  fontMono: true,  label: 'int'       },
  'int2':                     { editorType: 'integer',   align: 'right',  fontMono: true,  label: 'int2'      },
  'int4':                     { editorType: 'integer',   align: 'right',  fontMono: true,  label: 'int4'      },
  'int8':                     { editorType: 'integer',   align: 'right',  fontMono: true,  label: 'int8'      },
  'bigint':                   { editorType: 'integer',   align: 'right',  fontMono: true,  label: 'int8'      },
  'serial':                   { editorType: 'integer',   align: 'right',  fontMono: true,  label: 'serial'    },
  'bigserial':                { editorType: 'integer',   align: 'right',  fontMono: true,  label: 'bigserial' },
  'smallserial':              { editorType: 'integer',   align: 'right',  fontMono: true,  label: 'serial2'   },

  // ── Decimals / floats ─────────────────────────────────────────────
  'numeric':                  { editorType: 'decimal',   align: 'right',  fontMono: true,  label: 'numeric'   },
  'decimal':                  { editorType: 'decimal',   align: 'right',  fontMono: true,  label: 'decimal'   },
  'real':                     { editorType: 'decimal',   align: 'right',  fontMono: true,  label: 'float4'    },
  'float':                    { editorType: 'decimal',   align: 'right',  fontMono: true,  label: 'float'     },
  'float4':                   { editorType: 'decimal',   align: 'right',  fontMono: true,  label: 'float4'    },
  'float8':                   { editorType: 'decimal',   align: 'right',  fontMono: true,  label: 'float8'    },
  'double precision':         { editorType: 'decimal',   align: 'right',  fontMono: true,  label: 'float8'    },
  'money':                    { editorType: 'money',     align: 'right',  fontMono: true,  label: 'money'     },

  // ── Date / Time ───────────────────────────────────────────────────
  'date':                     { editorType: 'date',      align: 'left',   fontMono: true,  label: 'date'      },
  'time':                     { editorType: 'time',      align: 'left',   fontMono: true,  label: 'time'      },
  'time without time zone':   { editorType: 'time',      align: 'left',   fontMono: true,  label: 'time'      },
  'time with time zone':      { editorType: 'time',      align: 'left',   fontMono: true,  label: 'timetz'    },
  'timetz':                   { editorType: 'time',      align: 'left',   fontMono: true,  label: 'timetz'    },
  'timestamp':                { editorType: 'datetime',  align: 'left',   fontMono: true,  label: 'timestamp' },
  'timestamp without time zone': { editorType: 'datetime', align: 'left', fontMono: true,  label: 'timestamp' },
  'timestamp with time zone': { editorType: 'datetime',  align: 'left',   fontMono: true,  label: 'timestamptz' },
  'timestamptz':              { editorType: 'datetime',  align: 'left',   fontMono: true,  label: 'timestamptz' },
  'interval':                 { editorType: 'text',      align: 'left',   fontMono: true,  label: 'interval'  },

  // ── Text ─────────────────────────────────────────────────────────
  'text':                     { editorType: 'text',      align: 'left',   fontMono: false, label: 'text'      },
  'name':                     { editorType: 'text',      align: 'left',   fontMono: false, label: 'name'      },
  '"char"':                   { editorType: 'text',      align: 'left',   fontMono: false, label: 'char'      },

  // ── UUID ─────────────────────────────────────────────────────────
  'uuid':                     { editorType: 'uuid',      align: 'left',   fontMono: true,  label: 'uuid'      },

  // ── JSON ─────────────────────────────────────────────────────────
  'json':                     { editorType: 'json',      align: 'left',   fontMono: true,  label: 'json'      },
  'jsonb':                    { editorType: 'json',      align: 'left',   fontMono: true,  label: 'jsonb'     },

  // ── Arrays ────────────────────────────────────────────────────────
  'array':                    { editorType: 'json',      align: 'left',   fontMono: true,  label: 'array'     },

  // ── Networking ────────────────────────────────────────────────────
  'inet':                     { editorType: 'text',      align: 'left',   fontMono: true,  label: 'inet'      },
  'cidr':                     { editorType: 'text',      align: 'left',   fontMono: true,  label: 'cidr'      },
  'macaddr':                  { editorType: 'text',      align: 'left',   fontMono: true,  label: 'macaddr'   },
};

// Prefix-based fallbacks (checked in order when exact match fails)
const PREFIX_RULES = [
  { prefix: 'character varying', editorType: 'text',    align: 'left',  fontMono: false, label: 'varchar' },
  { prefix: 'character',         editorType: 'text',    align: 'left',  fontMono: false, label: 'char'    },
  { prefix: 'varchar',           editorType: 'text',    align: 'left',  fontMono: false, label: 'varchar' },
  { prefix: 'numeric',           editorType: 'decimal', align: 'right', fontMono: true,  label: 'numeric' },
  { prefix: 'timestamp',         editorType: 'datetime',align: 'left',  fontMono: true,  label: 'timestamp'},
  { prefix: 'time',              editorType: 'time',    align: 'left',  fontMono: true,  label: 'time'    },
  { prefix: 'int',               editorType: 'integer', align: 'right', fontMono: true,  label: 'int'     },
  { prefix: '_',                 editorType: 'json',    align: 'left',  fontMono: true,  label: 'array'   }, // pg array types start with _
];

const FALLBACK = { editorType: 'text', align: 'left', fontMono: false, label: 'text' };

/**
 * Returns a descriptor for the given PostgreSQL data_type string.
 * Always returns a valid descriptor — never throws or returns undefined.
 *
 * @param {string} pgType  – value from information_schema.columns.data_type
 * @returns {{ editorType, align, fontMono, label }}
 */
export function pgTypeToEditor(pgType) {
  if (!pgType) return FALLBACK;
  const normalized = pgType.toLowerCase().trim();

  // 1. Exact match
  if (EXACT_MAP[normalized]) return EXACT_MAP[normalized];

  // 2. Prefix match
  for (const rule of PREFIX_RULES) {
    if (normalized.startsWith(rule.prefix)) {
      return { editorType: rule.editorType, align: rule.align, fontMono: rule.fontMono, label: rule.label };
    }
  }

  return FALLBACK;
}

/**
 * Enrich a columns array (from the API) with editor descriptors.
 * Returns a new array — the input is never mutated.
 *
 * @param {Array<{name, data_type, is_primary_key, nullable, …}>} columns
 * @returns {Array<{…column, editorDescriptor}>}
 */
export function enrichColumns(columns = []) {
  return columns.map((col) => ({
    ...col,
    editorDescriptor: pgTypeToEditor(col.data_type),
  }));
}
