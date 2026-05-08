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
  db.prepare('DELETE FROM template_items').run();
});

function auth() {
  return { Authorization: `Bearer ${token}` };
}

describe('GET /api/template', () => {
  it('returns empty array when no items', async () => {
    const res = await request(app).get('/api/template').set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/template');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/template', () => {
  it('creates an item and returns it', async () => {
    const res = await request(app)
      .post('/api/template')
      .set(auth())
      .send({ name: 'Farinha', qty: 5, unit: 'kg' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Farinha');
    expect(res.body.qty).toBe(5);
    expect(res.body.unit).toBe('kg');
  });

  it('returns 400 without name', async () => {
    const res = await request(app)
      .post('/api/template')
      .set(auth())
      .send({ qty: 1 });
    expect(res.status).toBe(400);
  });

  it('assigns sort_order sequentially', async () => {
    await request(app).post('/api/template').set(auth()).send({ name: 'A', qty: 1, unit: 'un' });
    await request(app).post('/api/template').set(auth()).send({ name: 'B', qty: 1, unit: 'un' });
    const res = await request(app).get('/api/template').set(auth());
    expect(res.body[0].name).toBe('A');
    expect(res.body[1].name).toBe('B');
  });
});

describe('PATCH /api/template/:id', () => {
  it('updates item fields', async () => {
    const { body: item } = await request(app)
      .post('/api/template')
      .set(auth())
      .send({ name: 'Queijo', qty: 2, unit: 'kg' });

    const res = await request(app)
      .patch(`/api/template/${item.id}`)
      .set(auth())
      .send({ qty: 3 });
    expect(res.status).toBe(200);
    expect(res.body.qty).toBe(3);
    expect(res.body.name).toBe('Queijo');
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .patch('/api/template/nao-existe')
      .set(auth())
      .send({ qty: 1 });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/template/:id', () => {
  it('deletes an item', async () => {
    const { body: item } = await request(app)
      .post('/api/template')
      .set(auth())
      .send({ name: 'Tomate', qty: 3, unit: 'kg' });

    const res = await request(app)
      .delete(`/api/template/${item.id}`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const list = await request(app).get('/api/template').set(auth());
    expect(list.body).toHaveLength(0);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app)
      .delete('/api/template/nao-existe')
      .set(auth());
    expect(res.status).toBe(404);
  });
});
