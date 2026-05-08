const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM avulsas ORDER BY purchased_at DESC, rowid DESC').all());
});

router.post('/', (req, res) => {
  const { name, qty, unit, category, total_paid, store_name } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });

  const id = randomUUID();
  db.prepare(
    'INSERT INTO avulsas (id, name, qty, unit, category, total_paid, store_name) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, name, qty ?? 1, unit || 'un', category || '', total_paid ?? 0, store_name || '');

  res.status(201).json(db.prepare('SELECT * FROM avulsas WHERE id = ?').get(id));
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM avulsas WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Compra não encontrada' });
  res.json({ ok: true });
});

module.exports = router;
