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
  const item = db.prepare('SELECT id FROM list_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item não encontrado' });

  const { checked, total_paid } = req.body;
  db.prepare('UPDATE list_items SET checked = ?, total_paid = ? WHERE id = ?')
    .run(checked ? 1 : 0, total_paid ?? null, req.params.id);

  const updated = db.prepare('SELECT * FROM list_items WHERE id = ?').get(req.params.id);
  res.json({ ...updated, checked: !!updated.checked });
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM list_items WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Item não encontrado' });
  res.json({ ok: true });
});

module.exports = router;
