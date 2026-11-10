// Messages between a member and the admin (David, 2026-11-08, Dayhub Ops: "Message them … It shows in Dayhub as a message
// from you"). One thread a member. The admin writes from Dayhub Ops (routes/ops.js); the member reads and answers here,
// in Settings → Messages, and an unread message from the admin shows on Today.
//
//   GET  /messages        the caller's thread, oldest first, with their old feedback in it
//   POST /messages        { body } — write to the admin
//   POST /messages/read   the admin's messages have been seen
//
// Not end-to-end encrypted, like the old feedback form: the admin has to read it. The screens say so.

'use strict';

const express = require('express');
const { member, wrap, isTestUser, tellAdmins } = require('../lib/auth');
const { HttpError, select, needId } = require('../lib/db');

const router = express.Router();
const BODY_MAX = 2000;
const PER_DAY = 30; // a person writing a lot is fine; a loop or a script is not
const num = (v) => Number(v) || 0;
const WROTE = 'Someone wrote to you in Dayhub. Read it in Dayhub Ops → Support.';
const created = (t) => { const ms = Date.parse(String(t || '').replace(' ', 'T').replace(/:(\d{3})$/, '.$1') + 'Z'); return Number.isFinite(ms) ? ms : 0; };

router.get('/messages', member, wrap(async (req, res) => {
  const uid = needId(req.user.id);
  const [msgs, fb] = await Promise.all([
    select(req.admin, 'messages', `SELECT ROWID, sender, author_id, body, created_ms, read_ms FROM messages WHERE user_id = ${uid} ORDER BY created_ms DESC LIMIT 100`),
    select(req.admin, 'feedback', `SELECT ROWID, body, CREATEDTIME FROM feedback WHERE user_id = ${uid} ORDER BY CREATEDTIME DESC LIMIT 30`)
  ]);
  const authorIds = [...new Set(msgs.filter((m) => m.sender === 'admin' && m.author_id).map((m) => needId(String(m.author_id))))];
  const authors = new Map();
  if (authorIds.length) {
    const rows = await select(req.admin, 'profiles', `SELECT user_id, display_name FROM profiles WHERE user_id IN (${authorIds.join(', ')}) LIMIT 50`);
    rows.forEach((p) => authors.set(String(p.user_id), String(p.display_name || '').trim().split(/\s+/)[0] || 'Dayhub'));
  }
  const list = msgs.map((m) => ({ id: String(m.ROWID), sender: m.sender === 'admin' ? 'admin' : 'member', from: m.sender === 'admin' ? authors.get(String(m.author_id)) || 'Dayhub' : null, body: m.body || '', at: num(m.created_ms), read: Boolean(num(m.read_ms)) }))
    .concat(fb.map((f) => ({ id: 'f' + f.ROWID, sender: 'member', from: null, body: f.body || '', at: created(f.CREATEDTIME), read: true, feedback: true })))
    .sort((a, b) => a.at - b.at);
  res.json({ messages: list, unread: list.filter((m) => m.sender === 'admin' && !m.read).length });
}));

router.post('/messages', member, wrap(async (req, res) => {
  const body = String((req.body && req.body.body) || '').trim();
  if (!body) throw new HttpError(400, 'write something first');
  if (body.length > BODY_MAX) throw new HttpError(413, `keep it under ${BODY_MAX} characters`);
  const uid = needId(req.user.id), now = Date.now();
  const today = await select(req.admin, 'messages', `SELECT ROWID FROM messages WHERE user_id = ${uid} AND sender = 'member' AND created_ms > ${now - 86400000} LIMIT ${PER_DAY}`);
  if (today.length >= PER_DAY) throw new HttpError(429, "That's a lot of messages for one day. Try again tomorrow.");
  const test = isTestUser(req);
  // The synthetic test members' words are filed as already read, so test runs never become issues in Ops.
  const row = await req.admin.datastore().table('messages').insertRow({ user_id: uid, sender: 'member', author_id: uid, body, created_ms: now, read_ms: test ? now : null });
  // The admin hears that someone wrote, never who or what: Telegram is not where members' words go.
  if (!test) void tellAdmins(req.admin, WROTE);
  res.status(201).json({ id: String(row.ROWID), sender: 'member', body, at: now, read: false });
}));

router.post('/messages/read', member, wrap(async (req, res) => {
  const uid = needId(req.user.id), now = Date.now();
  const open = await select(req.admin, 'messages', `SELECT ROWID FROM messages WHERE user_id = ${uid} AND sender = 'admin' AND read_ms IS NULL LIMIT 200`);
  if (open.length) await req.admin.datastore().table('messages').updateRows(open.map((r) => ({ ROWID: r.ROWID, read_ms: now })));
  res.json({ read: open.length });
}));

module.exports = router;
