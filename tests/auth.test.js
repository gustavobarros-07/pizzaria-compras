const request = require('supertest');

let app;
beforeAll(() => { app = require('../app'); });

afterEach(() => {
  const db = require('../db');
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync('pizza123', 10);
  db.prepare('UPDATE credentials SET username = ?, password_hash = ? WHERE id = 1').run('admin', hash);
});

describe('POST /api/login', () => {
  it('returns token with valid credentials', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'pizza123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  it('returns 401 with wrong password', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'errada' });
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong username', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ username: 'outro', password: 'pizza123' });
    expect(res.status).toBe(401);
  });

  it('returns 400 with missing fields', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ username: 'admin' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/credentials', () => {
  async function getToken() {
    const res = await request(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'pizza123' });
    return res.body.token;
  }

  it('changes password successfully', async () => {
    const token = await getToken();
    const res = await request(app)
      .post('/api/credentials')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'novasenha' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const login = await request(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'novasenha' });
    expect(login.status).toBe(200);
  });

  it('changes username successfully', async () => {
    const token = await getToken();
    const res = await request(app)
      .post('/api/credentials')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'novousuario' });
    expect(res.status).toBe(200);

    const login = await request(app)
      .post('/api/login')
      .send({ username: 'novousuario', password: 'pizza123' });
    expect(login.status).toBe(200);
  });

  it('returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/credentials')
      .send({ password: 'nova' });
    expect(res.status).toBe(401);
  });

  it('returns 400 with no fields', async () => {
    const token = await getToken();
    const res = await request(app)
      .post('/api/credentials')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });
});
