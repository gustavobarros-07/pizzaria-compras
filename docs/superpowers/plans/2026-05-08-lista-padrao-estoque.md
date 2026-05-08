# Lista Padrão + Estoque Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar lista padrão com seleção por item antes das compras, controle de estoque com alertas de mínimo, atualização automática do estoque ao finalizar compra, e botão de mostrar/ocultar senha nas configurações.

**Architecture:** Backend Node.js/Express com SQLite — duas novas tabelas (`template_items`, `stock_items`), duas novas rotas CRUD, e atualização automática do estoque dentro da transação de finalizar compra. Frontend é um único `index.html` com novas views e JS.

**Tech Stack:** Node.js, Express, better-sqlite3, JWT, Tailwind CSS (CDN), supertest/jest para testes.

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---------|------|-----------------|
| `db.js` | Modificar | Adicionar tabelas `template_items` e `stock_items` |
| `routes/template.js` | Criar | CRUD da lista padrão |
| `routes/stock.js` | Criar | CRUD do estoque |
| `routes/trips.js` | Modificar | Atualizar estoque ao finalizar compra |
| `app.js` | Modificar | Registrar novas rotas |
| `tests/template.test.js` | Criar | Testes das rotas de template |
| `tests/stock.test.js` | Criar | Testes das rotas de estoque |
| `tests/trips.test.js` | Modificar | Adicionar teste de atualização de estoque |
| `public/index.html` | Modificar | Novas views, nav, fluxos e toggle de senha |

---

## Task 1: Adicionar tabelas ao banco de dados

**Files:**
- Modify: `db.js`

- [ ] **Step 1: Adicionar as duas tabelas ao `db.exec` em `db.js`**

Localizar o bloco `db.exec(\`...\`)` existente (linhas 15-46) e adicionar as duas novas tabelas **dentro do mesmo template literal**, após `trip_items`:

```javascript
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
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS stock_items (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    qty        REAL NOT NULL DEFAULT 0,
    unit       TEXT NOT NULL DEFAULT 'un',
    min_qty    REAL NOT NULL DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);
```

- [ ] **Step 2: Confirmar que o servidor sobe sem erros**

```bash
node -e "require('./db'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add db.js
git commit -m "feat: add template_items and stock_items tables"
```

---

## Task 2: Rotas da lista padrão

**Files:**
- Create: `routes/template.js`
- Create: `tests/template.test.js`

- [ ] **Step 1: Criar o arquivo de testes**

Criar `tests/template.test.js`:

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
```

- [ ] **Step 2: Rodar os testes e confirmar que falham (rota não existe ainda)**

```bash
npm test -- --testPathPattern=template
```

Expected: falha com erro de conexão recusada ou 404.

- [ ] **Step 3: Criar `routes/template.js`**

```javascript
const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const items = db.prepare('SELECT * FROM template_items ORDER BY sort_order').all();
  res.json(items);
});

router.post('/', (req, res) => {
  const { name, qty, unit } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });

  const id = randomUUID();
  const maxOrder = db.prepare(
    'SELECT COALESCE(MAX(sort_order), -1) AS m FROM template_items'
  ).get().m;

  db.prepare(
    'INSERT INTO template_items (id, name, qty, unit, sort_order) VALUES (?, ?, ?, ?, ?)'
  ).run(id, name, qty || 1, unit || 'un', maxOrder + 1);

  const item = db.prepare('SELECT * FROM template_items WHERE id = ?').get(id);
  res.status(201).json(item);
});

router.patch('/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM template_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item não encontrado' });

  const updates = {};
  if (req.body.name !== undefined) updates.name = req.body.name;
  if (req.body.qty  !== undefined) updates.qty  = req.body.qty;
  if (req.body.unit !== undefined) updates.unit = req.body.unit;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Nenhum campo para atualizar' });
  }

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

- [ ] **Step 4: Registrar a rota em `app.js`**

Adicionar após a linha `app.use('/api/items', ...)`:

```javascript
app.use('/api/template', require('./routes/template'));
```

Adicionar **apenas** a linha do template por enquanto:

```javascript
app.use('/api/template', require('./routes/template'));
```

O arquivo completo após esta edição:

```javascript
const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', require('./routes/auth'));
app.use('/api/items', require('./routes/items'));
app.use('/api/trips', require('./routes/trips'));
app.use('/api/template', require('./routes/template'));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = app;
```

> A linha `/api/stock` será adicionada no Task 3, após a rota existir.

- [ ] **Step 5: Rodar os testes e confirmar que passam**

```bash
npm test -- --testPathPattern=template
```

Expected: todos os testes passam (PASS).

- [ ] **Step 6: Commit**

```bash
git add routes/template.js tests/template.test.js app.js
git commit -m "feat: add template routes and tests"
```

---

## Task 3: Rotas do estoque

**Files:**
- Create: `routes/stock.js`
- Create: `tests/stock.test.js`

- [ ] **Step 1: Criar `tests/stock.test.js`**

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
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

```bash
npm test -- --testPathPattern=stock
```

Expected: falha (rota não existe).

- [ ] **Step 3: Criar `routes/stock.js`**

```javascript
const express = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const items = db.prepare(
    'SELECT * FROM stock_items ORDER BY name COLLATE NOCASE'
  ).all();
  res.json(items);
});

router.post('/', (req, res) => {
  const { name, qty, unit, min_qty } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });

  const id = randomUUID();
  db.prepare(
    'INSERT INTO stock_items (id, name, qty, unit, min_qty) VALUES (?, ?, ?, ?, ?)'
  ).run(id, name, qty ?? 0, unit || 'un', min_qty ?? 0);

  res.status(201).json(db.prepare('SELECT * FROM stock_items WHERE id = ?').get(id));
});

router.patch('/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM stock_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item não encontrado' });

  const updates = {};
  if (req.body.name    !== undefined) updates.name    = req.body.name;
  if (req.body.qty     !== undefined) updates.qty     = req.body.qty;
  if (req.body.unit    !== undefined) updates.unit    = req.body.unit;
  if (req.body.min_qty !== undefined) updates.min_qty = req.body.min_qty;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Nenhum campo para atualizar' });
  }

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

- [ ] **Step 4: Registrar a rota de stock em `app.js`**

Adicionar após a linha `/api/template`:

```javascript
app.use('/api/stock', require('./routes/stock'));
```

O arquivo completo após esta edição:

```javascript
const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', require('./routes/auth'));
app.use('/api/items', require('./routes/items'));
app.use('/api/trips', require('./routes/trips'));
app.use('/api/template', require('./routes/template'));
app.use('/api/stock', require('./routes/stock'));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = app;
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

```bash
npm test -- --testPathPattern=stock
```

Expected: todos os testes passam (PASS).

- [ ] **Step 6: Rodar todos os testes para garantir que nada quebrou**

```bash
npm test
```

Expected: todos passam.

- [ ] **Step 6: Commit**

```bash
git add routes/stock.js tests/stock.test.js app.js
git commit -m "feat: add stock routes and tests"
```

---

## Task 4: Atualizar estoque ao finalizar compra

**Files:**
- Modify: `routes/trips.js`
- Modify: `tests/trips.test.js`

- [ ] **Step 1: Adicionar testes de atualização de estoque em `tests/trips.test.js`**

Primeiro, adicionar `stock_items` ao `afterEach` existente (linhas 13-18):

```javascript
afterEach(() => {
  const db = require('../db');
  db.prepare('DELETE FROM trip_items').run();
  db.prepare('DELETE FROM trips').run();
  db.prepare('DELETE FROM list_items').run();
  db.prepare('DELETE FROM stock_items').run();
});
```

Depois, adicionar o novo describe no final do arquivo:

```javascript
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
```

- [ ] **Step 2: Rodar os novos testes e confirmar que falham**

```bash
npm test -- --testPathPattern=trips
```

Expected: os testes de stock update falham (qty não muda).

- [ ] **Step 3: Atualizar `routes/trips.js` para atualizar estoque dentro da transação**

Substituir o conteúdo completo do arquivo:

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

  const insertTrip  = db.prepare('INSERT INTO trips (id, grand_total) VALUES (?, ?)');
  const insertItem  = db.prepare(
    'INSERT INTO trip_items (id, trip_id, name, qty, unit, total_paid) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const clearList   = db.prepare('DELETE FROM list_items');
  const updateStock = db.prepare(
    "UPDATE stock_items SET qty = qty + ?, updated_at = datetime('now') WHERE LOWER(name) = LOWER(?)"
  );

  db.transaction(() => {
    insertTrip.run(tripId, grandTotal);
    for (const item of checked) {
      insertItem.run(randomUUID(), tripId, item.name, item.qty, item.unit, item.total_paid);
      updateStock.run(item.qty, item.name);
    }
    clearList.run();
  })();

  res.status(201).json(db.prepare('SELECT * FROM trips WHERE id = ?').get(tripId));
});

router.get('/:id', (req, res) => {
  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Compra não encontrada' });

  const items = db.prepare(
    'SELECT * FROM trip_items WHERE trip_id = ? ORDER BY name'
  ).all(req.params.id);
  res.json({ ...trip, items });
});

module.exports = router;
```

- [ ] **Step 4: Rodar todos os testes**

```bash
npm test
```

Expected: todos passam.

- [ ] **Step 5: Commit**

```bash
git add routes/trips.js tests/trips.test.js
git commit -m "feat: update stock automatically when finalizing a trip"
```

---

## Task 5: Frontend — Tab Estoque + view de estoque

**Files:**
- Modify: `public/index.html`

Não há testes automatizados para o frontend. Cada passo tem verificação manual.

- [ ] **Step 1: Adicionar o 5º tab "Estoque" no menu inferior**

Localizar o elemento `<nav class="bottom-nav" ...>` (linha ~274). Adicionar o botão do Estoque **antes** do botão de Config:

```html
    <button class="nav-btn" id="nav-stock" onclick="navigateTo('stock')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
        <line x1="12" y1="22.08" x2="12" y2="12"/>
      </svg>Estoque
    </button>
```

O resultado deve ser: Início · Lista · Histórico · **Estoque** · Config

- [ ] **Step 2: Adicionar a view de estoque**

Inserir antes do comentário `<!-- ===================== SETTINGS VIEW ===================== -->`:

```html
  <!-- ===================== STOCK VIEW ===================== -->
  <div id="view-stock" class="view flex-1 pb-24 overflow-y-auto">
    <div class="bg-red-600 text-white px-5 pt-12 pb-5 sticky top-0 z-20">
      <h2 class="text-2xl font-bold">Estoque</h2>
      <p class="text-red-200 text-sm mt-1">Inventário da pizzaria</p>
    </div>
    <div class="px-4 pt-4">
      <div id="stock-container"></div>
      <div id="empty-stock" class="text-center py-12 hidden">
        <div class="text-5xl mb-3">📦</div>
        <p class="text-gray-400 text-sm">Toque no <strong>+</strong> para adicionar itens ao estoque</p>
      </div>
    </div>
    <button class="fab" onclick="openAddStockModal()">+</button>
  </div>
```

- [ ] **Step 3: Adicionar modais de estoque**

Inserir após o modal de delete existente (após a `</div>` que fecha `modal-delete`):

```html
  <!-- Add Stock Item -->
  <div id="modal-add-stock" class="modal-overlay hidden">
    <div class="modal-sheet">
      <div class="flex items-center justify-between mb-5">
        <h3 class="text-lg font-bold">Adicionar ao Estoque</h3>
        <button onclick="closeModal('modal-add-stock')" class="text-gray-400 text-2xl leading-none w-8 h-8 flex items-center justify-center">&times;</button>
      </div>
      <div class="mb-4">
        <label class="block text-sm font-semibold text-gray-600 mb-1">Nome do produto</label>
        <input type="text" id="stock-add-name" placeholder="Ex: Mozzarella" autocomplete="off" />
      </div>
      <div class="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label class="block text-sm font-semibold text-gray-600 mb-1">Quantidade atual</label>
          <input type="number" id="stock-add-qty" placeholder="0" min="0" step="0.01" />
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-600 mb-1">Unidade</label>
          <select id="stock-add-unit">
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
      <div class="mb-5">
        <label class="block text-sm font-semibold text-gray-600 mb-1">Quantidade mínima (alerta)</label>
        <input type="number" id="stock-add-min" placeholder="0" min="0" step="0.01" />
      </div>
      <button class="btn-red" onclick="saveNewStockItem()">Adicionar</button>
    </div>
  </div>

  <!-- Edit/Adjust Stock Item -->
  <div id="modal-stock-item" class="modal-overlay hidden">
    <div class="modal-sheet">
      <div class="flex items-center justify-between mb-1">
        <h3 class="text-lg font-bold" id="stock-item-modal-title">—</h3>
        <button onclick="closeModal('modal-stock-item')" class="text-gray-400 text-2xl leading-none w-8 h-8 flex items-center justify-center">&times;</button>
      </div>
      <p class="text-sm text-gray-400 mb-4" id="stock-item-modal-info">—</p>
      <div class="bg-gray-50 rounded-xl p-4 mb-4">
        <p class="text-xs font-semibold text-gray-400 mb-2 uppercase">Ajustar quantidade</p>
        <div class="flex gap-3 mb-3">
          <button id="stock-adj-entrada" onclick="setStockAdjType('entrada')"
            class="flex-1 py-2 rounded-xl text-sm font-bold border-2 border-green-500 text-green-600 bg-green-50">
            + Entrada
          </button>
          <button id="stock-adj-saida" onclick="setStockAdjType('saida')"
            class="flex-1 py-2 rounded-xl text-sm font-bold border-2 border-gray-200 text-gray-400">
            − Saída
          </button>
        </div>
        <input type="number" id="stock-adj-value" placeholder="0" min="0" step="0.01" class="mb-3" />
        <button class="btn-red" onclick="saveStockAdjustment()">Confirmar ajuste</button>
      </div>
      <div class="bg-gray-50 rounded-xl p-4 mb-4">
        <p class="text-xs font-semibold text-gray-400 mb-2 uppercase">Editar item</p>
        <div class="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label class="block text-xs font-semibold text-gray-500 mb-1">Unidade</label>
            <select id="stock-edit-unit">
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
          <div>
            <label class="block text-xs font-semibold text-gray-500 mb-1">Mínimo</label>
            <input type="number" id="stock-edit-min" placeholder="0" min="0" step="0.01" />
          </div>
        </div>
        <button class="btn-outline" style="font-size:14px;padding:10px" onclick="saveStockEdit()">Salvar edição</button>
      </div>
      <button onclick="deleteStockItem()"
        class="w-full py-3 rounded-xl text-sm font-bold text-red-500 border-2 border-red-100">
        Remover item do estoque
      </button>
    </div>
  </div>
```

- [ ] **Step 4: Adicionar JS do estoque**

Inserir no `<script>`, antes do comentário `// ===== UTILS =====`, o bloco de estado e funções do estoque:

```javascript
// ===== STOCK =====
let stockList = [];
let stockItemId = null;
let stockAdjType = 'entrada';

async function loadStock() {
  showLoading();
  try {
    const res = await authFetch('/api/stock');
    if (!res) return;
    stockList = await res.json();
    renderStock();
  } catch { showError('Erro ao carregar estoque.'); } finally { hideLoading(); }
}

function renderStock() {
  const emptyEl = document.getElementById('empty-stock');
  emptyEl.classList.toggle('hidden', stockList.length > 0);
  document.getElementById('stock-container').innerHTML = stockList.map(s => {
    const low = s.qty < s.min_qty;
    return `
      <div class="item-row ${low ? 'border-l-4 border-orange-400' : ''}" onclick="openStockItemModal('${s.id}')">
        <div class="flex items-center gap-3">
          <div class="flex-1 min-w-0">
            <p class="font-semibold text-gray-800 truncate">${esc(s.name)}</p>
            <p class="text-xs text-gray-400">${s.qty} ${s.unit} ${low ? '· <span class="text-orange-500 font-medium">abaixo do mínimo ('+s.min_qty+')</span>' : ''}</p>
          </div>
          ${low ? '<span class="text-orange-400 text-lg">⚠️</span>' : ''}
        </div>
      </div>`;
  }).join('');
}

function openAddStockModal() {
  document.getElementById('stock-add-name').value = '';
  document.getElementById('stock-add-qty').value  = '0';
  document.getElementById('stock-add-unit').value = 'un';
  document.getElementById('stock-add-min').value  = '0';
  openModal('modal-add-stock');
  setTimeout(() => document.getElementById('stock-add-name').focus(), 300);
}

async function saveNewStockItem() {
  const name    = document.getElementById('stock-add-name').value.trim();
  const qty     = parseFloat(document.getElementById('stock-add-qty').value)  || 0;
  const unit    = document.getElementById('stock-add-unit').value;
  const min_qty = parseFloat(document.getElementById('stock-add-min').value)  || 0;
  if (!name) { document.getElementById('stock-add-name').focus(); return; }

  closeModal('modal-add-stock');
  showLoading();
  try {
    const res = await authFetch('/api/stock', {
      method: 'POST',
      body: JSON.stringify({ name, qty, unit, min_qty })
    });
    if (!res) return;
    const item = await res.json();
    stockList.push(item);
    stockList.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    renderStock();
  } catch { showError('Erro ao adicionar item.'); } finally { hideLoading(); }
}

function openStockItemModal(id) {
  const item = stockList.find(s => s.id === id);
  if (!item) return;
  stockItemId = id;
  stockAdjType = 'entrada';
  document.getElementById('stock-item-modal-title').textContent = item.name;
  document.getElementById('stock-item-modal-info').textContent  =
    `Estoque atual: ${item.qty} ${item.unit} · Mínimo: ${item.min_qty}`;
  document.getElementById('stock-adj-value').value  = '';
  document.getElementById('stock-edit-unit').value  = item.unit;
  document.getElementById('stock-edit-min').value   = item.min_qty;
  setStockAdjType('entrada');
  openModal('modal-stock-item');
}

function setStockAdjType(type) {
  stockAdjType = type;
  document.getElementById('stock-adj-entrada').className =
    type === 'entrada'
      ? 'flex-1 py-2 rounded-xl text-sm font-bold border-2 border-green-500 text-green-600 bg-green-50'
      : 'flex-1 py-2 rounded-xl text-sm font-bold border-2 border-gray-200 text-gray-400';
  document.getElementById('stock-adj-saida').className =
    type === 'saida'
      ? 'flex-1 py-2 rounded-xl text-sm font-bold border-2 border-red-400 text-red-500 bg-red-50'
      : 'flex-1 py-2 rounded-xl text-sm font-bold border-2 border-gray-200 text-gray-400';
}

async function saveStockAdjustment() {
  const delta = parseFloat(document.getElementById('stock-adj-value').value);
  if (isNaN(delta) || delta <= 0) { document.getElementById('stock-adj-value').focus(); return; }

  const item = stockList.find(s => s.id === stockItemId);
  const newQty = stockAdjType === 'entrada'
    ? item.qty + delta
    : Math.max(0, item.qty - delta);

  closeModal('modal-stock-item');
  showLoading();
  try {
    const res = await authFetch(`/api/stock/${stockItemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ qty: newQty })
    });
    if (!res) return;
    const updated = await res.json();
    const idx = stockList.findIndex(s => s.id === stockItemId);
    if (idx !== -1) stockList[idx] = updated;
    renderStock();
  } catch { showError('Erro ao ajustar estoque.'); } finally { hideLoading(); }
}

async function saveStockEdit() {
  const unit    = document.getElementById('stock-edit-unit').value;
  const min_qty = parseFloat(document.getElementById('stock-edit-min').value) || 0;

  closeModal('modal-stock-item');
  showLoading();
  try {
    const res = await authFetch(`/api/stock/${stockItemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ unit, min_qty })
    });
    if (!res) return;
    const updated = await res.json();
    const idx = stockList.findIndex(s => s.id === stockItemId);
    if (idx !== -1) stockList[idx] = updated;
    renderStock();
  } catch { showError('Erro ao editar item.'); } finally { hideLoading(); }
}

async function deleteStockItem() {
  closeModal('modal-stock-item');
  showLoading();
  try {
    const res = await authFetch(`/api/stock/${stockItemId}`, { method: 'DELETE' });
    if (!res) return;
    stockList = stockList.filter(s => s.id !== stockItemId);
    renderStock();
  } catch { showError('Erro ao remover item.'); } finally { hideLoading(); }
}
```

- [ ] **Step 5: Atualizar `navigateTo` para chamar `loadStock`**

Localizar o bloco de `if (view === ...)` no final de `navigateTo`:

```javascript
  if (view === 'home')    loadHome();
  if (view === 'list')    loadList();
  if (view === 'history') loadHistory();
```

Adicionar:

```javascript
  if (view === 'home')    loadHome();
  if (view === 'list')    loadList();
  if (view === 'history') loadHistory();
  if (view === 'stock')   loadStock();
```

- [ ] **Step 6: Verificação manual**

Iniciar o servidor: `node server.js`  
Abrir o app no navegador → fazer login → clicar em "Estoque" na barra inferior.  
Expected:
- Tab ativo muda para Estoque
- Tela de estoque exibe mensagem de lista vazia com ícone 📦
- FAB (+) visível
- Tocar no FAB abre modal de adicionar item
- Preencher nome/qty/unidade/mínimo e salvar → item aparece na lista
- Tocar no item → modal de ajuste/edição aparece

- [ ] **Step 7: Commit**

```bash
git add public/index.html
git commit -m "feat: add stock view with CRUD and adjustment flow"
```

---

## Task 6: Frontend — Fluxo de Lista Padrão

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Adicionar a view de seleção de template**

Inserir antes do comentário `<!-- ===================== STOCK VIEW ===================== -->`:

```html
  <!-- ===================== TEMPLATE VIEW ===================== -->
  <div id="view-template" class="view flex-1 pb-24 overflow-y-auto">
    <div class="bg-red-600 text-white px-5 pt-12 pb-5 sticky top-0 z-20">
      <div class="flex items-center justify-between mb-3">
        <button onclick="navigateTo('list')" class="text-red-200 font-medium flex items-center gap-1 text-sm">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="w-4 h-4"><path d="M15 18l-6-6 6-6"/></svg>Lista
        </button>
        <button id="template-edit-btn" onclick="toggleTemplateEditMode()"
          class="text-white font-semibold text-sm px-3 py-1.5 rounded-xl bg-red-700">
          Editar lista
        </button>
      </div>
      <h2 class="text-xl font-bold" id="template-view-title">Lista Padrão</h2>
      <p class="text-red-200 text-sm mt-1" id="template-view-subtitle">Selecione os itens para esta compra</p>
    </div>
    <div class="px-4 pt-4">
      <div id="template-container"></div>
      <div id="empty-template" class="text-center py-12 hidden">
        <div class="text-5xl mb-3">📋</div>
        <p class="text-gray-400 text-sm">Nenhum item na lista padrão.<br>Toque em "Editar lista" para adicionar.</p>
      </div>
    </div>
    <div id="template-select-footer" class="hidden" style="position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:28rem;padding:16px 16px 32px;background:white;border-top:1px solid #f3f4f6;z-index:40;">
      <button class="btn-red" onclick="confirmTemplateSelect()" id="btn-confirm-template">
        Adicionar 0 itens à lista
      </button>
    </div>
    <button class="fab hidden" id="template-fab" onclick="openAddTemplateModal()">+</button>
  </div>
```

- [ ] **Step 2: Adicionar modais de template**

Inserir junto com os outros modais (após `modal-add-stock`):

```html
  <!-- Add Template Item -->
  <div id="modal-add-template" class="modal-overlay hidden">
    <div class="modal-sheet">
      <div class="flex items-center justify-between mb-5">
        <h3 class="text-lg font-bold">Adicionar à Lista Padrão</h3>
        <button onclick="closeModal('modal-add-template')" class="text-gray-400 text-2xl leading-none w-8 h-8 flex items-center justify-center">&times;</button>
      </div>
      <div class="mb-4">
        <label class="block text-sm font-semibold text-gray-600 mb-1">Nome do produto</label>
        <input type="text" id="tmpl-add-name" placeholder="Ex: Farinha de trigo" autocomplete="off" />
      </div>
      <div class="grid grid-cols-2 gap-3 mb-5">
        <div>
          <label class="block text-sm font-semibold text-gray-600 mb-1">Quantidade</label>
          <input type="number" id="tmpl-add-qty" placeholder="1" min="0.01" step="0.01" />
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-600 mb-1">Unidade</label>
          <select id="tmpl-add-unit">
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
      <button class="btn-red" onclick="addTemplateItem()">Adicionar</button>
    </div>
  </div>

  <!-- Edit Template Item -->
  <div id="modal-edit-template" class="modal-overlay hidden">
    <div class="modal-sheet">
      <div class="flex items-center justify-between mb-5">
        <h3 class="text-lg font-bold">Editar Item</h3>
        <button onclick="closeModal('modal-edit-template')" class="text-gray-400 text-2xl leading-none w-8 h-8 flex items-center justify-center">&times;</button>
      </div>
      <div class="mb-4">
        <label class="block text-sm font-semibold text-gray-600 mb-1">Nome</label>
        <input type="text" id="tmpl-edit-name" autocomplete="off" />
      </div>
      <div class="grid grid-cols-2 gap-3 mb-5">
        <div>
          <label class="block text-sm font-semibold text-gray-600 mb-1">Quantidade</label>
          <input type="number" id="tmpl-edit-qty" min="0.01" step="0.01" />
        </div>
        <div>
          <label class="block text-sm font-semibold text-gray-600 mb-1">Unidade</label>
          <select id="tmpl-edit-unit">
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
      <button class="btn-red" onclick="saveTemplateEdit()">Salvar</button>
    </div>
  </div>
```

- [ ] **Step 3: Adicionar botão "Usar lista padrão" na tela de lista vazia**

Localizar o elemento `<div id="no-list-card" ...>` (linha ~152). Substituir o botão interno:

```html
      <div id="no-list-card" class="hidden">
        <div class="bg-white rounded-2xl p-6 shadow-md mb-4 text-center anim">
          <div class="text-5xl mb-3">🛒</div>
          <h2 class="text-lg font-bold text-gray-800 mb-1">Nenhuma lista ativa</h2>
          <p class="text-gray-500 text-sm mb-5">Monte sua lista antes de ir ao mercado.</p>
          <button class="btn-red mb-3" onclick="navigateTo('template')">Usar lista padrão</button>
          <button class="btn-outline" onclick="createNewList()">+ Nova lista manual</button>
        </div>
      </div>
```

- [ ] **Step 4: Adicionar JS do template**

Inserir no `<script>`, antes do bloco `// ===== STOCK =====`:

```javascript
// ===== TEMPLATE =====
let templateList = [];
let templateEditMode = false;
let templateChecked = new Set();
let editTemplateItemId = null;

async function loadTemplate() {
  showLoading();
  try {
    const res = await authFetch('/api/template');
    if (!res) return;
    templateList = await res.json();
    templateChecked = new Set(templateList.map(i => i.id));
    templateEditMode = false;
    renderTemplate();
  } catch { showError('Erro ao carregar lista padrão.'); } finally { hideLoading(); }
}

function renderTemplate() {
  const emptyEl = document.getElementById('empty-template');
  const footer  = document.getElementById('template-select-footer');
  const fab     = document.getElementById('template-fab');
  const editBtn = document.getElementById('template-edit-btn');
  const title   = document.getElementById('template-view-title');
  const subtitle = document.getElementById('template-view-subtitle');

  emptyEl.classList.toggle('hidden', templateList.length > 0);

  if (templateEditMode) {
    footer.classList.add('hidden');
    fab.classList.remove('hidden');
    editBtn.textContent = 'Concluir';
    title.textContent = 'Editar Lista Padrão';
    subtitle.textContent = 'Adicione, edite ou remova itens';
  } else {
    footer.classList.toggle('hidden', templateList.length === 0);
    fab.classList.add('hidden');
    editBtn.textContent = 'Editar lista';
    title.textContent = 'Lista Padrão';
    subtitle.textContent = 'Selecione os itens para esta compra';
    updateTemplateFooterCount();
  }

  document.getElementById('template-container').innerHTML = templateList.map(item => {
    if (templateEditMode) {
      return `
        <div class="item-row flex items-center gap-3" onclick="openEditTemplateModal('${item.id}')">
          <div class="flex-1 min-w-0">
            <p class="font-semibold text-gray-800 truncate">${esc(item.name)}</p>
            <p class="text-xs text-gray-400">${item.qty} ${item.unit}</p>
          </div>
          <button onclick="event.stopPropagation();deleteTemplateItem('${item.id}')"
            class="text-gray-300 text-2xl leading-none w-8 h-8 flex items-center justify-center">×</button>
        </div>`;
    }
    const checked = templateChecked.has(item.id);
    return `
      <div class="item-row ${checked ? 'checked' : ''}" onclick="toggleTemplateItem('${item.id}')">
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

function toggleTemplateItem(id) {
  if (templateChecked.has(id)) {
    templateChecked.delete(id);
  } else {
    templateChecked.add(id);
  }
  renderTemplate();
}

function updateTemplateFooterCount() {
  const count = templateChecked.size;
  document.getElementById('btn-confirm-template').textContent =
    `Adicionar ${count} ite${count !== 1 ? 'ns' : 'm'} à lista`;
}

function toggleTemplateEditMode() {
  templateEditMode = !templateEditMode;
  renderTemplate();
}

async function confirmTemplateSelect() {
  const selected = templateList.filter(i => templateChecked.has(i.id));
  if (selected.length === 0) return;

  showLoading();
  try {
    for (const item of selected) {
      await authFetch('/api/items', {
        method: 'POST',
        body: JSON.stringify({ name: item.name, qty: item.qty, unit: item.unit })
      });
    }
    navigateTo('list');
  } catch { showError('Erro ao adicionar itens à lista.'); } finally { hideLoading(); }
}

function openAddTemplateModal() {
  document.getElementById('tmpl-add-name').value = '';
  document.getElementById('tmpl-add-qty').value  = '1';
  document.getElementById('tmpl-add-unit').value = 'un';
  openModal('modal-add-template');
  setTimeout(() => document.getElementById('tmpl-add-name').focus(), 300);
}

async function addTemplateItem() {
  const name = document.getElementById('tmpl-add-name').value.trim();
  const qty  = parseFloat(document.getElementById('tmpl-add-qty').value) || 1;
  const unit = document.getElementById('tmpl-add-unit').value;
  if (!name) { document.getElementById('tmpl-add-name').focus(); return; }

  closeModal('modal-add-template');
  showLoading();
  try {
    const res = await authFetch('/api/template', {
      method: 'POST',
      body: JSON.stringify({ name, qty, unit })
    });
    if (!res) return;
    const item = await res.json();
    templateList.push(item);
    renderTemplate();
  } catch { showError('Erro ao adicionar item.'); } finally { hideLoading(); }
}

function openEditTemplateModal(id) {
  const item = templateList.find(i => i.id === id);
  if (!item) return;
  editTemplateItemId = id;
  document.getElementById('tmpl-edit-name').value = item.name;
  document.getElementById('tmpl-edit-qty').value  = item.qty;
  document.getElementById('tmpl-edit-unit').value = item.unit;
  openModal('modal-edit-template');
}

async function saveTemplateEdit() {
  const name = document.getElementById('tmpl-edit-name').value.trim();
  const qty  = parseFloat(document.getElementById('tmpl-edit-qty').value) || 1;
  const unit = document.getElementById('tmpl-edit-unit').value;
  if (!name) { document.getElementById('tmpl-edit-name').focus(); return; }

  closeModal('modal-edit-template');
  showLoading();
  try {
    const res = await authFetch(`/api/template/${editTemplateItemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name, qty, unit })
    });
    if (!res) return;
    const updated = await res.json();
    const idx = templateList.findIndex(i => i.id === editTemplateItemId);
    if (idx !== -1) templateList[idx] = updated;
    renderTemplate();
  } catch { showError('Erro ao editar item.'); } finally { hideLoading(); }
}

async function deleteTemplateItem(id) {
  showLoading();
  try {
    const res = await authFetch(`/api/template/${id}`, { method: 'DELETE' });
    if (!res) return;
    templateList = templateList.filter(i => i.id !== id);
    renderTemplate();
  } catch { showError('Erro ao remover item.'); } finally { hideLoading(); }
}
```

- [ ] **Step 5: Atualizar `navigateTo` para chamar `loadTemplate`**

```javascript
  if (view === 'home')     loadHome();
  if (view === 'list')     loadList();
  if (view === 'history')  loadHistory();
  if (view === 'stock')    loadStock();
  if (view === 'template') loadTemplate();
```

- [ ] **Step 6: Verificação manual**

`node server.js` → login → Lista vazia → clicar "Usar lista padrão".  
Expected:
- Tela de Lista Padrão abre com mensagem de lista vazia
- Tocar "Editar lista" → FAB aparece, rodapé some, botão vira "Concluir"
- Adicionar item via FAB → item aparece
- Tocar "Concluir" → volta para modo seleção, todos marcados
- Desmarcar alguns itens → contador do botão atualiza
- Tocar "Adicionar X itens à lista" → redireciona para Lista de Compras com os itens

- [ ] **Step 7: Commit**

```bash
git add public/index.html
git commit -m "feat: add template selection and edit flow"
```

---

## Task 7: Frontend — Alertas de estoque crítico na Home

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Adicionar seção de estoque crítico no HTML da Home**

Localizar `<div id="active-list-card" ...>` (linha ~136). Inserir **antes** desse elemento:

```html
      <div id="critical-stock-card" class="hidden">
        <div class="bg-orange-50 border border-orange-200 rounded-2xl p-4 mb-4 anim">
          <p class="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-2">⚠️ Estoque crítico</p>
          <div id="critical-stock-list"></div>
          <button onclick="navigateTo('stock')" class="text-orange-600 text-sm font-semibold mt-2">
            Ver estoque completo →
          </button>
        </div>
      </div>
```

- [ ] **Step 2: Atualizar `loadHome` para buscar estoque junto**

Localizar a função `loadHome` e adicionar `/api/stock` ao `Promise.all`:

```javascript
async function loadHome() {
  const now = new Date();
  document.getElementById('home-date').textContent = now.toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long'
  });
  showLoading();
  try {
    const [itemsRes, tripsRes, stockRes] = await Promise.all([
      authFetch('/api/items'),
      authFetch('/api/trips'),
      authFetch('/api/stock')
    ]);
    if (!itemsRes || !tripsRes || !stockRes) return;
    activeList = await itemsRes.json();
    trips      = await tripsRes.json();
    stockList  = await stockRes.json();
    renderHome();
  } catch { showError('Erro ao carregar dados.'); } finally { hideLoading(); }
}
```

- [ ] **Step 3: Atualizar `renderHome` para mostrar itens críticos**

Localizar a função `renderHome` e adicionar, **no início** do corpo da função (antes do `const hasItems`):

```javascript
  const criticalItems = stockList.filter(s => s.min_qty > 0 && s.qty < s.min_qty);
  const criticalCard  = document.getElementById('critical-stock-card');
  criticalCard.classList.toggle('hidden', criticalItems.length === 0);
  if (criticalItems.length > 0) {
    document.getElementById('critical-stock-list').innerHTML = criticalItems.map(s => `
      <div class="flex items-center justify-between py-1.5 border-b border-orange-100 last:border-0">
        <span class="text-sm font-medium text-gray-700">${esc(s.name)}</span>
        <span class="text-xs text-orange-600 font-semibold">${s.qty} / ${s.min_qty} ${s.unit}</span>
      </div>
    `).join('');
  }
```

- [ ] **Step 4: Verificação manual**

`node server.js` → login → Estoque → adicionar item com qty < min_qty → voltar à Home.  
Expected: card "⚠️ Estoque crítico" aparece na Home com o item listado. Ao tocar "Ver estoque completo" navega para Estoque.

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "feat: show critical stock section on home screen"
```

---

## Task 8: Frontend — Botão de mostrar/ocultar senha nas configurações

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Adicionar wrapper e botão de olho ao campo de senha em Settings**

Localizar o bloco do campo "Nova senha" na view de configurações:

```html
        <div class="mb-5">
          <label class="block text-sm font-semibold text-gray-600 mb-1">Nova senha</label>
          <input type="password" id="settings-password" placeholder="Deixe em branco para manter" autocomplete="new-password" />
        </div>
```

Substituir por:

```html
        <div class="mb-5">
          <label class="block text-sm font-semibold text-gray-600 mb-1">Nova senha</label>
          <div class="relative">
            <input type="password" id="settings-password" placeholder="Deixe em branco para manter" autocomplete="new-password" style="padding-right:44px" />
            <button type="button" onclick="togglePasswordVisibility()"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              id="settings-eye-btn" aria-label="Mostrar senha">
              <svg id="eye-icon-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-5 h-5">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              <svg id="eye-icon-closed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-5 h-5 hidden">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            </button>
          </div>
        </div>
```

- [ ] **Step 2: Adicionar função JS `togglePasswordVisibility`**

Inserir no `<script>`, antes de `// ===== INIT =====`:

```javascript
function togglePasswordVisibility() {
  const input   = document.getElementById('settings-password');
  const iconOpen = document.getElementById('eye-icon-open');
  const iconClosed = document.getElementById('eye-icon-closed');
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  iconOpen.classList.toggle('hidden', isHidden);
  iconClosed.classList.toggle('hidden', !isHidden);
}
```

- [ ] **Step 3: Verificação manual**

`node server.js` → login → Config.  
Expected:
- Campo de senha mostra ícone de olho aberto à direita
- Tocar no olho → senha aparece em texto, ícone muda para olho com linha (fechado)
- Tocar novamente → volta a ocultar
- Funciona junto com o campo de usuário normalmente

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat: add password visibility toggle in settings"
```

---

## Task 9: Rodar suite completa de testes

- [ ] **Step 1: Rodar todos os testes**

```bash
npm test
```

Expected: todos os testes passam. Saída similar a:

```
PASS tests/auth.test.js
PASS tests/items.test.js
PASS tests/trips.test.js
PASS tests/template.test.js
PASS tests/stock.test.js

Test Suites: 5 passed, 5 total
Tests:       XX passed, XX total
```

- [ ] **Step 2: Se algum teste falhar, investigar e corrigir antes de prosseguir**

---

## Ordem de execução recomendada

Tasks 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9

Tasks 2 e 3 podem ser feitas em paralelo (não dependem uma da outra).  
Tasks 5, 6, 7 e 8 são todas frontend e devem ser feitas sequencialmente (editam o mesmo arquivo).

---

## Nota sobre seed de dados

Após implementar, o usuário fornecerá uma planilha Excel com os produtos e estoque iniciais. Esses dados serão inseridos diretamente no banco via script de seed ou inserção manual na tela de Estoque e Lista Padrão do app.
