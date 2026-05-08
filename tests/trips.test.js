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
