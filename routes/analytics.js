const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);

  const row = db.prepare(
    "SELECT COALESCE(SUM(grand_total), 0) AS total, COUNT(*) AS trips FROM trips WHERE strftime('%Y-%m', finished_at) = ?"
  ).get(month);

  const topProducts = db.prepare(`
    SELECT ti.name, SUM(ti.total_paid) AS total, COUNT(*) AS count
    FROM trip_items ti
    JOIN trips t ON t.id = ti.trip_id
    WHERE strftime('%Y-%m', t.finished_at) = ?
    GROUP BY LOWER(ti.name)
    ORDER BY total DESC
    LIMIT 5
  `).all(month);

  const monthlyTotals = db.prepare(`
    SELECT strftime('%Y-%m', finished_at) AS month,
           SUM(grand_total) AS total,
           COUNT(*) AS trips
    FROM trips
    GROUP BY month
    ORDER BY month DESC
    LIMIT 12
  `).all();

  res.json({
    month_total: row.total,
    month_trips: row.trips,
    avg_ticket: row.trips > 0 ? row.total / row.trips : 0,
    top_products: topProducts,
    monthly_totals: monthlyTotals
  });
});

module.exports = router;
