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
  db.prepare('DELETE FROM stock_items').run();
});

function auth() {
  return { Authorization: `Bearer ${token}` };
}

async function addCheckedItem(name, total_paid) {
  const { body: item } = await request(app)
    .post('/api/items')
    .set(auth())
    .send({ name, qty: 1, unit: 'un' });
  await request(app)
    .patch(`/api/items/${item.id}`)
    .set(auth())
    .send({ checked: true, total_paid });
  return item;
}

describe('GET /api/trips', () => {
  it('returns empty array when no trips', async () => {
    const res = await request(app).get('/api/trips').set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /api/trips', () => {
  it('creates a trip from checked items and clears the list', async () => {
    await addCheckedItem('Farinha', 10);
    await addCheckedItem('Queijo', 20);

    const res = await request(app).post('/api/trips').set(auth());
    expect(res.status).toBe(201);
    expect(res.body.grand_total).toBe(30);

    const items = await request(app).get('/api/items').set(auth());
    expect(items.body).toHaveLength(0);
  });

  it('returns 400 when no checked items', async () => {
    await request(app)
      .post('/api/items')
      .set(auth())
      .send({ name: 'Sal', qty: 1, unit: 'un' });

    const res = await request(app).post('/api/trips').set(auth());
    expect(res.status).toBe(400);
  });
});

describe('GET /api/trips/:id', () => {
  it('returns trip with items', async () => {
    await addCheckedItem('Tomate', 15);
    const { body: trip } = await request(app).post('/api/trips').set(auth());

    const res = await request(app).get(`/api/trips/${trip.id}`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].name).toBe('Tomate');
  });

  it('returns 404 for unknown trip', async () => {
    const res = await request(app).get('/api/trips/nao-existe').set(auth());
    expect(res.status).toBe(404);
  });
});

describe('POST /api/trips (stock update)', () => {
  it('increments stock qty when trip item name matches a stock item', async () => {
    const db = require('../db');
    db.prepare(
      'INSERT INTO stock_items (id, name, qty, unit, min_qty) VALUES (?, ?, ?, ?, ?)'
    ).run('s1', 'Farinha', 5, 'kg', 2);

    await addCheckedItem('Farinha', 20);

    await request(app).post('/api/trips').set(auth());

    const stock = db.prepare('SELECT qty FROM stock_items WHERE id = ?').get('s1');
    expect(stock.qty).toBe(6);
  });

  it('is case-insensitive when matching stock item names', async () => {
    const db = require('../db');
    db.prepare(
      'INSERT INTO stock_items (id, name, qty, unit, min_qty) VALUES (?, ?, ?, ?, ?)'
    ).run('s2', 'mozzarella', 3, 'kg', 1);

    await addCheckedItem('Mozzarella', 30);

    await request(app).post('/api/trips').set(auth());

    const stock = db.prepare('SELECT qty FROM stock_items WHERE id = ?').get('s2');
    expect(stock.qty).toBe(4);
  });

  it('does not fail when no matching stock item exists', async () => {
    await addCheckedItem('Produto sem estoque', 10);
    const res = await request(app).post('/api/trips').set(auth());
    expect(res.status).toBe(201);
  });
});

describe('POST /api/trips with store_name', () => {
  it('saves store_name when provided', async () => {
    await addCheckedItem('Sal', 5);
    const res = await request(app).post('/api/trips')
      .set(auth())
      .send({ store_name: 'Atacadão' });
    expect(res.status).toBe(201);
    expect(res.body.store_name).toBe('Atacadão');
  });

  it('defaults store_name to empty string when not provided', async () => {
    await addCheckedItem('Sal', 5);
    const res = await request(app).post('/api/trips').set(auth());
    expect(res.status).toBe(201);
    expect(res.body.store_name).toBe('');
  });
});

describe('PATCH /api/trips/:id', () => {
  it('updates store_name', async () => {
    await addCheckedItem('Sal', 5);
    const { body: trip } = await request(app).post('/api/trips').set(auth());

    const res = await request(app).patch(`/api/trips/${trip.id}`)
      .set(auth())
      .send({ store_name: 'BH' });
    expect(res.status).toBe(200);
    expect(res.body.store_name).toBe('BH');
    expect(res.body.id).toBe(trip.id);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app).patch('/api/trips/nao-existe')
      .set(auth())
      .send({ store_name: 'X' });
    expect(res.status).toBe(404);
  });

  it('returns 400 with no fields to update', async () => {
    await addCheckedItem('Sal', 5);
    const { body: trip } = await request(app).post('/api/trips').set(auth());
    const res = await request(app).patch(`/api/trips/${trip.id}`)
      .set(auth())
      .send({});
    expect(res.status).toBe(400);
  });

  it('updates finished_at', async () => {
    await addCheckedItem('Sal', 5);
    const { body: trip } = await request(app).post('/api/trips').set(auth());

    const res = await request(app).patch(`/api/trips/${trip.id}`)
      .set(auth())
      .send({ finished_at: '2026-01-15 10:00:00' });
    expect(res.status).toBe(200);
    expect(res.body.finished_at).toBe('2026-01-15 10:00:00');
  });
});

describe('DELETE /api/trips/:id', () => {
  it('deletes a trip and its items', async () => {
    await addCheckedItem('Sal', 5);
    const { body: trip } = await request(app).post('/api/trips').set(auth());

    const res = await request(app).delete(`/api/trips/${trip.id}`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const list = await request(app).get('/api/trips').set(auth());
    expect(list.body).toHaveLength(0);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app).delete('/api/trips/nao-existe').set(auth());
    expect(res.status).toBe(404);
  });
});
