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
  db.prepare('DELETE FROM avulsas').run();
});

function auth() { return { Authorization: `Bearer ${token}` }; }

describe('GET /api/avulsas', () => {
  it('returns empty array when none exist', async () => {
    const res = await request(app).get('/api/avulsas').set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns avulsas ordered by purchased_at desc', async () => {
    await request(app).post('/api/avulsas').set(auth())
      .send({ name: 'A', qty: 1, unit: 'un', total_paid: 10, store_name: '' });
    await request(app).post('/api/avulsas').set(auth())
      .send({ name: 'B', qty: 1, unit: 'un', total_paid: 20, store_name: '' });
    const res = await request(app).get('/api/avulsas').set(auth());
    expect(res.body[0].name).toBe('B');
    expect(res.body[1].name).toBe('A');
  });
});

describe('POST /api/avulsas', () => {
  it('creates an avulsa with all fields', async () => {
    const res = await request(app).post('/api/avulsas').set(auth())
      .send({ name: 'Mozzarella', qty: 2, unit: 'kg', total_paid: 45, store_name: 'Atacadão', category: 'laticinios' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Mozzarella');
    expect(res.body.qty).toBe(2);
    expect(res.body.total_paid).toBe(45);
    expect(res.body.store_name).toBe('Atacadão');
    expect(res.body.category).toBe('laticinios');
  });

  it('returns 400 without name', async () => {
    const res = await request(app).post('/api/avulsas').set(auth())
      .send({ qty: 1, unit: 'un', total_paid: 10 });
    expect(res.status).toBe(400);
  });

  it('uses defaults for optional fields', async () => {
    const res = await request(app).post('/api/avulsas').set(auth())
      .send({ name: 'Sal' });
    expect(res.status).toBe(201);
    expect(res.body.qty).toBe(1);
    expect(res.body.unit).toBe('un');
    expect(res.body.total_paid).toBe(0);
    expect(res.body.store_name).toBe('');
  });
});

describe('DELETE /api/avulsas/:id', () => {
  it('deletes an avulsa', async () => {
    const { body: item } = await request(app).post('/api/avulsas').set(auth())
      .send({ name: 'Tomate', qty: 1, unit: 'kg', total_paid: 8 });
    const res = await request(app).delete(`/api/avulsas/${item.id}`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const list = await request(app).get('/api/avulsas').set(auth());
    expect(list.body).toHaveLength(0);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app).delete('/api/avulsas/nao-existe').set(auth());
    expect(res.status).toBe(404);
  });
});
