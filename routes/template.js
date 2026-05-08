const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM template_items ORDER BY sort_order').all());
});

router.post('/', (req, res) => {
  const { name, qty, unit, category = '' } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });

  const id = randomUUID();
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM template_items').get().m;
  db.prepare(
    'INSERT INTO template_items (id, name, qty, unit, category, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, name, qty || 1, unit || 'un', category, maxOrder + 1);

  res.status(201).json(db.prepare('SELECT * FROM template_items WHERE id = ?').get(id));
});

router.patch('/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM template_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item não encontrado' });

  const updates = {};
  if (req.body.name     !== undefined) updates.name     = req.body.name;
  if (req.body.qty      !== undefined) updates.qty      = req.body.qty;
  if (req.body.unit     !== undefined) updates.unit     = req.body.unit;
  if (req.body.category !== undefined) updates.category = req.body.category;

  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE template_items SET ${setClauses} WHERE id = ?`)
    .run(...Object.values(updates), req.params.id);

  res.json(db.prepare('SELECT * FROM template_items WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM template_items WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Item não encontrado' });
  res.json({ ok: true });
});

module.exports = router;
