# Melhorias UI + Novas Funcionalidades — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar 9 funcionalidades ao app: categorias, analytics, compras avulsas, nome do mercado, edição/exclusão de trips, unidade do estoque na lista, seleção em massa no template, paleta de cores e manual de ajuda.

**Architecture:** Backend Express/SQLite recebe novas rotas (`/api/analytics`, `/api/avulsas`) e updates nas existentes (trips PATCH/DELETE, category em template/stock). Toda a UI fica no único arquivo `public/index.html` — mudanças são feitas por seção (CSS, HTML por view, JS por feature). Migrações seguras via `safeAlter()` preservam dados existentes.

**Tech Stack:** Node.js + Express + better-sqlite3, HTML/JS vanilla + Tailwind CSS CDN, Jest + supertest para testes.

---

## Mapa de arquivos

| Arquivo | Ação | O que muda |
|---------|------|------------|
| `db.js` | Modify | Migrações `safeAlter`, novas colunas, tabela `avulsas` |
| `routes/trips.js` | Modify | `store_name` no POST, novos PATCH e DELETE |
| `routes/template.js` | Modify | Campo `category` em POST e PATCH |
| `routes/stock.js` | Modify | Campo `category` em POST e PATCH |
| `routes/analytics.js` | Create | GET `/api/analytics?month=YYYY-MM` |
| `routes/avulsas.js` | Create | GET / POST / DELETE `/api/avulsas` |
| `app.js` | Modify | Registrar as duas novas rotas |
| `tests/trips.test.js` | Modify | Testes para store_name, PATCH, DELETE |
| `tests/template.test.js` | Modify | Testes para campo category |
| `tests/stock.test.js` | Modify | Testes para campo category |
| `tests/analytics.test.js` | Create | Testes para a rota analytics |
| `tests/avulsas.test.js` | Create | Testes CRUD para avulsas |
| `public/index.html` | Modify | CSS, todos os views, toda a lógica JS |

---

## Task 1: DB — Migrações seguras

**Files:**
- Modify: `db.js`

- [ ] **Passo 1: Substituir o bloco `db.exec` e adicionar `safeAlter`**

Abra `db.js`. Substitua o `db.exec(...)` inteiro e o bloco de seed por:

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
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS credentials (
    id      INTEGER PRIMARY KEY CHECK (id = 1),
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
    store_name  TEXT NOT NULL DEFAULT '',
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

  CREATE TABLE IF NOT EXISTS template_items (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    qty        REAL NOT NULL DEFAULT 1,
    unit       TEXT NOT NULL DEFAULT 'un',
    category   TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS stock_items (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    qty        REAL NOT NULL DEFAULT 0,
    unit       TEXT NOT NULL DEFAULT 'un',
    category   TEXT NOT NULL DEFAULT '',
    min_qty    REAL NOT NULL DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS avulsas (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    qty          REAL NOT NULL DEFAULT 1,
    unit         TEXT NOT NULL DEFAULT 'un',
    category     TEXT NOT NULL DEFAULT '',
    total_paid   REAL NOT NULL DEFAULT 0,
    store_name   TEXT NOT NULL DEFAULT '',
    purchased_at TEXT DEFAULT (datetime('now'))
  );
`);

// Safe migrations for existing production databases
function safeAlter(sql) {
  try { db.exec(sql); } catch (e) {
    if (!e.message.includes('duplicate column name')) throw e;
  }
}
safeAlter("ALTER TABLE template_items ADD COLUMN category TEXT NOT NULL DEFAULT ''");
safeAlter("ALTER TABLE stock_items ADD COLUMN category TEXT NOT NULL DEFAULT ''");
safeAlter("ALTER TABLE trips ADD COLUMN store_name TEXT NOT NULL DEFAULT ''");

const existing = db.prepare('SELECT id FROM credentials WHERE id = 1').get();
if (!existing) {
  const hash = bcrypt.hashSync('pizza123', 10);
  db.prepare('INSERT INTO credentials (id, username, password_hash) VALUES (1, ?, ?)').run('admin', hash);
}

module.exports = db;
```

- [ ] **Passo 2: Rodar os testes para confirmar que o DB não quebrou**

```
npm test
```

Expected: todos os testes existentes passam.

- [ ] **Passo 3: Commit**

```
git add db.js
git commit -m "feat: add category, store_name columns and avulsas table migrations"
```

---

## Task 2: Route — Analytics

**Files:**
- Create: `routes/analytics.js`
- Create: `tests/analytics.test.js`

- [ ] **Passo 1: Escrever o teste**

Crie `tests/analytics.test.js`:

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

function auth() { return { Authorization: `Bearer ${token}` }; }

async function createTrip(store_name, total) {
  const db = require('../db');
  const { randomUUID } = require('crypto');
  const tripId = randomUUID();
  db.prepare('INSERT INTO trips (id, grand_total, store_name, finished_at) VALUES (?, ?, ?, datetime(\'now\'))')
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
```

- [ ] **Passo 2: Rodar o teste para confirmar que falha**

```
npx jest analytics --no-coverage
```

Expected: FAIL — route not found / 404.

- [ ] **Passo 3: Criar a rota**

Crie `routes/analytics.js`:

```javascript
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
```

- [ ] **Passo 4: Registrar rota em `app.js`**

Adicione antes da linha `app.get('*', ...)`:

```javascript
app.use('/api/analytics', require('./routes/analytics'));
```

- [ ] **Passo 5: Rodar o teste**

```
npx jest analytics --no-coverage
```

Expected: PASS — 3 testes passando.

- [ ] **Passo 6: Commit**

```
git add routes/analytics.js tests/analytics.test.js app.js
git commit -m "feat: add analytics route with monthly totals and top products"
```

---

## Task 3: Route — Avulsas

**Files:**
- Create: `routes/avulsas.js`
- Create: `tests/avulsas.test.js`

- [ ] **Passo 1: Escrever os testes**

Crie `tests/avulsas.test.js`:

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
```

- [ ] **Passo 2: Rodar o teste para confirmar que falha**

```
npx jest avulsas --no-coverage
```

Expected: FAIL.

- [ ] **Passo 3: Criar a rota**

Crie `routes/avulsas.js`:

```javascript
const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM avulsas ORDER BY purchased_at DESC').all());
});

router.post('/', (req, res) => {
  const { name, qty, unit, category, total_paid, store_name } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });

  const id = randomUUID();
  db.prepare(
    'INSERT INTO avulsas (id, name, qty, unit, category, total_paid, store_name) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, name, qty ?? 1, unit || 'un', category || '', total_paid ?? 0, store_name || '');

  res.status(201).json(db.prepare('SELECT * FROM avulsas WHERE id = ?').get(id));
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM avulsas WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Compra não encontrada' });
  res.json({ ok: true });
});

module.exports = router;
```

- [ ] **Passo 4: Registrar rota em `app.js`**

Após a linha do analytics, adicione:

```javascript
app.use('/api/avulsas', require('./routes/avulsas'));
```

- [ ] **Passo 5: Rodar o teste**

```
npx jest avulsas --no-coverage
```

Expected: PASS — 6 testes passando.

- [ ] **Passo 6: Commit**

```
git add routes/avulsas.js tests/avulsas.test.js app.js
git commit -m "feat: add avulsas route with CRUD endpoints"
```

---

## Task 4: Route — Trips: store_name, PATCH, DELETE

**Files:**
- Modify: `routes/trips.js`
- Modify: `tests/trips.test.js`

- [ ] **Passo 1: Adicionar testes ao final de `tests/trips.test.js`**

Adicione ao final do arquivo:

```javascript
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
```

- [ ] **Passo 2: Rodar os novos testes para confirmar que falham**

```
npx jest trips --no-coverage
```

Expected: os 3 novos describes falham, os anteriores passam.

- [ ] **Passo 3: Reescrever `routes/trips.js`**

Substitua o conteúdo inteiro por:

```javascript
const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM trips ORDER BY finished_at DESC').all());
});

router.post('/', (req, res) => {
  const { store_name = '' } = req.body || {};
  const checked = db.prepare('SELECT * FROM list_items WHERE checked = 1').all();
  if (checked.length === 0) return res.status(400).json({ error: 'Nenhum item marcado' });

  const grandTotal = checked.reduce((s, i) => s + (i.total_paid || 0), 0);
  const tripId = randomUUID();

  const insertTrip  = db.prepare('INSERT INTO trips (id, grand_total, store_name) VALUES (?, ?, ?)');
  const insertItem  = db.prepare(
    'INSERT INTO trip_items (id, trip_id, name, qty, unit, total_paid) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const clearList   = db.prepare('DELETE FROM list_items');
  const updateStock = db.prepare(
    "UPDATE stock_items SET qty = qty + ?, updated_at = datetime('now') WHERE LOWER(name) = LOWER(?)"
  );

  db.transaction(() => {
    insertTrip.run(tripId, grandTotal, store_name);
    for (const item of checked) {
      insertItem.run(randomUUID(), tripId, item.name, item.qty, item.unit, item.total_paid);
      updateStock.run(item.qty, item.name);
    }
    clearList.run();
  })();

  res.status(201).json(db.prepare('SELECT * FROM trips WHERE id = ?').get(tripId));
});

router.patch('/:id', (req, res) => {
  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Compra não encontrada' });

  const updates = {};
  if (req.body.store_name  !== undefined) updates.store_name  = req.body.store_name;
  if (req.body.finished_at !== undefined) updates.finished_at = req.body.finished_at;

  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE trips SET ${setClauses} WHERE id = ?`)
    .run(...Object.values(updates), req.params.id);

  res.json(db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM trips WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Compra não encontrada' });
  res.json({ ok: true });
});

router.get('/:id', (req, res) => {
  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Compra não encontrada' });
  const items = db.prepare('SELECT * FROM trip_items WHERE trip_id = ? ORDER BY name').all(req.params.id);
  res.json({ ...trip, items });
});

module.exports = router;
```

- [ ] **Passo 4: Rodar todos os testes de trips**

```
npx jest trips --no-coverage
```

Expected: PASS — todos passam.

- [ ] **Passo 5: Commit**

```
git add routes/trips.js tests/trips.test.js
git commit -m "feat: add store_name to trips, PATCH and DELETE endpoints"
```

---

## Task 5: Route — Template: campo category

**Files:**
- Modify: `routes/template.js`
- Modify: `tests/template.test.js`

- [ ] **Passo 1: Adicionar testes ao final de `tests/template.test.js`**

```javascript
describe('POST /api/template with category', () => {
  it('saves category when provided', async () => {
    const res = await request(app).post('/api/template').set(auth())
      .send({ name: 'Picanha', qty: 1, unit: 'kg', category: 'carne' });
    expect(res.status).toBe(201);
    expect(res.body.category).toBe('carne');
  });

  it('defaults category to empty string', async () => {
    const res = await request(app).post('/api/template').set(auth())
      .send({ name: 'Farinha', qty: 1, unit: 'kg' });
    expect(res.status).toBe(201);
    expect(res.body.category).toBe('');
  });
});

describe('PATCH /api/template/:id with category', () => {
  it('updates category', async () => {
    const { body: item } = await request(app).post('/api/template').set(auth())
      .send({ name: 'Leite', qty: 1, unit: 'L' });
    const res = await request(app).patch(`/api/template/${item.id}`).set(auth())
      .send({ category: 'laticinios' });
    expect(res.status).toBe(200);
    expect(res.body.category).toBe('laticinios');
  });
});
```

- [ ] **Passo 2: Rodar para confirmar que os novos testes falham**

```
npx jest template --no-coverage
```

Expected: 2 novos testes falham.

- [ ] **Passo 3: Atualizar `routes/template.js`**

Substitua o conteúdo inteiro por:

```javascript
const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM template_items ORDER BY sort_order').all());
});

router.post('/', (req, res) => {
  const { name, qty, unit, category = '' } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });

  const id = randomUUID();
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM template_items').get().m;
  db.prepare(
    'INSERT INTO template_items (id, name, qty, unit, category, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, name, qty || 1, unit || 'un', category, maxOrder + 1);

  res.status(201).json(db.prepare('SELECT * FROM template_items WHERE id = ?').get(id));
});

router.patch('/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM template_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item não encontrado' });

  const updates = {};
  if (req.body.name     !== undefined) updates.name     = req.body.name;
  if (req.body.qty      !== undefined) updates.qty      = req.body.qty;
  if (req.body.unit     !== undefined) updates.unit     = req.body.unit;
  if (req.body.category !== undefined) updates.category = req.body.category;

  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE template_items SET ${setClauses} WHERE id = ?`)
    .run(...Object.values(updates), req.params.id);

  res.json(db.prepare('SELECT * FROM template_items WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM template_items WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Item não encontrado' });
  res.json({ ok: true });
});

module.exports = router;
```

- [ ] **Passo 4: Rodar todos os testes de template**

```
npx jest template --no-coverage
```

Expected: PASS — todos passam.

- [ ] **Passo 5: Commit**

```
git add routes/template.js tests/template.test.js
git commit -m "feat: add category field to template items"
```

---

## Task 6: Route — Stock: campo category

**Files:**
- Modify: `routes/stock.js`
- Modify: `tests/stock.test.js`

- [ ] **Passo 1: Adicionar testes ao final de `tests/stock.test.js`**

```javascript
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
```

- [ ] **Passo 2: Rodar para confirmar que os novos testes falham**

```
npx jest stock --no-coverage
```

Expected: 2 novos testes falham.

- [ ] **Passo 3: Atualizar `routes/stock.js`**

Substitua o conteúdo inteiro por:

```javascript
const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM stock_items ORDER BY name COLLATE NOCASE').all());
});

router.post('/', (req, res) => {
  const { name, qty, unit, min_qty, category = '' } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });

  const id = randomUUID();
  db.prepare(
    'INSERT INTO stock_items (id, name, qty, unit, category, min_qty) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, name, qty ?? 0, unit || 'un', category, min_qty ?? 0);

  res.status(201).json(db.prepare('SELECT * FROM stock_items WHERE id = ?').get(id));
});

router.patch('/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM stock_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item não encontrado' });

  const updates = {};
  if (req.body.name     !== undefined) updates.name     = req.body.name;
  if (req.body.qty      !== undefined) updates.qty      = req.body.qty;
  if (req.body.unit     !== undefined) updates.unit     = req.body.unit;
  if (req.body.min_qty  !== undefined) updates.min_qty  = req.body.min_qty;
  if (req.body.category !== undefined) updates.category = req.body.category;

  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(
    `UPDATE stock_items SET ${setClauses}, updated_at = datetime('now') WHERE id = ?`
  ).run(...Object.values(updates), req.params.id);

  res.json(db.prepare('SELECT * FROM stock_items WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM stock_items WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Item não encontrado' });
  res.json({ ok: true });
});

module.exports = router;
```

- [ ] **Passo 4: Rodar os testes**

```
npx jest stock --no-coverage
```

Expected: PASS — todos passam.

- [ ] **Passo 5: Rodar a suite completa**

```
npm test
```

Expected: PASS — todos os testes passam.

- [ ] **Passo 6: Commit**

```
git add routes/stock.js tests/stock.test.js
git commit -m "feat: add category field to stock items"
```

---

## Task 7: Frontend — CSS e paleta de cores

**Files:**
- Modify: `public/index.html` (seção `<style>` e tag `<body>`)

- [ ] **Passo 1: Mudar o fundo do body**

Localize a tag `<body>`:
```html
<body class="bg-gray-50 min-h-screen flex flex-col max-w-md mx-auto relative">
```

Substitua por:
```html
<body class="min-h-screen flex flex-col max-w-md mx-auto relative" style="background:#faf7f3">
```

- [ ] **Passo 2: Adicionar as novas classes CSS ao final da tag `<style>`**

Localize o fechamento `}` antes de `</style>` e adicione antes dele:

```css
    /* Category item borders */
    .item-row.cat-carne      { border-left: 4px solid #f97316; }
    .item-row.cat-laticinios { border-left: 4px solid #0ea5e9; }
    .item-row.cat-doces      { border-left: 4px solid #ec4899; }
    .item-row.cat-outros     { border-left: 4px solid #64748b; }

    /* Category filter chips */
    .cat-chip {
      padding: 5px 14px; border-radius: 20px; font-size: 13px; font-weight: 600;
      white-space: nowrap; border: 1.5px solid; cursor: pointer; flex-shrink: 0;
      transition: background 0.15s, color 0.15s;
    }

    /* Avulsas purple button */
    .btn-purple {
      background: #7c3aed; color: white; border: none; border-radius: 12px;
      padding: 14px 20px; font-size: 16px; font-weight: 600; cursor: pointer; width: 100%;
    }
    .btn-purple:active { background: #6d28d9; }

    /* Purple nav active */
    #nav-avulsas.active { color: #7c3aed; }

    /* Disable scroll on bottom nav when there are 6 items */
    .bottom-nav { overflow-x: auto; }
```

- [ ] **Passo 3: Verificar no browser**

Inicie o servidor:
```
node server.js
```

Acesse `http://localhost:3000`. O fundo deve ser bege quente `#faf7f3` em vez de branco/cinza.

- [ ] **Passo 4: Commit**

```
git add public/index.html
git commit -m "feat: update color theme with warm background and category color system"
```

---

## Task 8: Frontend — Template: categoria, filtros e selecionar tudo

**Files:**
- Modify: `public/index.html`

### 8A — Adicionar campo category nos modais de template

- [ ] **Passo 1: Modal "Adicionar à Lista Padrão" — adicionar select de categoria**

Localize no modal `modal-add-template`:
```html
      <button class="btn-red" onclick="addTemplateItem()">Adicionar</button>
```

Adicione o select de categoria ANTES desse botão:

```html
      <div class="mb-5">
        <label class="block text-sm font-semibold text-gray-600 mb-1">Categoria</label>
        <select id="tmpl-add-category">
          <option value="">Sem categoria</option>
          <option value="carne">Carne</option>
          <option value="laticinios">Laticínios</option>
          <option value="doces">Doces</option>
          <option value="outros">Outros</option>
        </select>
      </div>
```

- [ ] **Passo 2: Modal "Editar Item" — adicionar select de categoria**

Localize no modal `modal-edit-template`:
```html
      <button class="btn-red" onclick="saveTemplateEdit()">Salvar</button>
```

Adicione o select ANTES desse botão:

```html
      <div class="mb-5">
        <label class="block text-sm font-semibold text-gray-600 mb-1">Categoria</label>
        <select id="tmpl-edit-category">
          <option value="">Sem categoria</option>
          <option value="carne">Carne</option>
          <option value="laticinios">Laticínios</option>
          <option value="doces">Doces</option>
          <option value="outros">Outros</option>
        </select>
      </div>
```

### 8B — Adicionar filtros e "Selecionar tudo" ao view-template

- [ ] **Passo 3: Adicionar chips de categoria e botão "Selecionar tudo"**

Localize no `view-template` a div de px-4:
```html
    <div class="px-4 pt-4">
      <div id="template-container"></div>
```

Substitua por:

```html
    <div class="px-4 pt-4">
      <!-- Filtros de categoria (apenas modo seleção) -->
      <div id="template-filters" class="hidden flex gap-2 overflow-x-auto pb-2 mb-3">
        <button class="cat-chip" data-cat="" onclick="setTemplateFilter('')">Todos</button>
        <button class="cat-chip" data-cat="carne" onclick="setTemplateFilter('carne')">🥩 Carne</button>
        <button class="cat-chip" data-cat="laticinios" onclick="setTemplateFilter('laticinios')">🥛 Laticínios</button>
        <button class="cat-chip" data-cat="doces" onclick="setTemplateFilter('doces')">🍬 Doces</button>
        <button class="cat-chip" data-cat="outros" onclick="setTemplateFilter('outros')">📦 Outros</button>
      </div>
      <div id="template-container"></div>
```

- [ ] **Passo 4: Adicionar "Selecionar tudo" ao footer do template**

Localize `template-select-footer`:
```html
    <div id="template-select-footer" class="hidden" style="position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:28rem;padding:16px 16px 32px;background:white;border-top:1px solid #f3f4f6;z-index:40;">
      <button class="btn-red" onclick="confirmTemplateSelect()" id="btn-confirm-template">
        Adicionar 0 itens à lista
      </button>
    </div>
```

Substitua por:

```html
    <div id="template-select-footer" class="hidden" style="position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:28rem;padding:12px 16px 32px;background:white;border-top:1px solid #f3f4f6;z-index:40;">
      <button onclick="toggleSelectAll()" id="btn-select-all"
        class="w-full mb-2 py-2.5 rounded-xl text-sm font-semibold text-gray-600 bg-gray-100 border border-gray-200">
        Selecionar tudo
      </button>
      <button class="btn-red" onclick="confirmTemplateSelect()" id="btn-confirm-template">
        Adicionar 0 itens à lista
      </button>
    </div>
```

### 8C — Atualizar JavaScript do template

- [ ] **Passo 5: Adicionar estado de filtro e constantes de cores**

Localize no bloco JS:
```javascript
let templateList = [];
let templateEditMode = false;
let templateChecked = new Set();
let editTemplateItemId = null;
```

Substitua por:

```javascript
let templateList = [];
let templateEditMode = false;
let templateChecked = new Set();
let editTemplateItemId = null;
let templateCategoryFilter = '';

const CAT_CHIP_ACTIVE = {
  '':          { bg: '#1e293b', color: '#fff', border: '#1e293b' },
  'carne':     { bg: '#f97316', color: '#fff', border: '#f97316' },
  'laticinios':{ bg: '#0ea5e9', color: '#fff', border: '#0ea5e9' },
  'doces':     { bg: '#ec4899', color: '#fff', border: '#ec4899' },
  'outros':    { bg: '#64748b', color: '#fff', border: '#64748b' },
};
const CAT_CHIP_INACTIVE = {
  '':          { bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' },
  'carne':     { bg: '#fff7ed', color: '#ea580c', border: '#fed7aa' },
  'laticinios':{ bg: '#f0f9ff', color: '#0284c7', border: '#bae6fd' },
  'doces':     { bg: '#fdf2f8', color: '#db2777', border: '#fbcfe8' },
  'outros':    { bg: '#f8fafc', color: '#475569', border: '#e2e8f0' },
};
```

- [ ] **Passo 6: Adicionar `setTemplateFilter()` e `toggleSelectAll()`**

Após a função `updateTemplateFooterCount()`, adicione:

```javascript
function setTemplateFilter(cat) {
  templateCategoryFilter = cat;
  document.querySelectorAll('#template-filters .cat-chip').forEach(btn => {
    const chipCat = btn.dataset.cat;
    const isActive = chipCat === cat;
    const c = isActive ? CAT_CHIP_ACTIVE[chipCat] : CAT_CHIP_INACTIVE[chipCat];
    if (c) { btn.style.background = c.bg; btn.style.color = c.color; btn.style.borderColor = c.border; }
  });
  renderTemplate();
}

function toggleSelectAll() {
  const visibleItems = templateCategoryFilter
    ? templateList.filter(i => (i.category || 'outros') === templateCategoryFilter)
    : templateList;
  const visibleIds = visibleItems.map(i => i.id);
  const allSelected = visibleIds.every(id => templateChecked.has(id));
  visibleIds.forEach(id => allSelected ? templateChecked.delete(id) : templateChecked.add(id));
  document.getElementById('btn-select-all').textContent = allSelected ? 'Selecionar tudo' : 'Desmarcar tudo';
  renderTemplate();
}
```

- [ ] **Passo 7: Atualizar `renderTemplate()` para mostrar filtros, chips e bordas de categoria**

Substitua a função `renderTemplate()` inteira por:

```javascript
function renderTemplate() {
  const emptyEl  = document.getElementById('empty-template');
  const footer   = document.getElementById('template-select-footer');
  const fab      = document.getElementById('template-fab');
  const editBtn  = document.getElementById('template-edit-btn');
  const title    = document.getElementById('template-view-title');
  const subtitle = document.getElementById('template-view-subtitle');
  const filtersEl = document.getElementById('template-filters');

  emptyEl.classList.toggle('hidden', templateList.length > 0);

  if (templateEditMode) {
    footer.classList.add('hidden');
    fab.classList.remove('hidden');
    filtersEl.classList.add('hidden');
    editBtn.textContent  = 'Concluir';
    title.textContent    = 'Editar Lista Padrão';
    subtitle.textContent = 'Adicione, edite ou remova itens';
  } else {
    footer.classList.toggle('hidden', templateList.length === 0);
    fab.classList.add('hidden');
    filtersEl.classList.toggle('hidden', templateList.length === 0);
    editBtn.textContent  = 'Editar lista';
    title.textContent    = 'Lista Padrão';
    subtitle.textContent = 'Selecione os itens para esta compra';
    setTemplateFilter(templateCategoryFilter);
    updateTemplateFooterCount();
  }

  const visibleItems = (!templateEditMode && templateCategoryFilter)
    ? templateList.filter(i => (i.category || 'outros') === templateCategoryFilter)
    : templateList;

  document.getElementById('template-container').innerHTML = visibleItems.map(item => {
    if (templateEditMode) {
      const catLabel = { carne: 'Carne', laticinios: 'Laticínios', doces: 'Doces', outros: 'Outros' }[item.category] || '';
      return `
        <div class="item-row ${item.category ? 'cat-' + item.category : ''} flex items-center gap-3" onclick="openEditTemplateModal('${item.id}')">
          <div class="flex-1 min-w-0">
            <p class="font-semibold text-gray-800 truncate">${esc(item.name)}</p>
            <p class="text-xs text-gray-400">${item.qty} ${item.unit}${catLabel ? ' · ' + catLabel : ''}</p>
          </div>
          <button onclick="event.stopPropagation();deleteTemplateItem('${item.id}')"
            class="text-gray-300 text-2xl leading-none w-8 h-8 flex items-center justify-center">×</button>
        </div>`;
    }
    const checked = templateChecked.has(item.id);
    return `
      <div class="item-row ${checked ? 'checked' : (item.category ? 'cat-' + item.category : '')}" onclick="toggleTemplateItem('${item.id}')">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0
            ${checked ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-300'}">
            ${checked ? '✓' : '○'}
          </div>
          <div class="flex-1 min-w-0">
            <p class="font-semibold text-gray-800 truncate">${esc(item.name)}</p>
            <p class="text-xs text-gray-400">${item.qty} ${item.unit}</p>
          </div>
        </div>
      </div>`;
  }).join('');
}
```

- [ ] **Passo 8: Atualizar `addTemplateItem()` para ler category**

Localize `async function addTemplateItem()`. Substitua a linha `const { name, qty, unit } = ...` por:

```javascript
async function addTemplateItem() {
  const name     = document.getElementById('tmpl-add-name').value.trim();
  const qty      = parseFloat(document.getElementById('tmpl-add-qty').value) || 1;
  const unit     = document.getElementById('tmpl-add-unit').value;
  const category = document.getElementById('tmpl-add-category').value;
  if (!name) { document.getElementById('tmpl-add-name').focus(); return; }

  closeModal('modal-add-template');
  showLoading();
  try {
    const res = await authFetch('/api/template', {
      method: 'POST',
      body: JSON.stringify({ name, qty, unit, category })
    });
    if (!res) return;
    const item = await res.json();
    templateList.push(item);
    renderTemplate();
  } catch { showError('Erro ao adicionar item.'); } finally { hideLoading(); }
}
```

- [ ] **Passo 9: Atualizar `openEditTemplateModal()` para preencher category e `saveTemplateEdit()` para enviar**

Substitua `openEditTemplateModal()`:

```javascript
function openEditTemplateModal(id) {
  const item = templateList.find(i => i.id === id);
  if (!item) return;
  editTemplateItemId = id;
  document.getElementById('tmpl-edit-name').value     = item.name;
  document.getElementById('tmpl-edit-qty').value      = item.qty;
  document.getElementById('tmpl-edit-unit').value     = item.unit;
  document.getElementById('tmpl-edit-category').value = item.category || '';
  openModal('modal-edit-template');
}
```

Substitua `saveTemplateEdit()`:

```javascript
async function saveTemplateEdit() {
  const name     = document.getElementById('tmpl-edit-name').value.trim();
  const qty      = parseFloat(document.getElementById('tmpl-edit-qty').value) || 1;
  const unit     = document.getElementById('tmpl-edit-unit').value;
  const category = document.getElementById('tmpl-edit-category').value;
  if (!name) { document.getElementById('tmpl-edit-name').focus(); return; }

  closeModal('modal-edit-template');
  showLoading();
  try {
    const res = await authFetch(`/api/template/${editTemplateItemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name, qty, unit, category })
    });
    if (!res) return;
    const updated = await res.json();
    const idx = templateList.findIndex(i => i.id === editTemplateItemId);
    if (idx !== -1) templateList[idx] = updated;
    renderTemplate();
  } catch { showError('Erro ao editar item.'); } finally { hideLoading(); }
}
```

- [ ] **Passo 10: Reset do filtro ao recarregar template**

Localize em `loadTemplate()` a linha:
```javascript
    templateEditMode = false;
```

Substitua por:
```javascript
    templateEditMode = false;
    templateCategoryFilter = '';
```

- [ ] **Passo 11: Verificar no browser**

Acesse a aba Template. Confirme:
- Chips de categoria visíveis
- "Selecionar tudo" aparece no rodapé
- Campo Categoria nos modais de add/edit
- Bordas coloridas nos itens com categoria

- [ ] **Passo 12: Commit**

```
git add public/index.html
git commit -m "feat: add category filter, select-all and category field to template view"
```

---

## Task 9: Frontend — Lista: unidade do estoque + modal finalizar com mercado

**Files:**
- Modify: `public/index.html`

### 9A — Unidade do estoque ao adicionar da lista padrão

- [ ] **Passo 1: Atualizar `confirmTemplateSelect()` para usar a unidade do estoque**

Substitua a função `confirmTemplateSelect()` inteira:

```javascript
async function confirmTemplateSelect() {
  const selected = templateList.filter(i => templateChecked.has(i.id));
  if (selected.length === 0) return;

  if (stockList.length === 0) {
    const res = await authFetch('/api/stock');
    if (res) stockList = await res.json();
  }

  showLoading();
  try {
    for (const item of selected) {
      const match = stockList.find(s => s.name.toLowerCase() === item.name.toLowerCase());
      const unit  = match ? match.unit : item.unit;
      await authFetch('/api/items', {
        method: 'POST',
        body: JSON.stringify({ name: item.name, qty: item.qty, unit })
      });
    }
    navigateTo('list');
  } catch { showError('Erro ao adicionar itens à lista.'); } finally { hideLoading(); }
}
```

### 9B — Campo "Nome do mercado" no modal finalizar

- [ ] **Passo 2: Atualizar HTML do `modal-finish`**

Localize e substitua o modal `modal-finish` inteiro:

```html
  <!-- Finish Trip -->
  <div id="modal-finish" class="modal-overlay hidden">
    <div class="modal-sheet">
      <div class="text-center mb-4">
        <div class="text-4xl mb-2">🎉</div>
        <h3 class="text-xl font-bold text-gray-800 mb-1">Finalizar compra?</h3>
        <p class="text-gray-400 text-sm" id="finish-summary">—</p>
      </div>
      <div class="bg-gray-50 rounded-xl p-4 mb-4 text-center">
        <p class="text-gray-400 text-sm">Total da compra</p>
        <p class="text-3xl font-bold text-red-600" id="finish-total">R$ 0,00</p>
      </div>
      <div class="mb-5">
        <label class="block text-sm font-semibold text-gray-600 mb-1">Nome do mercado</label>
        <input type="text" id="finish-store" placeholder="Ex: Atacadão, Assaí, BH..." autocomplete="off" />
      </div>
      <div class="flex gap-3">
        <button class="btn-outline" style="flex:1" onclick="closeModal('modal-finish')">Voltar</button>
        <button class="btn-red" style="flex:2" id="btn-confirm-finish" onclick="finishTrip()">Salvar compra</button>
      </div>
    </div>
  </div>
```

- [ ] **Passo 3: Atualizar `openFinishModal()` e `finishTrip()`**

Substitua `openFinishModal()`:

```javascript
function openFinishModal() {
  if (activeList.length === 0) return;
  const checked = activeList.filter(i => i.checked).length;
  const total   = activeList.filter(i => i.checked).reduce((s, i) => s + (i.total_paid || 0), 0);
  const n = activeList.length;
  document.getElementById('finish-summary').textContent =
    `${checked} de ${n} ite${n > 1 ? 'ns' : 'm'} marcado${checked !== 1 ? 's' : ''}`;
  document.getElementById('finish-total').textContent = fmtBRL(total);
  document.getElementById('finish-store').value = '';
  openModal('modal-finish');
  setTimeout(() => document.getElementById('finish-store').focus(), 300);
}
```

Substitua `finishTrip()`:

```javascript
async function finishTrip() {
  const store_name = document.getElementById('finish-store').value.trim();
  document.getElementById('btn-confirm-finish').disabled = true;
  try {
    const res = await authFetch('/api/trips', {
      method: 'POST',
      body: JSON.stringify({ store_name })
    });
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
```

- [ ] **Passo 4: Verificar no browser**

Adicione itens à lista pelo template. Confirme que a unidade veio do estoque. Tente finalizar e confirme que o campo de mercado aparece.

- [ ] **Passo 5: Commit**

```
git add public/index.html
git commit -m "feat: use stock unit in template selection and add store_name to finish modal"
```

---

## Task 10: Frontend — Histórico: nome do mercado, editar e excluir compra

**Files:**
- Modify: `public/index.html`

- [ ] **Passo 1: Atualizar `tripCardHTML()` para mostrar o mercado**

Substitua a função `tripCardHTML()`:

```javascript
function tripCardHTML(t) {
  const d = new Date(t.finished_at);
  const dateStr = d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
  const storePart = t.store_name ? ` · ${esc(t.store_name)}` : '';
  return `
    <div class="flex items-center justify-between">
      <div>
        <p class="font-semibold text-gray-800">${dateStr}${storePart}</p>
        <p class="text-xs text-gray-400 mt-0.5">${fmtBRL(t.grand_total)}</p>
      </div>
      <svg class="w-5 h-5 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 18l6-6-6-6"/>
      </svg>
    </div>`;
}
```

- [ ] **Passo 2: Adicionar variáveis de estado para a trip atual**

Localize:
```javascript
let stockList = [];
let stockItemId = null;
```

Antes dessa linha, adicione:

```javascript
let currentTripId   = null;
let currentTripData = null;
```

- [ ] **Passo 3: Atualizar `view-trip` para ter store_name, editar e excluir**

Localize o `view-trip` HTML e substitua a div interna (a partir de `<div class="px-4 pt-4">` até `<div id="trip-detail-items"></div>`):

```html
    <div class="px-4 pt-4">
      <div class="rounded-2xl p-5 mb-3 text-white text-center shadow-lg" style="background:linear-gradient(135deg,#dc2626,#b91c1c)">
        <p class="text-red-200 text-sm mb-1">Total gasto</p>
        <p class="text-4xl font-bold" id="trip-detail-total">R$ 0,00</p>
        <p class="text-red-300 text-sm mt-1" id="trip-detail-store"></p>
      </div>
      <div class="flex gap-3 mb-4">
        <button onclick="openEditTripModal()"
          class="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-blue-50 text-blue-600 border border-blue-200">
          ✏️ Editar
        </button>
        <button onclick="confirmDeleteTrip()"
          class="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-red-50 text-red-500 border border-red-200">
          🗑️ Excluir
        </button>
      </div>
      <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Itens comprados</h3>
      <div id="trip-detail-items"></div>
    </div>
```

- [ ] **Passo 4: Adicionar modal `modal-edit-trip`**

Após o modal `modal-delete`, adicione:

```html
  <!-- Edit Trip -->
  <div id="modal-edit-trip" class="modal-overlay hidden">
    <div class="modal-sheet">
      <div class="flex items-center justify-between mb-5">
        <h3 class="text-lg font-bold">Editar Compra</h3>
        <button onclick="closeModal('modal-edit-trip')" class="text-gray-400 text-2xl leading-none w-8 h-8 flex items-center justify-center">×</button>
      </div>
      <div class="mb-4">
        <label class="block text-sm font-semibold text-gray-600 mb-1">Nome do mercado</label>
        <input type="text" id="edit-trip-store" placeholder="Ex: Atacadão, BH..." autocomplete="off" />
      </div>
      <div class="mb-5">
        <label class="block text-sm font-semibold text-gray-600 mb-1">Data</label>
        <input type="date" id="edit-trip-date" />
      </div>
      <div class="flex gap-3">
        <button class="btn-outline" style="flex:1" onclick="closeModal('modal-edit-trip')">Cancelar</button>
        <button class="btn-red" style="flex:2" onclick="saveEditTrip()">Salvar</button>
      </div>
    </div>
  </div>
```

- [ ] **Passo 5: Atualizar `openTrip()` para armazenar dados da trip atual e usar `navigateTo`**

Substitua a função `openTrip()` inteira:

```javascript
async function openTrip(id) {
  showLoading();
  try {
    const res = await authFetch(`/api/trips/${id}`);
    if (!res) return;
    const trip = await res.json();
    hideLoading();

    currentTripId   = id;
    currentTripData = trip;

    const d = new Date(trip.finished_at);
    document.getElementById('trip-detail-date').textContent  =
      d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    document.getElementById('trip-detail-count').textContent = `${trip.items.length} ite${trip.items.length !== 1 ? 'ns' : 'm'}`;
    document.getElementById('trip-detail-total').textContent = fmtBRL(trip.grand_total);
    document.getElementById('trip-detail-store').textContent = trip.store_name || '';
    document.getElementById('trip-detail-items').innerHTML   = (trip.items || []).map(i => `
      <div class="bg-white rounded-xl p-4 mb-2 shadow-sm flex items-center justify-between">
        <div>
          <p class="font-semibold text-gray-800">${esc(i.name)}</p>
          <p class="text-xs text-gray-400">${i.qty} ${i.unit}</p>
        </div>
        <p class="text-lg font-bold text-gray-700">${fmtBRL(i.total_paid)}</p>
      </div>
    `).join('') || '<p class="text-center text-gray-400 py-4">Nenhum item registrado.</p>';

    navigateTo('trip');
  } catch { hideLoading(); showError('Erro ao carregar compra.'); }
}
```

- [ ] **Passo 6: Adicionar funções `openEditTripModal`, `saveEditTrip` e `confirmDeleteTrip`**

Após a função `openTrip()`, adicione:

```javascript
function openEditTripModal() {
  if (!currentTripData) return;
  document.getElementById('edit-trip-store').value = currentTripData.store_name || '';
  const d = new Date(currentTripData.finished_at);
  document.getElementById('edit-trip-date').value = d.toISOString().slice(0, 10);
  openModal('modal-edit-trip');
}

async function saveEditTrip() {
  const store_name  = document.getElementById('edit-trip-store').value.trim();
  const finished_at = document.getElementById('edit-trip-date').value;
  if (!finished_at) { document.getElementById('edit-trip-date').focus(); return; }

  closeModal('modal-edit-trip');
  showLoading();
  try {
    const res = await authFetch(`/api/trips/${currentTripId}`, {
      method: 'PATCH',
      body: JSON.stringify({ store_name, finished_at })
    });
    if (!res || !res.ok) { showError('Erro ao salvar.'); return; }
    const updated = await res.json();
    currentTripData = updated;
    const d = new Date(updated.finished_at);
    document.getElementById('trip-detail-date').textContent  =
      d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    document.getElementById('trip-detail-store').textContent = updated.store_name || '';
    const idx = trips.findIndex(t => t.id === currentTripId);
    if (idx !== -1) trips[idx] = updated;
  } catch { showError('Erro ao salvar.'); } finally { hideLoading(); }
}

async function confirmDeleteTrip() {
  if (!confirm('Excluir esta compra permanentemente?')) return;
  showLoading();
  try {
    const res = await authFetch(`/api/trips/${currentTripId}`, { method: 'DELETE' });
    if (!res || !res.ok) { showError('Erro ao excluir.'); return; }
    trips = trips.filter(t => t.id !== currentTripId);
    navigateTo('history');
  } catch { showError('Erro ao excluir.'); } finally { hideLoading(); }
}
```

- [ ] **Passo 7: Verificar no browser**

Finalize uma compra com nome de mercado. No histórico, toque na compra — confirme que mostra o mercado, e que Editar/Excluir funcionam.

- [ ] **Passo 8: Commit**

```
git add public/index.html
git commit -m "feat: show store name in history, add trip edit and delete"
```

---

## Task 11: Frontend — Home: analytics expandido

**Files:**
- Modify: `public/index.html`

- [ ] **Passo 1: Substituir a seção de estatísticas no `view-home`**

Localize e substitua este bloco (da div do grid até o fim de `home-recent`):

```html
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
```

Por:

```html
      <!-- Seletor de mês -->
      <div class="flex items-center justify-between bg-white rounded-2xl p-3 shadow-sm mb-3">
        <button onclick="prevMonth()" class="w-9 h-9 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-4 h-4"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <span class="text-sm font-semibold text-gray-700 capitalize" id="analytics-month-label">—</span>
        <button onclick="nextMonth()" id="btn-next-month" class="w-9 h-9 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-4 h-4"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>

      <!-- Cards de estatística -->
      <div class="grid grid-cols-3 gap-2 mb-3">
        <div class="rounded-2xl p-3 text-center" style="background:linear-gradient(135deg,#eff6ff,#dbeafe)">
          <p class="text-xl font-bold text-blue-700" id="stat-trips">—</p>
          <p class="text-blue-500 text-xs mt-0.5 leading-tight">Idas ao mercado</p>
        </div>
        <div class="rounded-2xl p-3 text-center" style="background:linear-gradient(135deg,#f0fdf4,#dcfce7)">
          <p class="text-base font-bold text-green-700 leading-tight" id="stat-total">—</p>
          <p class="text-green-500 text-xs mt-0.5 leading-tight">Total gasto</p>
        </div>
        <div class="rounded-2xl p-3 text-center" style="background:linear-gradient(135deg,#fff7ed,#fed7aa)">
          <p class="text-base font-bold text-orange-700 leading-tight" id="stat-avg">—</p>
          <p class="text-orange-500 text-xs mt-0.5 leading-tight">Ticket médio</p>
        </div>
      </div>

      <!-- Top produtos -->
      <div id="home-top-products" class="hidden mb-3">
        <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Top produtos do mês</h3>
        <div class="bg-white rounded-2xl p-4 shadow-sm">
          <div id="home-top-list"></div>
        </div>
      </div>

      <!-- Última compra -->
      <div id="home-recent" class="hidden">
        <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Última compra</h3>
        <div class="trip-card" id="home-recent-trip" onclick="navigateTo('history')"></div>
      </div>
```

- [ ] **Passo 2: Adicionar variável de estado e funções de analytics**

Localize a seção `// ===== STATE =====`:

```javascript
let activeList  = [];
let trips       = [];
```

Adicione após essas linhas:

```javascript
let analyticsMonth = new Date().toISOString().slice(0, 7);
```

- [ ] **Passo 3: Adicionar funções de mês e analytics**

Após a função `renderHome()`, adicione:

```javascript
function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function prevMonth() {
  const [y, m] = analyticsMonth.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  analyticsMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  loadAnalytics();
}

function nextMonth() {
  const nowYM = new Date().toISOString().slice(0, 7);
  if (analyticsMonth >= nowYM) return;
  const [y, m] = analyticsMonth.split('-').map(Number);
  const d = new Date(y, m, 1);
  analyticsMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  loadAnalytics();
}

async function loadAnalytics() {
  document.getElementById('analytics-month-label').textContent = monthLabel(analyticsMonth);
  const nowYM = new Date().toISOString().slice(0, 7);
  const nextBtn = document.getElementById('btn-next-month');
  if (nextBtn) nextBtn.disabled = analyticsMonth >= nowYM;

  try {
    const res = await authFetch(`/api/analytics?month=${analyticsMonth}`);
    if (!res) return;
    renderAnalytics(await res.json());
  } catch { /* analytics falha silenciosamente */ }
}

function renderAnalytics(data) {
  document.getElementById('stat-trips').textContent = data.month_trips;
  document.getElementById('stat-total').textContent = fmtBRL(data.month_total);
  document.getElementById('stat-avg').textContent   = data.month_trips > 0 ? fmtBRL(data.avg_ticket) : '—';

  const topEl   = document.getElementById('home-top-products');
  const topList = document.getElementById('home-top-list');
  if (data.top_products && data.top_products.length > 0) {
    topEl.classList.remove('hidden');
    const maxTotal = data.top_products[0].total || 1;
    topList.innerHTML = data.top_products.map(p => {
      const pct = Math.round((p.total / maxTotal) * 100);
      return `
        <div class="mb-3 last:mb-0">
          <div class="flex justify-between text-sm mb-1">
            <span class="font-medium text-gray-700 truncate mr-2">${esc(p.name)}</span>
            <span class="text-gray-500 whitespace-nowrap text-xs">${fmtBRL(p.total)}</span>
          </div>
          <div class="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div class="h-full bg-red-400 rounded-full" style="width:${pct}%"></div>
          </div>
        </div>`;
    }).join('');
  } else {
    topEl.classList.add('hidden');
  }
}
```

- [ ] **Passo 4: Chamar `loadAnalytics()` dentro de `loadHome()`**

Localize em `loadHome()`:
```javascript
    renderHome();
```

Substitua por:
```javascript
    renderHome();
    loadAnalytics();
```

- [ ] **Passo 5: Remover o trecho de `renderHome()` que usava stat-trips e stat-total antigos**

Localize em `renderHome()`:

```javascript
  document.getElementById('stat-trips').textContent = trips.length;
  document.getElementById('stat-total').textContent = fmtBRL(monthTrips.reduce((s, t) => s + (t.grand_total || 0), 0));
```

Remova essas duas linhas (o analytics agora cuida disso).

Também remova o bloco `const monthTrips = ...` que não é mais necessário:

```javascript
  const now = new Date();
  const monthTrips = trips.filter(t => {
    const d = new Date(t.finished_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
```

- [ ] **Passo 6: Verificar no browser**

Vá para Início. Confirme seletor de mês, 3 cards coloridos e top produtos.

- [ ] **Passo 7: Commit**

```
git add public/index.html
git commit -m "feat: add detailed analytics with month selector and top products to home"
```

---

## Task 12: Frontend — Compras Avulsas (nova aba)

**Files:**
- Modify: `public/index.html`

- [ ] **Passo 1: Adicionar `view-avulsas` antes do fechamento da nav**

Localize `<!-- ===================== BOTTOM NAV ===================== -->`.
Imediatamente ANTES desse comentário, adicione:

```html
  <!-- ===================== AVULSAS VIEW ===================== -->
  <div id="view-avulsas" class="view flex-1 pb-24 overflow-y-auto">
    <div class="text-white px-5 pt-12 pb-6" style="background:linear-gradient(135deg,#7c3aed,#6d28d9)">
      <div class="flex items-start justify-between">
        <div>
          <h2 class="text-2xl font-bold">Compra Avulsa</h2>
          <p class="text-purple-200 text-sm mt-1">Registre uma compra rápida sem lista</p>
        </div>
        <button onclick="openHelp()" class="text-purple-200 hover:text-white mt-1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-6 h-6"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </button>
      </div>
    </div>
    <div class="px-4 pt-4">
      <div class="bg-white rounded-2xl p-4 shadow-sm mb-4">
        <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Nova compra avulsa</h3>
        <div class="mb-3">
          <label class="block text-sm font-semibold text-gray-600 mb-1">Produto</label>
          <input type="text" id="avulsa-name" placeholder="Ex: Mozzarella" autocomplete="off" />
        </div>
        <div class="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label class="block text-sm font-semibold text-gray-600 mb-1">Quantidade</label>
            <input type="number" id="avulsa-qty" placeholder="1" min="0.01" step="0.01" />
          </div>
          <div>
            <label class="block text-sm font-semibold text-gray-600 mb-1">Unidade</label>
            <select id="avulsa-unit">
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
        <div class="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label class="block text-sm font-semibold text-gray-600 mb-1">Preço pago (R$)</label>
            <input type="number" id="avulsa-price" placeholder="0,00" min="0" step="0.01" />
          </div>
          <div>
            <label class="block text-sm font-semibold text-gray-600 mb-1">Mercado</label>
            <input type="text" id="avulsa-store" placeholder="Ex: Atacadão" autocomplete="off" />
          </div>
        </div>
        <button onclick="addAvulsa()" class="btn-purple">Registrar compra avulsa</button>
      </div>
      <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Compras registradas</h3>
      <div id="avulsas-container"></div>
      <div id="empty-avulsas" class="text-center py-12 hidden">
        <div class="text-5xl mb-3">🛍️</div>
        <p class="text-gray-400 text-sm">Nenhuma compra avulsa registrada ainda.</p>
      </div>
    </div>
  </div>
```

- [ ] **Passo 2: Adicionar o 6º botão na nav**

Localize no `bottom-nav` o botão de config:
```html
    <button class="nav-btn" id="nav-settings" onclick="navigateTo('settings')">
```

Adicione ANTES desse botão:

```html
    <button class="nav-btn" id="nav-avulsas" onclick="navigateTo('avulsas')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
        <line x1="3" y1="6" x2="21" y2="6"/>
        <path d="M16 10a4 4 0 01-8 0"/>
      </svg>Avulsas
    </button>
```

- [ ] **Passo 3: Adicionar JS de avulsas**

Antes de `// ===== UTILS =====`, adicione:

```javascript
// ===== AVULSAS =====
let avulsasList = [];

async function loadAvulsas() {
  showLoading();
  try {
    const res = await authFetch('/api/avulsas');
    if (!res) return;
    avulsasList = await res.json();
    renderAvulsas();
  } catch { showError('Erro ao carregar compras avulsas.'); } finally { hideLoading(); }
}

function renderAvulsas() {
  const emptyEl    = document.getElementById('empty-avulsas');
  const container  = document.getElementById('avulsas-container');
  emptyEl.classList.toggle('hidden', avulsasList.length > 0);
  container.innerHTML = avulsasList.map(a => {
    const d = new Date(a.purchased_at);
    const dateStr = d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
    const meta = [a.qty + ' ' + a.unit, a.store_name, dateStr].filter(Boolean).join(' · ');
    return `
      <div class="item-row">
        <div class="flex items-center gap-3">
          <div class="flex-1 min-w-0">
            <p class="font-semibold text-gray-800 truncate">${esc(a.name)}</p>
            <p class="text-xs text-gray-400">${esc(meta)}</p>
          </div>
          <div class="text-right mr-1">
            <p class="font-bold text-sm" style="color:#7c3aed">${fmtBRL(a.total_paid)}</p>
          </div>
          <button onclick="deleteAvulsa('${a.id}')"
            class="text-gray-300 text-2xl leading-none w-8 h-8 flex items-center justify-center">×</button>
        </div>
      </div>`;
  }).join('');
}

async function addAvulsa() {
  const name       = document.getElementById('avulsa-name').value.trim();
  const qty        = parseFloat(document.getElementById('avulsa-qty').value) || 1;
  const unit       = document.getElementById('avulsa-unit').value;
  const total_paid = parseFloat(document.getElementById('avulsa-price').value) || 0;
  const store_name = document.getElementById('avulsa-store').value.trim();
  if (!name) { document.getElementById('avulsa-name').focus(); return; }

  showLoading();
  try {
    const res = await authFetch('/api/avulsas', {
      method: 'POST',
      body: JSON.stringify({ name, qty, unit, total_paid, store_name })
    });
    if (!res) return;
    const item = await res.json();
    avulsasList.unshift(item);
    document.getElementById('avulsa-name').value  = '';
    document.getElementById('avulsa-qty').value   = '1';
    document.getElementById('avulsa-unit').value  = 'un';
    document.getElementById('avulsa-price').value = '';
    document.getElementById('avulsa-store').value = '';
    renderAvulsas();
  } catch { showError('Erro ao registrar compra avulsa.'); } finally { hideLoading(); }
}

async function deleteAvulsa(id) {
  if (!confirm('Excluir esta compra avulsa?')) return;
  showLoading();
  try {
    const res = await authFetch(`/api/avulsas/${id}`, { method: 'DELETE' });
    if (!res) return;
    avulsasList = avulsasList.filter(a => a.id !== id);
    renderAvulsas();
  } catch { showError('Erro ao excluir.'); } finally { hideLoading(); }
}
```

- [ ] **Passo 4: Atualizar `navigateTo()` para lidar com 'avulsas'**

Localize:
```javascript
  if (view === 'stock')    loadStock();
  if (view === 'template') loadTemplate();
```

Adicione após:
```javascript
  if (view === 'avulsas')  loadAvulsas();
```

- [ ] **Passo 5: Verificar no browser**

Nova aba "Avulsas" aparece na nav. Registrar uma compra avulsa e confirmar que aparece na lista. Deletar confirma remoção.

- [ ] **Passo 6: Commit**

```
git add public/index.html
git commit -m "feat: add avulsas view with quick purchase form and listing"
```

---

## Task 13: Frontend — Manual de ajuda (modal contextual)

**Files:**
- Modify: `public/index.html`

- [ ] **Passo 1: Adicionar o modal de ajuda**

Após o último modal existente (antes do `<script>`), adicione:

```html
  <!-- Help Modal -->
  <div id="modal-help" class="modal-overlay hidden">
    <div class="modal-sheet" style="max-height:75vh;overflow-y:auto;padding-bottom:32px">
      <div class="flex items-center justify-between mb-5">
        <h3 class="text-lg font-bold" id="help-modal-title">Ajuda</h3>
        <button onclick="closeModal('modal-help')" class="text-gray-400 text-2xl leading-none w-8 h-8 flex items-center justify-center">×</button>
      </div>
      <div id="help-modal-body"></div>
    </div>
  </div>
```

- [ ] **Passo 2: Adicionar JS de ajuda antes de `// ===== UTILS =====`**

```javascript
// ===== HELP =====
const HELP_CONTENT = {
  home: { title: 'Início — Como usar', items: [
    { h: 'Seletor de mês', t: 'Use as setas ← → para ver os gastos de cada mês.' },
    { h: 'Cards de estatística', t: 'Mostram total gasto, número de idas e ticket médio do mês selecionado.' },
    { h: 'Top produtos', t: 'Os 5 produtos com maior gasto no mês, com barra proporcional ao valor.' },
    { h: 'Estoque crítico', t: 'Aparece quando algum produto está abaixo do nível mínimo cadastrado.' },
    { h: 'Lista ativa', t: 'Atalho para continuar uma lista de compras em andamento.' },
  ]},
  list: { title: 'Lista de Compras — Como usar', items: [
    { h: 'Adicionar item (+)', t: 'Toque no + para adicionar um produto. Informe nome, quantidade e unidade.' },
    { h: 'Marcar como comprado', t: 'Toque no item para informar o preço pago. Fica verde ao ser marcado.' },
    { h: 'Finalizar ✓', t: 'Salva a compra. Informe o nome do mercado antes de confirmar.' },
    { h: 'Remover item', t: 'Toque no × para remover o item da lista atual.' },
  ]},
  template: { title: 'Lista Padrão — Como usar', items: [
    { h: 'Selecionar itens', t: 'Toque nos itens para marcá-los. Use "Selecionar tudo" para marcar todos de uma vez.' },
    { h: 'Filtrar por categoria', t: 'Toque nos chips (Carne, Laticínios, etc.) para ver só itens daquela categoria.' },
    { h: 'Adicionar à lista', t: 'Após selecionar, toque em "Adicionar N itens à lista" para enviá-los à lista de compras.' },
    { h: 'Editar lista', t: 'Toque em "Editar lista" para adicionar, editar ou remover itens da lista padrão.' },
  ]},
  history: { title: 'Histórico — Como usar', items: [
    { h: 'Ver detalhes', t: 'Toque em qualquer compra para ver os itens e o total gasto.' },
    { h: 'Editar compra', t: 'No detalhe, toque em Editar para corrigir o mercado ou a data.' },
    { h: 'Excluir compra', t: 'No detalhe, toque em Excluir para remover a compra permanentemente.' },
  ]},
  stock: { title: 'Estoque — Como usar', items: [
    { h: 'Adicionar produto (+)', t: 'Cadastre um produto com quantidade inicial e nível mínimo de alerta.' },
    { h: 'Ajustar quantidade', t: 'Toque no produto para registrar entrada (compra) ou saída (uso).' },
    { h: 'Nível mínimo', t: 'Quando a quantidade cai abaixo do mínimo, o produto aparece com ⚠️ e no alerta da tela inicial.' },
    { h: 'Atualização automática', t: 'Ao finalizar uma compra, os itens da lista atualizam o estoque automaticamente.' },
  ]},
  avulsas: { title: 'Compra Avulsa — Como usar', items: [
    { h: 'Para que serve', t: 'Registre uma compra simples sem precisar criar uma lista. Ideal para urgências.' },
    { h: 'Como registrar', t: 'Preencha o produto, quantidade, unidade, preço pago e mercado. Toque em Registrar.' },
    { h: 'Histórico', t: 'As compras avulsas ficam listadas abaixo do formulário, da mais recente à mais antiga.' },
  ]},
  settings: { title: 'Configurações — Como usar', items: [
    { h: 'Alterar credenciais', t: 'Informe o novo usuário e/ou senha e toque em Salvar. Deixe em branco para manter o atual.' },
    { h: 'Sair da conta', t: 'Toque em "Sair da conta" para fazer logout.' },
  ]},
};

function openHelp() {
  const content = HELP_CONTENT[currentView] || HELP_CONTENT.home;
  document.getElementById('help-modal-title').textContent = content.title;
  document.getElementById('help-modal-body').innerHTML = content.items.map(item => `
    <div class="mb-4 pb-4 border-b border-gray-100 last:border-0 last:mb-0 last:pb-0">
      <p class="font-semibold text-gray-800 mb-1">${esc(item.h)}</p>
      <p class="text-gray-500 text-sm leading-relaxed">${esc(item.t)}</p>
    </div>
  `).join('');
  openModal('modal-help');
}
```

- [ ] **Passo 3: Adicionar botão ? em cada header de view**

Para cada um dos seguintes headers, adicione o botão ? como descrito. O padrão é envolver o título em um `flex items-start justify-between` e colocar o botão à direita.

**Home** — localize:
```html
    <div class="bg-red-600 text-white px-5 pt-12 pb-8">
      <p class="text-red-200 text-sm font-medium mb-1">Bem-vindo 👋</p>
      <h1 class="text-2xl font-bold">Compras da Pizzaria</h1>
      <p class="text-red-200 text-sm mt-1" id="home-date"></p>
    </div>
```

Substitua por:
```html
    <div class="bg-red-600 text-white px-5 pt-12 pb-8">
      <div class="flex items-start justify-between">
        <div>
          <p class="text-red-200 text-sm font-medium mb-1">Bem-vindo 👋</p>
          <h1 class="text-2xl font-bold">Compras da Pizzaria</h1>
          <p class="text-red-200 text-sm mt-1" id="home-date"></p>
        </div>
        <button onclick="openHelp()" class="text-red-300 hover:text-white mt-1 flex-shrink-0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-6 h-6"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </button>
      </div>
    </div>
```

**Estoque** — localize:
```html
    <div class="bg-red-600 text-white px-5 pt-12 pb-5 sticky top-0 z-20">
      <h2 class="text-2xl font-bold">Estoque</h2>
      <p class="text-red-200 text-sm mt-1">Inventário da pizzaria</p>
    </div>
```

Substitua por:
```html
    <div class="bg-red-600 text-white px-5 pt-12 pb-5 sticky top-0 z-20">
      <div class="flex items-start justify-between">
        <div>
          <h2 class="text-2xl font-bold">Estoque</h2>
          <p class="text-red-200 text-sm mt-1">Inventário da pizzaria</p>
        </div>
        <button onclick="openHelp()" class="text-red-300 hover:text-white flex-shrink-0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-6 h-6"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </button>
      </div>
    </div>
```

**Histórico** — localize:
```html
    <div class="bg-red-600 text-white px-5 pt-12 pb-6">
      <h2 class="text-2xl font-bold">Histórico</h2>
      <p class="text-red-200 text-sm mt-1">Todas as idas ao mercado</p>
    </div>
```

Substitua por:
```html
    <div class="bg-red-600 text-white px-5 pt-12 pb-6">
      <div class="flex items-start justify-between">
        <div>
          <h2 class="text-2xl font-bold">Histórico</h2>
          <p class="text-red-200 text-sm mt-1">Todas as idas ao mercado</p>
        </div>
        <button onclick="openHelp()" class="text-red-300 hover:text-white flex-shrink-0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-6 h-6"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </button>
      </div>
    </div>
```

- [ ] **Passo 4: Verificar no browser**

Em cada tela, toque no ? e confirme que o modal de ajuda abre com o conteúdo correto.

- [ ] **Passo 5: Commit**

```
git add public/index.html
git commit -m "feat: add contextual help modal with ? button on each view"
```

---

## Task 14: Frontend — Categoria nos modais de estoque + verificação final

**Files:**
- Modify: `public/index.html`

- [ ] **Passo 1: Adicionar select de categoria ao modal `modal-add-stock`**

Localize no modal `modal-add-stock`:
```html
      <button class="btn-red" onclick="saveNewStockItem()">Adicionar</button>
```

Adicione ANTES:
```html
      <div class="mb-5">
        <label class="block text-sm font-semibold text-gray-600 mb-1">Categoria</label>
        <select id="stock-add-category">
          <option value="">Sem categoria</option>
          <option value="carne">Carne</option>
          <option value="laticinios">Laticínios</option>
          <option value="doces">Doces</option>
          <option value="outros">Outros</option>
        </select>
      </div>
```

- [ ] **Passo 2: Adicionar select de categoria ao modal `modal-stock-item` (edição)**

Localize no modal `modal-stock-item` a seção "Editar item":
```html
        <div class="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label class="block text-xs font-semibold text-gray-500 mb-1">Unidade</label>
            <select id="stock-edit-unit">
```

Adicione após o grid (depois do `</div>` que fecha o grid de unidade/mínimo):
```html
        <div class="mb-3">
          <label class="block text-xs font-semibold text-gray-500 mb-1">Categoria</label>
          <select id="stock-edit-category">
            <option value="">Sem categoria</option>
            <option value="carne">Carne</option>
            <option value="laticinios">Laticínios</option>
            <option value="doces">Doces</option>
            <option value="outros">Outros</option>
          </select>
        </div>
```

- [ ] **Passo 3: Atualizar `saveNewStockItem()` para ler category**

Substitua a função `saveNewStockItem()`:

```javascript
async function saveNewStockItem() {
  const name     = document.getElementById('stock-add-name').value.trim();
  const qty      = parseFloat(document.getElementById('stock-add-qty').value)  || 0;
  const unit     = document.getElementById('stock-add-unit').value;
  const min_qty  = parseFloat(document.getElementById('stock-add-min').value)  || 0;
  const category = document.getElementById('stock-add-category').value;
  if (!name) { document.getElementById('stock-add-name').focus(); return; }

  closeModal('modal-add-stock');
  showLoading();
  try {
    const res = await authFetch('/api/stock', {
      method: 'POST',
      body: JSON.stringify({ name, qty, unit, min_qty, category })
    });
    if (!res) return;
    const item = await res.json();
    stockList.push(item);
    stockList.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    renderStock();
  } catch { showError('Erro ao adicionar item.'); } finally { hideLoading(); }
}
```

- [ ] **Passo 4: Atualizar `openStockItemModal()` para preencher category e `saveStockEdit()` para enviar**

Localize `openStockItemModal()`. Após a linha:
```javascript
  document.getElementById('stock-edit-min').value   = item.min_qty;
```

Adicione:
```javascript
  document.getElementById('stock-edit-category').value = item.category || '';
```

Localize `saveStockEdit()`. Substitua por:

```javascript
async function saveStockEdit() {
  const unit     = document.getElementById('stock-edit-unit').value;
  const min_qty  = parseFloat(document.getElementById('stock-edit-min').value) || 0;
  const category = document.getElementById('stock-edit-category').value;

  closeModal('modal-stock-item');
  showLoading();
  try {
    const res = await authFetch(`/api/stock/${stockItemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ unit, min_qty, category })
    });
    if (!res) return;
    const updated = await res.json();
    const idx = stockList.findIndex(s => s.id === stockItemId);
    if (idx !== -1) stockList[idx] = updated;
    renderStock();
  } catch { showError('Erro ao editar item.'); } finally { hideLoading(); }
}
```

- [ ] **Passo 5: Atualizar `renderStock()` para mostrar borda colorida por categoria**

Substitua a função `renderStock()`:

```javascript
function renderStock() {
  const emptyEl = document.getElementById('empty-stock');
  emptyEl.classList.toggle('hidden', stockList.length > 0);
  document.getElementById('stock-container').innerHTML = stockList.map(s => {
    const low = s.min_qty > 0 && s.qty < s.min_qty;
    const catClass = (!low && s.category) ? `cat-${s.category}` : '';
    const lowBorder = low ? 'border-l-4 border-orange-400' : '';
    return `
      <div class="item-row ${catClass} ${lowBorder}" onclick="openStockItemModal('${s.id}')">
        <div class="flex items-center gap-3">
          <div class="flex-1 min-w-0">
            <p class="font-semibold text-gray-800 truncate">${esc(s.name)}</p>
            <p class="text-xs text-gray-400">${s.qty} ${s.unit}${low ? ' · <span class="text-orange-500 font-medium">abaixo do mínimo (' + s.min_qty + ')</span>' : ''}</p>
          </div>
          ${low ? '<span class="text-orange-400 text-lg">⚠️</span>' : ''}
        </div>
      </div>`;
  }).join('');
}
```

- [ ] **Passo 6: Rodar todos os testes para garantir que o backend continua OK**

```
npm test
```

Expected: todos passam.

- [ ] **Passo 7: Verificar o app completo no browser**

Percorra todas as abas. Pontos a verificar:
- Fundo bege quente em todo o app
- Home: seletor de mês funciona, 3 cards coloridos, top produtos aparecem após criar uma compra
- Template: filtros, selecionar tudo, bordas coloridas por categoria
- Lista: ao confirmar template, unidade do estoque é usada se disponível
- Finalizar: campo mercado aparece e é salvo
- Histórico: mercado aparece nos cards, editar e excluir funcionam
- Estoque: categoria aparece, bordas coloridas (laranja para baixo do mínimo, categoria para os demais)
- Avulsas: registrar e excluir compras avulsas
- Ajuda: ? em cada tela abre o modal correto

- [ ] **Passo 8: Commit final**

```
git add public/index.html
git commit -m "feat: add category to stock view and complete UI polish"
```

---

## Checklist de cobertura do spec

| Requisito | Task |
|-----------|------|
| Selecionar tudo na lista padrão | Task 8 |
| Filtros por categoria (Carne, Laticínios, Doces) | Task 8 |
| Categorias em template + estoque | Tasks 5, 6, 8, 14 |
| Mudança de cores (bege, gradientes, categorias coloridas) | Task 7 |
| Manual de ajuda contextual | Task 13 |
| Unidades do estoque nos itens da lista | Task 9A |
| Analytics detalhado na Home | Task 11 |
| Campo nome do mercado na finalização | Task 9B |
| Editar/Excluir compras finalizadas | Task 10 |
| Compras avulsas (aba própria) | Task 12 |
| DB migrations seguras | Task 1 |
| Rotas backend novas (analytics, avulsas) | Tasks 2, 3 |
| Rotas modificadas (trips, template, stock) | Tasks 4, 5, 6 |
