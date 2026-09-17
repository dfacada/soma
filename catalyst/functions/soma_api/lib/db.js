// Data layer. All ZCQL lives here; route handlers never build queries.
//
// Data Store has no row-level security, so every function below takes the caller's
// user id and puts it in the WHERE clause. Nothing user-supplied is ever concatenated
// into ZCQL unless it has passed one of the strict validators first (ids are digits,
// days are YYYY-MM-DD, entry ids are URL-safe tokens). Free text and JSON only travel
// through insertRow / updateRow, never through a query string.

'use strict';

const TEXT_MAX = 10000; // Data Store truncates Text silently past this; we refuse instead.

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const isId = (v) => /^\d{1,19}$/.test(String(v));
const isDay = (v) => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v);
const isToken = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{8,40}$/.test(v);

function needId(v, what) { if (!isId(v)) throw new HttpError(400, 'bad ' + (what || 'id')); return String(v); }
function needDay(v) { if (!isDay(v)) throw new HttpError(400, 'day must be YYYY-MM-DD'); return v; }
function needToken(v, what) { if (!isToken(v)) throw new HttpError(400, 'bad ' + (what || 'id')); return v; }

// JSON columns: objects in, strings stored, objects out. Oversize is a 413, not a silent cut.
function packJson(name, value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object') throw new HttpError(400, name + ' must be an object or array');
  const text = JSON.stringify(value);
  if (text.length > TEXT_MAX) throw new HttpError(413, name + ' is too large (' + text.length + ' > ' + TEXT_MAX + ' chars)');
  return text;
}
function unpackJson(text, fallback) {
  if (text === null || text === undefined || text === '') return fallback;
  try { return JSON.parse(text); } catch (_e) { return fallback; }
}
function fitText(name, value, max) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new HttpError(400, name + ' must be a string');
  if (value.length > (max || TEXT_MAX)) throw new HttpError(413, name + ' is too long');
  return value;
}
// Boolean columns come back as the strings "true"/"false".
const bool = (v) => v === true || v === 'true';

async function select(admin, table, sql) {
  const rows = await admin.zcql().executeZCQLQuery(sql);
  return rows.map((r) => r[table]).filter(Boolean);
}

// ZCQL returns at most 300 rows a query. For reads that can exceed that (a round's logs: members × days),
// page with LIMIT offset, count. `sql` must carry its own ORDER BY and no LIMIT. Capped so it cannot run away.
async function selectAll(admin, table, sql, maxRows = 6000) {
  const out = [];
  for (let offset = 0; offset < maxRows; offset += 300) {
    const page = await select(admin, table, `${sql} LIMIT ${offset}, 300`);
    out.push(...page);
    if (page.length < 300) break;
  }
  return out;
}

// Insert, or update the row that already owns this unique key. Unique columns make the
// race between two first writes safe: the loser's insert fails and it updates instead.
async function upsert(admin, table, findSql, values) {
  const t = admin.datastore().table(table);
  let existing = (await select(admin, table, findSql))[0];
  if (!existing) {
    try { return await t.insertRow(values); }
    catch (e) {
      existing = (await select(admin, table, findSql))[0];
      if (!existing) throw e;
    }
  }
  return t.updateRow(Object.assign({}, values, { ROWID: existing.ROWID }));
}

// ── One row per user per day (checkins, day_logs, weight, activity) ──
// `columns` maps API field → { col, in(value) → stored, out(stored) → value }.
function dayStore(table, columns) {
  const fields = Object.keys(columns);
  const cols = ['ROWID', 'day', 'MODIFIEDTIME'].concat(fields.map((f) => columns[f].col)).join(', ');
  const shape = (row) => {
    const out = { day: row.day, updatedAt: row.MODIFIEDTIME };
    for (const f of fields) out[f] = columns[f].out(row[columns[f].col]);
    return out;
  };
  const ukey = (userId, day) => needId(userId) + ':' + needDay(day);

  return {
    async get(admin, userId, day) {
      const rows = await select(admin, table, `SELECT ${cols} FROM ${table} WHERE ukey = '${ukey(userId, day)}'`);
      return rows[0] ? shape(rows[0]) : null;
    },
    async range(admin, userId, from, to) {
      const rows = await select(admin, table,
        `SELECT ${cols} FROM ${table} WHERE user_id = ${needId(userId)} AND day >= '${needDay(from)}' AND day <= '${needDay(to)}' ORDER BY day ASC LIMIT 300`);
      return rows.map(shape);
    },
    // Partial update: only the fields present in `body` are written.
    async put(admin, userId, day, body) {
      const key = ukey(userId, day);
      const values = { user_id: String(userId), day, ukey: key };
      let touched = 0;
      for (const f of fields) {
        if (body[f] === undefined) continue;
        values[columns[f].col] = columns[f].in(body[f]);
        touched++;
      }
      if (!touched) throw new HttpError(400, 'nothing to save; expected one of: ' + fields.join(', '));
      await upsert(admin, table, `SELECT ROWID FROM ${table} WHERE ukey = '${key}'`, values);
      return this.get(admin, userId, day);
    },
    async remove(admin, userId, day) {
      const rows = await select(admin, table, `SELECT ROWID FROM ${table} WHERE ukey = '${ukey(userId, day)}'`);
      if (rows[0]) await admin.datastore().table(table).deleteRow(rows[0].ROWID);
      return Boolean(rows[0]);
    }
  };
}

// ── Rows a user owns many of (recipes, feedback, errors) ──
async function listOwned(admin, table, cols, userId, limit) {
  return select(admin, table,
    `SELECT ${cols} FROM ${table} WHERE user_id = ${needId(userId)} ORDER BY CREATEDTIME DESC LIMIT ${Math.min(limit || 300, 300)}`);
}
// Resolve a ROWID only if it belongs to the caller. A foreign or missing row is the same 404.
async function ownedRow(admin, table, cols, userId, rowId) {
  const rows = await select(admin, table,
    `SELECT ${cols} FROM ${table} WHERE ROWID = ${needId(rowId)} AND user_id = ${needId(userId)}`);
  if (!rows[0]) throw new HttpError(404, 'not found');
  return rows[0];
}

module.exports = {
  HttpError, TEXT_MAX, isId, isDay, isToken, needId, needDay, needToken,
  packJson, unpackJson, fitText, bool, select, selectAll, upsert, dayStore, listOwned, ownedRow
};
