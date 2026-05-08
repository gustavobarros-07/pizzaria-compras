const request = require('supertest');

let app, token;

beforeAll(async () => {
  app = require('../app');
  const res = await request(app)
    .post('/api/login')
    .send({ username: 'admin', password: 'pizza123' });
  token = res.body.token;
});

afterEach(() => {
  const db = require('../db');
  db.prepare('DELETE FROM trip_items').run();
  db.prepare('DELETE FROM trips').run();
  db.prepare('DELETE FROM list_items').run();
});

function auth() { return { Authorization: `Bearer ${token}` }; }

async function createTrip(store_name, total) {
  const db = require('../db');
  const { randomUUID } = require('crypto');
  const tripId = randomUUID();
  db.prepare("INSERT INTO trips (id, grand_total, store_name, finished_at) VALUES (?, ?, ?, datetime('now'))")
    .run(tripId, total, store_name);
  db.prepare('INSERT INTO trip_items (id, trip_id, name, qty, unit, total_paid) VALUES (?, ?, ?, ?, ?, ?)')
    .run(randomUUID(), tripId, 'Farinha', 2, 'kg', total);
  return tripId;
}

describe('GET /api/analytics', () => {
  it('returns zeros when no trips', async () => {
    const month = new Date().toISOString().slice(0, 7);
    const res = await request(app).get(`/api/analytics?month=${month}`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.month_total).toBe(0);
    expect(res.body.month_trips).toBe(0);
    expect(res.body.avg_ticket).toBe(0);
    expect(res.body.top_products).toEqual([]);
    expect(res.body.monthly_totals).toEqual([]);
  });

  it('aggregates trips for the requested month', async () => {
    const db = require('../db');
    const { randomUUID } = require('crypto');
    const tripId = randomUUID();
    db.prepare("INSERT INTO trips (id, grand_total, store_name, finished_at) VALUES (?, ?, '', '2026-05-10 10:00:00')")
      .run(tripId, 150);
    db.prepare('INSERT INTO trip_items (id, trip_id, name, qty, unit, total_paid) VALUES (?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), tripId, 'Queijo', 1, 'kg', 150);

    const res = await request(app).get('/api/analytics?month=2026-05').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.month_total).toBe(150);
    expect(res.body.month_trips).toBe(1);
    expect(res.body.avg_ticket).toBe(150);
    expect(res.body.top_products).toHaveLength(1);
    expect(res.body.top_products[0].name).toBe('Queijo');
    expect(res.body.monthly_totals).toHaveLength(1);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/analytics?month=2026-05');
    expect(res.status).toBe(401);
  });
});
