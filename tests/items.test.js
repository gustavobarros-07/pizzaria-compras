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
  db.prepare('DELETE FROM list_items').run();
});

function auth() {
  return { Authorization: `Bearer ${token}` };
}

describe('GET /api/items', () => {
  it('returns empty array when no items', async () => {
    const res = await request(app).get('/api/items').set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/items');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/items', () => {
  it('creates an item and returns it', async () => {
    const res = await request(app)
      .post('/api/items')
      .set(auth())
      .send({ name: 'Farinha', qty: 2, unit: 'kg' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Farinha');
    expect(res.body.qty).toBe(2);
    expect(res.body.checked).toBe(false);
  });

  it('returns 400 without name', async () => {
    const res = await request(app)
      .post('/api/items')
      .set(auth())
      .send({ qty: 1 });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/items/:id', () => {
  it('marks item as checked with price', async () => {
    const { body: item } = await request(app)
      .post('/api/items')
      .set(auth())
      .send({ name: 'Queijo', qty: 1, unit: 'kg' });

    const res = await request(app)
      .patch(`/api/items/${item.id}`)
      .set(auth())
      .send({ checked: true, total_paid: 45.5 });
    expect(res.status).toBe(200);
    expect(res.body.checked).toBe(true);
    expect(res.body.total_paid).toBe(45.5);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .patch('/api/items/nao-existe')
      .set(auth())
      .send({ checked: true, total_paid: 10 });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/items/:id', () => {
  it('deletes an item', async () => {
    const { body: item } = await request(app)
      .post('/api/items')
      .set(auth())
      .send({ name: 'Tomate', qty: 3, unit: 'kg' });

    const res = await request(app)
      .delete(`/api/items/${item.id}`)
      .set(auth());
    expect(res.status).toBe(200);

    const list = await request(app).get('/api/items').set(auth());
    expect(list.body).toHaveLength(0);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .delete('/api/items/nao-existe')
      .set(auth());
    expect(res.status).toBe(404);
  });
});
