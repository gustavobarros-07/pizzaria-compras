const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const trips = db.prepare('SELECT * FROM trips ORDER BY finished_at DESC').all();
  res.json(trips);
});

router.post('/', (req, res) => {
  const checked = db.prepare('SELECT * FROM list_items WHERE checked = 1').all();
  if (checked.length === 0) {
    return res.status(400).json({ error: 'Nenhum item marcado' });
  }

  const grandTotal = checked.reduce((s, i) => s + (i.total_paid || 0), 0);
  const tripId = randomUUID();

  const insertTrip = db.prepare('INSERT INTO trips (id, grand_total) VALUES (?, ?)');
  const insertItem = db.prepare(
    'INSERT INTO trip_items (id, trip_id, name, qty, unit, total_paid) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const clearList = db.prepare('DELETE FROM list_items');

  db.transaction(() => {
    insertTrip.run(tripId, grandTotal);
    for (const item of checked) {
      insertItem.run(randomUUID(), tripId, item.name, item.qty, item.unit, item.total_paid);
    }
    clearList.run();
  })();

  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(tripId);
  res.status(201).json(trip);
});

router.get('/:id', (req, res) => {
  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Compra não encontrada' });

  const items = db.prepare('SELECT * FROM trip_items WHERE trip_id = ? ORDER BY name')
    .all(req.params.id);
  res.json({ ...trip, items });
});

module.exports = router;
