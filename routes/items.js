const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const items = db.prepare('SELECT * FROM list_items ORDER BY created_at').all();
  res.json(items.map(i => ({ ...i, checked: !!i.checked })));
});

router.post('/', (req, res) => {
  const { name, qty, unit } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });

  const id = randomUUID();
  db.prepare('INSERT INTO list_items (id, name, qty, unit) VALUES (?, ?, ?, ?)')
    .run(id, name, qty || 1, unit || 'un');

  const item = db.prepare('SELECT * FROM list_items WHERE id = ?').get(id);
  res.status(201).json({ ...item, checked: !!item.checked });
});

router.patch('/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM list_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item não encontrado' });

  const updates = {};
  if (req.body.checked !== undefined) updates.checked = req.body.checked ? 1 : 0;
  if (req.body.total_paid !== undefined) updates.total_paid = req.body.total_paid;
  if (req.body.qty !== undefined) updates.qty = req.body.qty;
  if (req.body.unit !== undefined) updates.unit = req.body.unit;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Nenhum campo para atualizar' });
  }

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), req.params.id];
  db.prepare(`UPDATE list_items SET ${setClauses} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM list_items WHERE id = ?').get(req.params.id);
  res.json({ ...updated, checked: !!updated.checked });
});

router.delete('/', (req, res) => {
  db.prepare('DELETE FROM list_items').run();
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM list_items WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Item não encontrado' });
  res.json({ ok: true });
});

module.exports = router;
