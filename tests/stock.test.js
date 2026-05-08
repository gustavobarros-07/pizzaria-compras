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
  db.prepare('DELETE FROM stock_items').run();
});

function auth() {
  return { Authorization: `Bearer ${token}` };
}

describe('GET /api/stock', () => {
  it('returns empty array when no items', async () => {
    const res = await request(app).get('/api/stock').set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/stock');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/stock', () => {
  it('creates a stock item with all fields', async () => {
    const res = await request(app)
      .post('/api/stock')
      .set(auth())
      .send({ name: 'Mozzarella', qty: 10, unit: 'kg', min_qty: 3 });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Mozzarella');
    expect(res.body.qty).toBe(10);
    expect(res.body.min_qty).toBe(3);
  });

  it('uses defaults for optional fields', async () => {
    const res = await request(app)
      .post('/api/stock')
      .set(auth())
      .send({ name: 'Sal' });
    expect(res.status).toBe(201);
    expect(res.body.qty).toBe(0);
    expect(res.body.unit).toBe('un');
    expect(res.body.min_qty).toBe(0);
  });

  it('returns 400 without name', async () => {
    const res = await request(app)
      .post('/api/stock')
      .set(auth())
      .send({ qty: 5 });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/stock/:id', () => {
  it('updates qty', async () => {
    const { body: item } = await request(app)
      .post('/api/stock')
      .set(auth())
      .send({ name: 'Farinha', qty: 10, unit: 'kg', min_qty: 2 });

    const res = await request(app)
      .patch(`/api/stock/${item.id}`)
      .set(auth())
      .send({ qty: 7 });
    expect(res.status).toBe(200);
    expect(res.body.qty).toBe(7);
  });

  it('updates min_qty', async () => {
    const { body: item } = await request(app)
      .post('/api/stock')
      .set(auth())
      .send({ name: 'Queijo', qty: 5, unit: 'kg', min_qty: 1 });

    const res = await request(app)
      .patch(`/api/stock/${item.id}`)
      .set(auth())
      .send({ min_qty: 3 });
    expect(res.status).toBe(200);
    expect(res.body.min_qty).toBe(3);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .patch('/api/stock/nao-existe')
      .set(auth())
      .send({ qty: 1 });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/stock/:id', () => {
  it('deletes a stock item', async () => {
    const { body: item } = await request(app)
      .post('/api/stock')
      .set(auth())
      .send({ name: 'Sal', qty: 5, unit: 'kg', min_qty: 1 });

    const res = await request(app)
      .delete(`/api/stock/${item.id}`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const list = await request(app).get('/api/stock').set(auth());
    expect(list.body).toHaveLength(0);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .delete('/api/stock/nao-existe')
      .set(auth());
    expect(res.status).toBe(404);
  });
});

describe('POST /api/stock with category', () => {
  it('saves category when provided', async () => {
    const res = await request(app).post('/api/stock').set(auth())
      .send({ name: 'Queijo', qty: 5, unit: 'kg', min_qty: 1, category: 'laticinios' });
    expect(res.status).toBe(201);
    expect(res.body.category).toBe('laticinios');
  });

  it('defaults category to empty string', async () => {
    const res = await request(app).post('/api/stock').set(auth())
      .send({ name: 'Sal', qty: 1, unit: 'kg', min_qty: 0 });
    expect(res.status).toBe(201);
    expect(res.body.category).toBe('');
  });
});

describe('PATCH /api/stock/:id with category', () => {
  it('updates category', async () => {
    const { body: item } = await request(app).post('/api/stock').set(auth())
      .send({ name: 'Carne', qty: 2, unit: 'kg', min_qty: 1 });
    const res = await request(app).patch(`/api/stock/${item.id}`).set(auth())
      .send({ category: 'carne' });
    expect(res.status).toBe(200);
    expect(res.body.category).toBe('carne');
  });
});
