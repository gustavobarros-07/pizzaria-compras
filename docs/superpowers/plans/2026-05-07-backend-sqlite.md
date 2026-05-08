# Pizzaria Compras — Backend + SQLite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar o app de lista de compras da pizzaria de Supabase para um backend Node.js+Express com SQLite embutido, com login, hospedado no Railway.

**Architecture:** Express serve o frontend (HTML estático em `public/`) e a API REST em `/api/*`. SQLite armazena todos os dados no servidor. JWT protege todos os endpoints exceto `/api/login`. Uma única URL pública para todos os dispositivos.

**Tech Stack:** Node.js 20, Express 4, better-sqlite3, bcryptjs, jsonwebtoken, Jest, Supertest

---

## File Map

**Criar:**
- `package.json`
- `jest.config.js`
- `.gitignore`
- `railway.toml`
- `db.js` — inicialização do SQLite + schema + seed
- `middleware/requireAuth.js` — verificação JWT
- `routes/auth.js` — POST /api/login, POST /api/credentials
- `routes/items.js` — CRUD /api/items
- `routes/trips.js` — /api/trips
- `app.js` — Express app sem listen
- `server.js` — entry point com listen
- `tests/setup.js` — variáveis de ambiente para testes
- `tests/auth.test.js`
- `tests/items.test.js`
- `tests/trips.test.js`
- `public/index.html` — frontend reescrito

**Remover:**
- `index.html` (raiz) — substituído por `public/index.html`
- `setup-supabase.sql` — não mais necessário

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `jest.config.js`
- Create: `.gitignore`
- Create: `railway.toml`

- [ ] **Step 1: Criar package.json**

```json
{
  "name": "pizzaria-compras",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "test": "jest --runInBand"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "better-sqlite3": "^9.4.3",
    "express": "^4.18.2",
    "jsonwebtoken": "^9.0.2"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "supertest": "^6.3.4"
  }
}
```

- [ ] **Step 2: Criar jest.config.js**

```javascript
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['./tests/setup.js'],
  testMatch: ['**/tests/**/*.test.js']
};
```

- [ ] **Step 3: Criar .gitignore**

```
node_modules/
data/
.env
```

- [ ] **Step 4: Criar railway.toml**

```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "node server.js"
restartPolicyType = "on_failure"

[deploy.healthcheck]
path = "/"
```

- [ ] **Step 5: Criar diretórios necessários**

```bash
mkdir -p middleware routes tests public data
```

- [ ] **Step 6: Instalar dependências**

```bash
npm install
```

Expected: `node_modules/` criado sem erros.

- [ ] **Step 7: Commit**

```bash
git init
git add package.json jest.config.js .gitignore railway.toml
git commit -m "chore: project scaffolding"
```

---

## Task 2: Database Module

**Files:**
- Create: `db.js`

- [ ] **Step 1: Criar db.js**

```javascript
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || (() => {
  const dir = path.join(__dirname, 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'pizzaria.db');
})();

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS credentials (
    id      INTEGER PRIMARY KEY DEFAULT 1,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS list_items (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    qty        REAL NOT NULL DEFAULT 1,
    unit       TEXT NOT NULL DEFAULT 'un',
    checked    INTEGER NOT NULL DEFAULT 0,
    total_paid REAL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS trips (
    id          TEXT PRIMARY KEY,
    grand_total REAL NOT NULL DEFAULT 0,
    finished_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS trip_items (
    id         TEXT PRIMARY KEY,
    trip_id    TEXT REFERENCES trips(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    qty        REAL NOT NULL,
    unit       TEXT NOT NULL,
    total_paid REAL
  );
`);

const existing = db.prepare('SELECT id FROM credentials WHERE id = 1').get();
if (!existing) {
  const hash = bcrypt.hashSync('pizza123', 10);
  db.prepare('INSERT INTO credentials (id, username, password_hash) VALUES (1, ?, ?)').run('admin', hash);
}

module.exports = db;
```

- [ ] **Step 2: Criar tests/setup.js**

```javascript
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret';
```

- [ ] **Step 3: Verificar que db.js não lança erros ao ser importado**

```bash
node -e "require('./db'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add db.js tests/setup.js
git commit -m "feat: database module with SQLite schema and default credentials"
```

---

## Task 3: Auth Middleware

**Files:**
- Create: `middleware/requireAuth.js`

- [ ] **Step 1: Criar middleware/requireAuth.js**

```javascript
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'pizzaria-secret-key';

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autenticado' });
  }
  try {
    req.user = jwt.verify(header.slice(7), SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

module.exports = requireAuth;
```

- [ ] **Step 2: Commit**

```bash
git add middleware/requireAuth.js
git commit -m "feat: JWT auth middleware"
```

---

## Task 4: Auth Routes + Tests

**Files:**
- Create: `routes/auth.js`
- Create: `tests/auth.test.js`

- [ ] **Step 1: Criar tests/auth.test.js com testes falhando**

```javascript
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
```

- [ ] **Step 2: Criar routes/auth.js**

```javascript
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();
const SECRET = process.env.JWT_SECRET || 'pizzaria-secret-key';

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Campos obrigatórios' });
  }

  const cred = db.prepare('SELECT * FROM credentials WHERE id = 1').get();
  if (!cred || cred.username !== username) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }
  if (!bcrypt.compareSync(password, cred.password_hash)) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  const token = jwt.sign({ id: 1 }, SECRET, { expiresIn: '7d' });
  res.json({ token });
});

router.post('/credentials', requireAuth, (req, res) => {
  const { username, password } = req.body;
  if (!username && !password) {
    return res.status(400).json({ error: 'Informe usuário ou senha' });
  }

  const cred = db.prepare('SELECT * FROM credentials WHERE id = 1').get();
  const newUsername = username || cred.username;
  const newHash = password ? bcrypt.hashSync(password, 10) : cred.password_hash;

  db.prepare('UPDATE credentials SET username = ?, password_hash = ? WHERE id = 1')
    .run(newUsername, newHash);
  res.json({ ok: true });
});

module.exports = router;
```

- [ ] **Step 3: Criar app.js temporário para os testes rodarem**

```javascript
const express = require('express');
const app = express();
app.use(express.json());
app.use('/api', require('./routes/auth'));
module.exports = app;
```

- [ ] **Step 4: Rodar testes (espera falhar — app.js incompleto, mas auth deve passar)**

```bash
npm test -- tests/auth.test.js
```

Expected: todos os testes de auth passando.

- [ ] **Step 5: Commit**

```bash
git add routes/auth.js tests/auth.test.js app.js
git commit -m "feat: auth routes with login and credentials update"
```

---

## Task 5: Items Routes + Tests

**Files:**
- Create: `routes/items.js`
- Create: `tests/items.test.js`

- [ ] **Step 1: Criar tests/items.test.js**

```javascript
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
```

- [ ] **Step 2: Rodar testes para confirmar que falham**

```bash
npm test -- tests/items.test.js
```

Expected: FAIL — rota `/api/items` não existe ainda.

- [ ] **Step 3: Criar routes/items.js**

```javascript
const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const items = db.prepare('SELECT * FROM list_items ORDER BY created_at').all();
  res.json(items.map(i => ({ ...i, checked: !!i.checked })));
});

router.post('/', (req, res) => {
  const { name, qty, unit } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });

  const id = randomUUID();
  db.prepare('INSERT INTO list_items (id, name, qty, unit) VALUES (?, ?, ?, ?)')
    .run(id, name, qty || 1, unit || 'un');

  const item = db.prepare('SELECT * FROM list_items WHERE id = ?').get(id);
  res.status(201).json({ ...item, checked: !!item.checked });
});

router.patch('/:id', (req, res) => {
  const item = db.prepare('SELECT id FROM list_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item não encontrado' });

  const { checked, total_paid } = req.body;
  db.prepare('UPDATE list_items SET checked = ?, total_paid = ? WHERE id = ?')
    .run(checked ? 1 : 0, total_paid ?? null, req.params.id);

  const updated = db.prepare('SELECT * FROM list_items WHERE id = ?').get(req.params.id);
  res.json({ ...updated, checked: !!updated.checked });
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM list_items WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Item não encontrado' });
  res.json({ ok: true });
});

module.exports = router;
```

- [ ] **Step 4: Atualizar app.js para incluir a rota de items**

```javascript
const express = require('express');
const app = express();
app.use(express.json());
app.use('/api', require('./routes/auth'));
app.use('/api/items', require('./routes/items'));
module.exports = app;
```

- [ ] **Step 5: Rodar testes**

```bash
npm test -- tests/items.test.js
```

Expected: todos passando.

- [ ] **Step 6: Commit**

```bash
git add routes/items.js tests/items.test.js app.js
git commit -m "feat: items CRUD routes"
```

---

## Task 6: Trips Routes + Tests

**Files:**
- Create: `routes/trips.js`
- Create: `tests/trips.test.js`

- [ ] **Step 1: Criar tests/trips.test.js**

```javascript
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
```

- [ ] **Step 2: Rodar para confirmar falha**

```bash
npm test -- tests/trips.test.js
```

Expected: FAIL — rota `/api/trips` não existe.

- [ ] **Step 3: Criar routes/trips.js**

```javascript
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
```

- [ ] **Step 4: Atualizar app.js com todas as rotas**

```javascript
const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', require('./routes/auth'));
app.use('/api/items', require('./routes/items'));
app.use('/api/trips', require('./routes/trips'));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = app;
```

- [ ] **Step 5: Rodar todos os testes**

```bash
npm test
```

Expected: todos os testes passando (auth, items, trips).

- [ ] **Step 6: Commit**

```bash
git add routes/trips.js tests/trips.test.js app.js
git commit -m "feat: trips routes with transaction-safe finish"
```

---

## Task 7: Express Entry Point

**Files:**
- Create: `server.js`

- [ ] **Step 1: Criar server.js**

```javascript
require('./db');
const app = require('./app');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
```

- [ ] **Step 2: Testar servidor localmente**

```bash
node server.js
```

Expected: `Servidor rodando na porta 3000`

Abra `http://localhost:3000` no navegador. Deve retornar 404 ou página em branco (ainda sem `public/index.html`). Ctrl+C para parar.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: server entry point"
```

---

## Task 8: Frontend — Reescrita completa

**Files:**
- Create: `public/index.html`
- Delete: `index.html` (raiz)
- Delete: `setup-supabase.sql`

- [ ] **Step 1: Criar public/index.html**

Salve o conteúdo abaixo em `public/index.html`:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <meta name="theme-color" content="#dc2626" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <title>Compras da Pizzaria</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .view { display: none; }
    .view.active { display: flex; flex-direction: column; }
    @keyframes slideUp {
      from { transform: translateY(24px); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }
    .anim { animation: slideUp 0.22s ease; }
    .modal-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.5);
      display: flex; align-items: flex-end; justify-content: center;
      z-index: 60;
    }
    .modal-overlay.hidden { display: none; }
    .modal-sheet {
      background: white; border-radius: 20px 20px 0 0;
      width: 100%; max-width: 28rem;
      padding: 24px 20px 40px;
      animation: slideUp 0.22s ease;
    }
    .item-row {
      background: white; border-radius: 14px; padding: 14px 14px;
      margin-bottom: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      transition: opacity 0.2s;
    }
    .item-row.checked { background: #f0fdf4; border-left: 4px solid #22c55e; }
    .fab {
      position: fixed; bottom: 82px; right: 20px;
      width: 58px; height: 58px; background: #dc2626; color: white;
      border-radius: 50%; border: none; font-size: 28px; cursor: pointer;
      box-shadow: 0 4px 14px rgba(220,38,38,0.4);
      display: flex; align-items: center; justify-content: center;
      transition: transform 0.12s; z-index: 40;
    }
    .fab:active { transform: scale(0.92); }
    .btn-red {
      background: #dc2626; color: white; border: none; border-radius: 12px;
      padding: 14px 20px; font-size: 16px; font-weight: 600; cursor: pointer; width: 100%;
    }
    .btn-red:active { background: #b91c1c; }
    .btn-red:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-outline {
      background: transparent; color: #dc2626; border: 2px solid #dc2626;
      border-radius: 12px; padding: 12px 20px; font-size: 16px; font-weight: 600; cursor: pointer; width: 100%;
    }
    .btn-outline:active { background: #fef2f2; }
    input[type=text], input[type=number], input[type=password], textarea, select {
      width: 100%; border: 2px solid #e5e7eb; border-radius: 10px;
      padding: 12px 14px; font-size: 16px; outline: none; transition: border-color 0.15s;
    }
    input:focus, select:focus, textarea:focus { border-color: #dc2626; }
    .bottom-nav {
      position: fixed; bottom: 0; left: 50%; transform: translateX(-50%);
      width: 100%; max-width: 28rem;
      background: white; border-top: 1px solid #f3f4f6;
      display: flex; z-index: 30;
    }
    .nav-btn {
      flex: 1; padding: 10px 4px 6px; border: none; background: transparent; cursor: pointer;
      display: flex; flex-direction: column; align-items: center; gap: 2px;
      color: #9ca3af; font-size: 11px; font-weight: 500; transition: color 0.15s;
    }
    .nav-btn.active { color: #dc2626; }
    .nav-btn svg { width: 24px; height: 24px; }
    .progress-bar { height: 6px; background: #fee2e2; border-radius: 3px; overflow: hidden; }
    .progress-fill { height: 100%; background: #22c55e; border-radius: 3px; transition: width 0.4s ease; }
    .trip-card {
      background: white; border-radius: 14px; padding: 16px; margin-bottom: 10px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08); cursor: pointer; transition: transform 0.12s;
    }
    .trip-card:active { transform: scale(0.98); }
    #loading-overlay {
      position: fixed; inset: 0; background: rgba(255,255,255,0.85);
      z-index: 80; display: flex; align-items: center; justify-content: center;
    }
    #loading-overlay.hidden { display: none; }
    .spinner {
      width: 40px; height: 40px; border: 4px solid #fee2e2;
      border-top-color: #dc2626; border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body class="bg-gray-50 min-h-screen flex flex-col max-w-md mx-auto relative">

  <!-- Loading -->
  <div id="loading-overlay" class="hidden">
    <div class="text-center">
      <div class="spinner mx-auto mb-3"></div>
      <p class="text-gray-400 text-sm">Carregando...</p>
    </div>
  </div>

  <!-- ===================== LOGIN VIEW ===================== -->
  <div id="view-login" class="view flex-1">
    <div class="bg-red-600 text-white px-5 pt-14 pb-8 text-center">
      <div class="text-5xl mb-3">🍕</div>
      <h1 class="text-2xl font-bold">Compras da Pizzaria</h1>
      <p class="text-red-200 text-sm mt-1">Entre para continuar</p>
    </div>
    <div class="px-5 pt-8 pb-10 flex-1 overflow-y-auto">
      <div class="mb-4">
        <label class="block text-sm font-semibold text-gray-600 mb-1">Usuário</label>
        <input type="text" id="login-username" placeholder="admin" autocomplete="username" />
      </div>
      <div class="mb-6">
        <label class="block text-sm font-semibold text-gray-600 mb-1">Senha</label>
        <input type="password" id="login-password" placeholder="••••••••" autocomplete="current-password" />
      </div>
      <button class="btn-red" onclick="doLogin()">Entrar</button>
      <p class="text-center text-xs text-red-500 mt-3" id="login-error"></p>
    </div>
  </div>

  <!-- ===================== HOME VIEW ===================== -->
  <div id="view-home" class="view flex-1 pb-20 overflow-y-auto">
    <div class="bg-red-600 text-white px-5 pt-12 pb-8">
      <p class="text-red-200 text-sm font-medium mb-1">Bem-vindo 👋</p>
      <h1 class="text-2xl font-bold">Compras da Pizzaria</h1>
      <p class="text-red-200 text-sm mt-1" id="home-date"></p>
    </div>
    <div class="px-5 -mt-4">
      <div id="active-list-card" class="hidden">
        <div class="bg-white rounded-2xl p-4 shadow-md mb-4 anim">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs font-semibold text-orange-600 uppercase tracking-wide">Lista ativa</span>
            <span class="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-md" id="home-items-count">0 itens</span>
          </div>
          <div class="progress-bar mb-3">
            <div class="progress-fill" id="home-progress" style="width:0%"></div>
          </div>
          <div class="flex items-baseline gap-2 mb-4">
            <span class="text-gray-500 text-sm">Total parcial:</span>
            <span class="text-2xl font-bold text-gray-800" id="home-partial-total">R$ 0,00</span>
          </div>
          <button class="btn-red" onclick="navigateTo('list')">Continuar Lista</button>
        </div>
      </div>
      <div id="no-list-card" class="hidden">
        <div class="bg-white rounded-2xl p-6 shadow-md mb-4 text-center anim">
          <div class="text-5xl mb-3">🛒</div>
          <h2 class="text-lg font-bold text-gray-800 mb-1">Nenhuma lista ativa</h2>
          <p class="text-gray-500 text-sm mb-5">Monte sua lista antes de ir ao mercado.</p>
          <button class="btn-red" onclick="createNewList()">+ Nova Lista</button>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3 mb-4">
        <div class="bg-white rounded-2xl p-4 shadow-sm text-center">
          <p class="text-2xl font-bold text-red-600" id="stat-trips">—</p>
          <p class="text-gray-500 text-xs mt-1">Idas ao mercado</p>
        </div>
        <div class="bg-white rounded-2xl p-4 shadow-sm text-center">
          <p class="text-xl font-bold text-red-600" id="stat-total">—</p>
          <p class="text-gray-500 text-xs mt-1">Total este mês</p>
        </div>
      </div>
      <div id="home-recent" class="hidden">
        <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Última compra</h3>
        <div class="trip-card" id="home-recent-trip" onclick="navigateTo('history')"></div>
      </div>
    </div>
  </div>

  <!-- ===================== LIST VIEW ===================== -->
  <div id="view-list" class="view flex-1 pb-24 overflow-y-auto">
    <div class="bg-red-600 text-white px-5 pt-12 pb-5 sticky top-0 z-20">
      <div class="flex items-center justify-between mb-3">
        <button onclick="navigateTo('home')" class="text-red-200 font-medium flex items-center gap-1 text-sm">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-4 h-4"><path d="M15 18l-6-6 6-6"/></svg>Início
        </button>
        <button onclick="openFinishModal()" id="btn-finish"
          class="bg-white text-red-600 font-bold text-sm px-4 py-2 rounded-xl">Finalizar ✓</button>
      </div>
      <h2 class="text-xl font-bold mb-2">Lista de Compras</h2>
      <div class="flex items-center gap-3">
        <div class="progress-bar flex-1">
          <div class="progress-fill" id="list-progress" style="width:0%"></div>
        </div>
        <span class="text-red-200 text-sm whitespace-nowrap" id="list-progress-text">0/0</span>
      </div>
    </div>
    <div class="px-4 pt-4">
      <div class="bg-white rounded-2xl p-4 mb-4 shadow-sm flex items-center justify-between">
        <div>
          <p class="text-xs text-gray-400 font-medium">Total marcado</p>
          <p class="text-2xl font-bold text-gray-800" id="list-total">R$ 0,00</p>
        </div>
        <div class="text-right">
          <p class="text-xs text-gray-400 font-medium">Itens</p>
          <p class="text-xl font-bold text-green-600" id="list-checked-count">0 ✓</p>
        </div>
      </div>
      <div id="items-container"></div>
      <div id="empty-list" class="text-center py-12 hidden">
        <div class="text-5xl mb-3">📝</div>
        <p class="text-gray-400 text-sm">Toque no <strong>+</strong> para adicionar itens</p>
      </div>
    </div>
    <button class="fab" onclick="openAddModal()">+</button>
  </div>

  <!-- ===================== HISTORY VIEW ===================== -->
  <div id="view-history" class="view flex-1 pb-20 overflow-y-auto">
    <div class="bg-red-600 text-white px-5 pt-12 pb-6">
      <h2 class="text-2xl font-bold">Histórico</h2>
      <p class="text-red-200 text-sm mt-1">Todas as idas ao mercado</p>
    </div>
    <div class="px-4 pt-4">
      <div id="history-list"></div>
      <div id="empty-history" class="text-center py-16 hidden">
        <div class="text-5xl mb-3">📦</div>
        <p class="text-gray-400">Nenhuma compra finalizada ainda.</p>
      </div>
    </div>
  </div>

  <!-- ===================== TRIP DETAIL VIEW ===================== -->
  <div id="view-trip" class="view flex-1 pb-20 overflow-y-auto">
    <div class="bg-red-600 text-white px-5 pt-12 pb-6 sticky top-0 z-20">
      <button onclick="navigateTo('history')" class="text-red-200 font-medium flex items-center gap-1 text-sm mb-3">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-4 h-4"><path d="M15 18l-6-6 6-6"/></svg>Histórico
      </button>
      <h2 class="text-xl font-bold" id="trip-detail-date">—</h2>
      <p class="text-red-200 text-sm" id="trip-detail-count">—</p>
    </div>
    <div class="px-4 pt-4">
      <div class="bg-red-600 rounded-2xl p-5 mb-4 text-white text-center shadow-lg">
        <p class="text-red-200 text-sm mb-1">Total gasto</p>
        <p class="text-4xl font-bold" id="trip-detail-total">R$ 0,00</p>
      </div>
      <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Itens comprados</h3>
      <div id="trip-detail-items"></div>
    </div>
  </div>

  <!-- ===================== SETTINGS VIEW ===================== -->
  <div id="view-settings" class="view flex-1 pb-20 overflow-y-auto">
    <div class="bg-red-600 text-white px-5 pt-12 pb-6">
      <h2 class="text-2xl font-bold">Configurações</h2>
    </div>
    <div class="px-5 pt-6">
      <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Alterar credenciais</h3>
      <div class="bg-white rounded-2xl p-4 shadow-sm mb-5">
        <div class="mb-4">
          <label class="block text-sm font-semibold text-gray-600 mb-1">Novo usuário</label>
          <input type="text" id="settings-username" placeholder="Deixe em branco para manter" autocomplete="off" />
        </div>
        <div class="mb-5">
          <label class="block text-sm font-semibold text-gray-600 mb-1">Nova senha</label>
          <input type="password" id="settings-password" placeholder="Deixe em branco para manter" autocomplete="new-password" />
        </div>
        <button class="btn-red" onclick="saveCredentials()">Salvar alterações</button>
        <p class="text-center text-xs text-red-500 mt-2" id="settings-error"></p>
        <p class="text-center text-xs text-green-600 mt-2 hidden" id="settings-success">Salvo com sucesso!</p>
      </div>
      <button onclick="doLogout()" class="btn-outline">Sair da conta</button>
    </div>
  </div>

  <!-- ===================== BOTTOM NAV ===================== -->
  <nav class="bottom-nav" id="bottom-nav" style="display:none">
    <button class="nav-btn" id="nav-home" onclick="navigateTo('home')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>Início
    </button>
    <button class="nav-btn" id="nav-list" onclick="navigateTo('list')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
        <line x1="8" y1="18" x2="21" y2="18"/>
        <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/>
        <line x1="3" y1="18" x2="3.01" y2="18"/>
      </svg>Lista
    </button>
    <button class="nav-btn" id="nav-history" onclick="navigateTo('history')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>Histórico
    </button>
    <button class="nav-btn" id="nav-settings" onclick="navigateTo('settings')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>Config
    </button>
  </nav>

  <!-- ===================== MODALS ===================== -->

  <!-- Add Item -->
  <div id="modal-add" class="modal-overlay hidden">
    <div class="modal-sheet">
      <div class="flex items-center justify-between mb-5">
        <h3 class="text-lg font-bold">Adicionar Item</h3>
        <button onclick="closeModal('modal-add')" class="text-gray-400 text-2xl leading-none w-8 h-8 flex items-center justify-center">&times;</button>
      </div>
      <div class="mb-4">
        <label class="block text-sm font-semibold text-gray-600 mb-1">Nome do produto</label>
        <input type="text" id="add-name" placeholder="Ex: Farinha de trigo" autocomplete="off" list="products-datalist" />
        <datalist id="products-datalist"></datalist>
      </div>
      <div class="grid grid-cols-2 gap-3 mb-5">
        <div>
          <label class="block text-sm font-semibold text-gray-600 mb-1">Quantidade</label>
          <input type="number" id="add-qty" placeholder="1" min="0.01" step="0.01" />
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-600 mb-1">Unidade</label>
          <select id="add-unit">
            <option value="un">unidade</option>
            <option value="kg">kg</option>
            <option value="g">g</option>
            <option value="L">L</option>
            <option value="ml">ml</option>
            <option value="pct">pacote</option>
            <option value="cx">caixa</option>
            <option value="dz">dúzia</option>
            <option value="fardo">fardo</option>
          </select>
        </div>
      </div>
      <button class="btn-red" onclick="addItem()">Adicionar</button>
    </div>
  </div>

  <!-- Set Price -->
  <div id="modal-price" class="modal-overlay hidden">
    <div class="modal-sheet">
      <div class="flex items-center justify-between mb-1">
        <h3 class="text-lg font-bold" id="price-modal-title">—</h3>
        <button onclick="closeModal('modal-price')" class="text-gray-400 text-2xl leading-none w-8 h-8 flex items-center justify-center">&times;</button>
      </div>
      <p class="text-sm text-gray-400 mb-5" id="price-modal-qty">—</p>
      <div class="mb-5">
        <label class="block text-sm font-semibold text-gray-600 mb-1">Preço total pago (R$)</label>
        <input type="number" id="price-input" placeholder="0,00" min="0" step="0.01" class="text-2xl font-bold text-center" />
        <p class="text-xs text-gray-400 mt-1 text-center">Valor total deste item</p>
      </div>
      <div class="flex gap-3">
        <button class="btn-outline" style="flex:1" onclick="closeModal('modal-price')">Cancelar</button>
        <button class="btn-red" style="flex:2" onclick="confirmPrice()">Confirmar ✓</button>
      </div>
    </div>
  </div>

  <!-- Finish Trip -->
  <div id="modal-finish" class="modal-overlay hidden">
    <div class="modal-sheet">
      <div class="text-center mb-5">
        <div class="text-5xl mb-3">🎉</div>
        <h3 class="text-xl font-bold text-gray-800 mb-1">Finalizar compra?</h3>
        <p class="text-gray-400 text-sm" id="finish-summary">—</p>
      </div>
      <div class="bg-gray-50 rounded-xl p-4 mb-5 text-center">
        <p class="text-gray-400 text-sm">Total da compra</p>
        <p class="text-3xl font-bold text-red-600" id="finish-total">R$ 0,00</p>
      </div>
      <div class="flex gap-3">
        <button class="btn-outline" style="flex:1" onclick="closeModal('modal-finish')">Voltar</button>
        <button class="btn-red" style="flex:2" id="btn-confirm-finish" onclick="finishTrip()">Salvar compra</button>
      </div>
    </div>
  </div>

  <!-- Delete Item -->
  <div id="modal-delete" class="modal-overlay hidden">
    <div class="modal-sheet">
      <h3 class="text-lg font-bold mb-2">Remover item?</h3>
      <p class="text-gray-400 text-sm mb-5" id="delete-item-name">—</p>
      <div class="flex gap-3">
        <button class="btn-outline" style="flex:1" onclick="closeModal('modal-delete')">Cancelar</button>
        <button class="btn-red" style="flex:2;background:#ef4444" onclick="deleteItem()">Remover</button>
      </div>
    </div>
  </div>

<script>
// ===== AUTH =====
const TOKEN_KEY = 'piz_token';
const NAMES_KEY = 'piz_names';
let knownNames = JSON.parse(localStorage.getItem(NAMES_KEY) || '[]');

function getToken() { return localStorage.getItem(TOKEN_KEY); }

async function authFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`,
      ...(options.headers || {})
    }
  });
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    navigateTo('login');
    return null;
  }
  return res;
}

async function doLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value.trim();
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  if (!username || !password) { errEl.textContent = 'Preencha todos os campos.'; return; }

  showLoading();
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'Erro ao entrar.'; return; }
    localStorage.setItem(TOKEN_KEY, data.token);
    document.getElementById('bottom-nav').style.display = 'flex';
    navigateTo('home');
  } catch {
    errEl.textContent = 'Erro de conexão.';
  } finally { hideLoading(); }
}

function doLogout() {
  localStorage.removeItem(TOKEN_KEY);
  document.getElementById('bottom-nav').style.display = 'none';
  navigateTo('login');
}

async function saveCredentials() {
  const username = document.getElementById('settings-username').value.trim();
  const password = document.getElementById('settings-password').value.trim();
  const errEl = document.getElementById('settings-error');
  const okEl  = document.getElementById('settings-success');
  errEl.textContent = '';
  okEl.classList.add('hidden');

  if (!username && !password) { errEl.textContent = 'Informe pelo menos um campo.'; return; }

  showLoading();
  try {
    const res = await authFetch('/api/credentials', {
      method: 'POST',
      body: JSON.stringify({ username: username || undefined, password: password || undefined })
    });
    if (!res) return;
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'Erro ao salvar.'; return; }
    document.getElementById('settings-username').value = '';
    document.getElementById('settings-password').value = '';
    okEl.classList.remove('hidden');
    setTimeout(() => okEl.classList.add('hidden'), 3000);
  } catch {
    errEl.textContent = 'Erro de conexão.';
  } finally { hideLoading(); }
}

// ===== STATE =====
let activeList  = [];
let trips       = [];
let priceItemId  = null;
let deleteItemId = null;
let currentView  = '';

// ===== NAVIGATION =====
function navigateTo(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const navEl = document.getElementById('nav-' + view);
  if (navEl) navEl.classList.add('active');
  const noNav = ['login'];
  document.getElementById('bottom-nav').style.display =
    noNav.includes(view) ? 'none' : 'flex';
  currentView = view;

  if (view === 'home')    loadHome();
  if (view === 'list')    loadList();
  if (view === 'history') loadHistory();
}

// ===== LOADING =====
function showLoading() { document.getElementById('loading-overlay').classList.remove('hidden'); }
function hideLoading() { document.getElementById('loading-overlay').classList.add('hidden'); }

// ===== HOME =====
async function loadHome() {
  const now = new Date();
  document.getElementById('home-date').textContent = now.toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long'
  });
  showLoading();
  try {
    const [itemsRes, tripsRes] = await Promise.all([
      authFetch('/api/items'),
      authFetch('/api/trips')
    ]);
    if (!itemsRes || !tripsRes) return;
    activeList = await itemsRes.json();
    trips      = await tripsRes.json();
    renderHome();
  } catch { showError('Erro ao carregar dados.'); } finally { hideLoading(); }
}

function renderHome() {
  const hasItems = activeList.length > 0;
  document.getElementById('active-list-card').classList.toggle('hidden', !hasItems);
  document.getElementById('no-list-card').classList.toggle('hidden', hasItems);

  if (hasItems) {
    const checked = activeList.filter(i => i.checked).length;
    const pct     = Math.round((checked / activeList.length) * 100);
    const partial = activeList.filter(i => i.checked).reduce((s, i) => s + (i.total_paid || 0), 0);
    document.getElementById('home-items-count').textContent   = activeList.length + (activeList.length === 1 ? ' item' : ' itens');
    document.getElementById('home-progress').style.width      = pct + '%';
    document.getElementById('home-partial-total').textContent = fmtBRL(partial);
  }

  const now = new Date();
  const monthTrips = trips.filter(t => {
    const d = new Date(t.finished_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  document.getElementById('stat-trips').textContent = trips.length;
  document.getElementById('stat-total').textContent = fmtBRL(monthTrips.reduce((s, t) => s + (t.grand_total || 0), 0));

  const recentEl = document.getElementById('home-recent');
  if (trips.length > 0) {
    recentEl.classList.remove('hidden');
    document.getElementById('home-recent-trip').innerHTML = tripCardHTML(trips[0]);
  } else {
    recentEl.classList.add('hidden');
  }
}

async function createNewList() {
  if (activeList.length > 0) {
    if (!confirm('Já existe uma lista ativa. Deseja descartar e criar uma nova?')) return;
    showLoading();
    for (const item of activeList) {
      await authFetch(`/api/items/${item.id}`, { method: 'DELETE' });
    }
    activeList = [];
    hideLoading();
  }
  navigateTo('list');
}

// ===== LIST =====
async function loadList() {
  showLoading();
  try {
    const res = await authFetch('/api/items');
    if (!res) return;
    activeList = await res.json();
    renderList();
  } catch { showError('Erro ao carregar lista.'); } finally { hideLoading(); }
}

function renderList() {
  const total   = activeList.filter(i => i.checked).reduce((s, i) => s + (i.total_paid || 0), 0);
  const checked = activeList.filter(i => i.checked).length;
  const n       = activeList.length;
  const pct     = n ? Math.round((checked / n) * 100) : 0;

  document.getElementById('list-total').textContent         = fmtBRL(total);
  document.getElementById('list-checked-count').textContent = checked + ' ✓';
  document.getElementById('list-progress').style.width      = pct + '%';
  document.getElementById('list-progress-text').textContent = `${checked}/${n}`;
  document.getElementById('empty-list').classList.toggle('hidden', n > 0);

  const sorted = [...activeList].sort((a, b) => a.checked - b.checked);
  document.getElementById('items-container').innerHTML = sorted.map(itemRowHTML).join('');
}

function itemRowHTML(item) {
  const icon = item.checked
    ? `<div class="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-bold">✓</div>`
    : `<div class="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center text-red-300 text-lg">○</div>`;
  const price = item.checked
    ? `<span class="text-green-600 font-bold text-sm">${fmtBRL(item.total_paid)}</span>`
    : `<span class="text-gray-300 text-sm">—</span>`;
  return `
    <div class="item-row ${item.checked ? 'checked' : ''}" onclick="openPriceModal('${item.id}')">
      <div class="flex items-center gap-3">
        ${icon}
        <div class="flex-1 min-w-0">
          <p class="font-semibold text-gray-800 truncate">${esc(item.name)}</p>
          <p class="text-xs text-gray-400">${item.qty} ${item.unit}</p>
        </div>
        <div class="text-right mr-1">${price}</div>
        <button onclick="event.stopPropagation();openDeleteModal('${item.id}')"
          class="text-gray-300 text-2xl leading-none w-8 h-8 flex items-center justify-center">×</button>
      </div>
    </div>`;
}

// ===== ADD ITEM =====
function openAddModal() {
  document.getElementById('add-name').value = '';
  document.getElementById('add-qty').value  = '1';
  document.getElementById('add-unit').value = 'un';
  document.getElementById('products-datalist').innerHTML =
    knownNames.map(n => `<option value="${esc(n)}">`).join('');
  openModal('modal-add');
  setTimeout(() => document.getElementById('add-name').focus(), 300);
}

async function addItem() {
  const name = document.getElementById('add-name').value.trim();
  const qty  = parseFloat(document.getElementById('add-qty').value) || 1;
  const unit = document.getElementById('add-unit').value;
  if (!name) { document.getElementById('add-name').focus(); return; }

  closeModal('modal-add');
  showLoading();
  try {
    const res = await authFetch('/api/items', {
      method: 'POST',
      body: JSON.stringify({ name, qty, unit })
    });
    if (!res) return;
    const item = await res.json();
    activeList.push(item);
    if (!knownNames.includes(name)) {
      knownNames.push(name);
      localStorage.setItem(NAMES_KEY, JSON.stringify(knownNames));
    }
    renderList();
  } catch { showError('Erro ao adicionar item.'); } finally { hideLoading(); }
}

// ===== PRICE MODAL =====
function openPriceModal(id) {
  const item = activeList.find(i => i.id === id);
  if (!item) return;
  priceItemId = id;
  document.getElementById('price-modal-title').textContent = item.name;
  document.getElementById('price-modal-qty').textContent   = `Quantidade: ${item.qty} ${item.unit}`;
  document.getElementById('price-input').value             = item.total_paid || '';
  openModal('modal-price');
  setTimeout(() => document.getElementById('price-input').select(), 300);
}

async function confirmPrice() {
  const val = parseFloat(document.getElementById('price-input').value);
  if (isNaN(val) || val < 0) { document.getElementById('price-input').focus(); return; }
  closeModal('modal-price');
  showLoading();
  try {
    const res = await authFetch(`/api/items/${priceItemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ checked: true, total_paid: val })
    });
    if (!res) return;
    const updated = await res.json();
    const idx = activeList.findIndex(i => i.id === priceItemId);
    if (idx !== -1) activeList[idx] = updated;
    renderList();
  } catch { showError('Erro ao salvar preço.'); } finally { hideLoading(); }
}

// ===== DELETE ITEM =====
function openDeleteModal(id) {
  const item = activeList.find(i => i.id === id);
  if (!item) return;
  deleteItemId = id;
  document.getElementById('delete-item-name').textContent = `"${item.name}" será removido da lista.`;
  openModal('modal-delete');
}

async function deleteItem() {
  closeModal('modal-delete');
  showLoading();
  try {
    const res = await authFetch(`/api/items/${deleteItemId}`, { method: 'DELETE' });
    if (!res) return;
    activeList = activeList.filter(i => i.id !== deleteItemId);
    renderList();
  } catch { showError('Erro ao remover item.'); } finally { hideLoading(); }
}

// ===== FINISH TRIP =====
function openFinishModal() {
  if (activeList.length === 0) return;
  const checked = activeList.filter(i => i.checked).length;
  const total   = activeList.filter(i => i.checked).reduce((s, i) => s + (i.total_paid || 0), 0);
  const n = activeList.length;
  document.getElementById('finish-summary').textContent =
    `${checked} de ${n} ite${n > 1 ? 'ns' : 'm'} marcado${checked !== 1 ? 's' : ''}`;
  document.getElementById('finish-total').textContent = fmtBRL(total);
  openModal('modal-finish');
}

async function finishTrip() {
  document.getElementById('btn-confirm-finish').disabled = true;
  try {
    const res = await authFetch('/api/trips', { method: 'POST' });
    if (!res) return;
    if (!res.ok) { showError('Nenhum item marcado para finalizar.'); return; }
    activeList = [];
    closeModal('modal-finish');
    navigateTo('history');
  } catch {
    showError('Erro ao finalizar compra.');
  } finally {
    document.getElementById('btn-confirm-finish').disabled = false;
  }
}

// ===== HISTORY =====
async function loadHistory() {
  showLoading();
  try {
    const res = await authFetch('/api/trips');
    if (!res) return;
    trips = await res.json();
    renderHistory();
  } catch { showError('Erro ao carregar histórico.'); } finally { hideLoading(); }
}

function renderHistory() {
  const emptyEl = document.getElementById('empty-history');
  if (trips.length === 0) {
    emptyEl.classList.remove('hidden');
    document.getElementById('history-list').innerHTML = '';
    return;
  }
  emptyEl.classList.add('hidden');
  document.getElementById('history-list').innerHTML = trips.map(t => `
    <div class="trip-card anim" onclick="openTrip('${t.id}')">
      ${tripCardHTML(t)}
    </div>
  `).join('');
}

function tripCardHTML(t) {
  const d = new Date(t.finished_at);
  const dateStr = d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
  return `
    <div class="flex items-center justify-between">
      <div>
        <p class="font-semibold text-gray-800">${dateStr}</p>
        <p class="text-xs text-gray-400 mt-0.5">${fmtBRL(t.grand_total)}</p>
      </div>
      <svg class="w-5 h-5 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 18l6-6-6-6"/>
      </svg>
    </div>`;
}

async function openTrip(id) {
  showLoading();
  try {
    const res = await authFetch(`/api/trips/${id}`);
    if (!res) return;
    const trip = await res.json();
    hideLoading();

    const d = new Date(trip.finished_at);
    const dateStr = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    document.getElementById('trip-detail-date').textContent  = dateStr;
    document.getElementById('trip-detail-count').textContent = `${trip.items.length} ite${trip.items.length !== 1 ? 'ns' : 'm'}`;
    document.getElementById('trip-detail-total').textContent = fmtBRL(trip.grand_total);
    document.getElementById('trip-detail-items').innerHTML   = (trip.items || []).map(i => `
      <div class="bg-white rounded-xl p-4 mb-2 shadow-sm flex items-center justify-between">
        <div>
          <p class="font-semibold text-gray-800">${esc(i.name)}</p>
          <p class="text-xs text-gray-400">${i.qty} ${i.unit}</p>
        </div>
        <p class="text-lg font-bold text-gray-700">${fmtBRL(i.total_paid)}</p>
      </div>
    `).join('') || '<p class="text-center text-gray-400 py-4">Nenhum item registrado.</p>';

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-trip').classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    currentView = 'trip';
  } catch { hideLoading(); showError('Erro ao carregar compra.'); }
}

// ===== MODAL HELPERS =====
function openModal(id)  { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) o.classList.add('hidden'); });
});

// ===== KEYBOARD =====
document.getElementById('add-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('add-qty').focus();
});
document.getElementById('add-qty').addEventListener('keydown', e => {
  if (e.key === 'Enter') addItem();
});
document.getElementById('price-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') confirmPrice();
});
document.getElementById('login-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') doLogin();
});

// ===== UTILS =====
function fmtBRL(val) {
  return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function showError(msg) { alert(msg); }

// ===== INIT =====
if (getToken()) {
  document.getElementById('bottom-nav').style.display = 'flex';
  navigateTo('home');
} else {
  navigateTo('login');
}
</script>
</body>
</html>
```

- [ ] **Step 2: Remover arquivos antigos**

```bash
rm index.html setup-supabase.sql
```

- [ ] **Step 3: Testar localmente**

```bash
node server.js
```

Abra `http://localhost:3000`. Deve aparecer a tela de login. Entre com `admin` / `pizza123`. Verifique:
- Login funciona e redireciona para Home
- Consegue adicionar item na lista
- Consegue marcar item com preço
- Consegue finalizar compra e ver no histórico
- Configurações permite trocar usuário/senha
- Logout funciona

Ctrl+C para parar.

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat: rewrite frontend with login, settings, and fetch-based API calls"
```

---

## Task 9: Railway Deploy

- [ ] **Step 1: Criar repositório no GitHub**

Acesse github.com → New repository → nome: `pizzaria-compras` → Create repository

- [ ] **Step 2: Subir código**

```bash
git remote add origin https://github.com/SEU_USUARIO/pizzaria-compras.git
git branch -M main
git push -u origin main
```

- [ ] **Step 3: Conectar ao Railway**

1. Acesse railway.app → New Project
2. Clique em **Deploy from GitHub repo**
3. Selecione o repositório `pizzaria-compras`
4. Railway detecta Node.js automaticamente e faz o deploy

- [ ] **Step 4: Configurar volume persistente para o SQLite**

No Railway, após o deploy:
1. Clique no serviço → **Settings** → **Volumes**
2. Clique em **Add Volume**
3. Mount path: `/app/data`
4. Clique em **Add**
5. O serviço reinicia automaticamente

Sem isso, o banco de dados é apagado a cada deploy.

- [ ] **Step 5: Verificar URL pública**

No Railway, clique em **Settings** → **Networking** → **Generate Domain**.

Acesse a URL gerada no celular. Faça login com `admin` / `pizza123` e teste o app completo.

- [ ] **Step 6: Trocar a senha padrão**

Vá em Configurações → troque o usuário e a senha para algo seguro.
