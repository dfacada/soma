// Recipes, client error reports and feedback.

'use strict';

const express = require('express');
const { member, wrap } = require('../lib/auth');
const { HttpError, listOwned, ownedRow, packJson, unpackJson, fitText, TEXT_MAX } = require('../lib/db');

const router = express.Router();

// ── Recipes: an opaque JSON payload per row; the client owns the shape ──
const RECIPE_COLS = 'ROWID, payload_json, MODIFIEDTIME';
const shapeRecipe = (r) => ({ id: String(r.ROWID), recipe: unpackJson(r.payload_json, {}), updatedAt: r.MODIFIEDTIME });
function recipePayload(body) {
  const text = packJson('recipe', body && body.recipe);
  if (!text || text[0] !== '{') throw new HttpError(400, 'recipe must be an object');
  return text;
}

router.get('/recipes', member, wrap(async (req, res) => {
  res.json({ recipes: (await listOwned(req.admin, 'recipes', RECIPE_COLS, req.user.id)).map(shapeRecipe) });
}));
router.post('/recipes', member, wrap(async (req, res) => {
  const row = await req.admin.datastore().table('recipes').insertRow({ user_id: req.user.id, payload_json: recipePayload(req.body) });
  res.status(201).json(shapeRecipe(row));
}));
router.put('/recipes/:id', member, wrap(async (req, res) => {
  const row = await ownedRow(req.admin, 'recipes', 'ROWID', req.user.id, req.params.id);
  res.json(shapeRecipe(await req.admin.datastore().table('recipes').updateRow({ ROWID: row.ROWID, payload_json: recipePayload(req.body) })));
}));
router.delete('/recipes/:id', member, wrap(async (req, res) => {
  const row = await ownedRow(req.admin, 'recipes', 'ROWID', req.user.id, req.params.id);
  await req.admin.datastore().table('recipes').deleteRow(row.ROWID);
  res.json({ deleted: true });
}));

// ── Client error reports. Never let the reporter itself fail on size: clip instead of refusing ──
const clip = (v, max) => (typeof v === 'string' ? v.slice(0, max) : null);
router.post('/errors', member, wrap(async (req, res) => {
  const b = req.body || {};
  if (typeof b.message !== 'string' || !b.message) throw new HttpError(400, 'message is required');
  await req.admin.datastore().table('errors').insertRow({
    user_id: req.user.id, message: clip(b.message, 255), context: clip(b.context, 100), detail: clip(b.detail, TEXT_MAX), resolved: 'false'
  });
  res.status(201).json({ ok: true });
}));

router.post('/feedback', member, wrap(async (req, res) => {
  const body = fitText('body', req.body && req.body.body);
  if (!body || !body.trim()) throw new HttpError(400, 'body is required');
  await req.admin.datastore().table('feedback').insertRow({ user_id: req.user.id, body, acknowledged: 'false' });
  res.status(201).json({ ok: true });
}));

module.exports = router;
