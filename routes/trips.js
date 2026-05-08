const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM trips ORDER BY finished_at DESC').all());
});

router.post('/', (req, res) => {
  const { store_name = '' } = req.body || {};
  const checked = db.prepare('SELECT * FROM list_items WHERE checked = 1').all();
  if (checked.length === 0) return res.status(400).json({ error: 'Nenhum item marcado' });

  const grandTotal = checked.reduce((s, i) => s + (i.total_paid || 0), 0);
  const tripId = randomUUID();

  const insertTrip  = db.prepare('INSERT INTO trips (id, grand_total, store_name) VALUES (?, ?, ?)');
  const insertItem  = db.prepare(
    'INSERT INTO trip_items (id, trip_id, name, qty, unit, total_paid) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const clearList   = db.prepare('DELETE FROM list_items');
  const updateStock = db.prepare(
    "UPDATE stock_items SET qty = qty + ?, updated_at = datetime('now') WHERE LOWER(name) = LOWER(?)"
  );

  db.transaction(() => {
    insertTrip.run(tripId, grandTotal, store_name);
    for (const item of checked) {
      insertItem.run(randomUUID(), tripId, item.name, item.qty, item.unit, item.total_paid);
      updateStock.run(item.qty, item.name);
    }
    clearList.run();
  })();

  res.status(201).json(db.prepare('SELECT * FROM trips WHERE id = ?').get(tripId));
});

router.patch('/:id', (req, res) => {
  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Compra não encontrada' });

  const updates = {};
  if (req.body.store_name  !== undefined) updates.store_name  = req.body.store_name;
  if (req.body.finished_at !== undefined) updates.finished_at = req.body.finished_at;

  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE trips SET ${setClauses} WHERE id = ?`)
    .run(...Object.values(updates), req.params.id);

  res.json(db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM trips WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Compra não encontrada' });
  res.json({ ok: true });
});

router.get('/:id', (req, res) => {
  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Compra não encontrada' });
  const items = db.prepare('SELECT * FROM trip_items WHERE trip_id = ? ORDER BY name').all(req.params.id);
  res.json({ ...trip, items });
});

module.exports = router;
