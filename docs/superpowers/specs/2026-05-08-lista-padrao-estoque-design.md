# Design: Lista Padrão + Estoque da Pizzaria

**Data:** 2026-05-08  
**Status:** Aprovado

## Contexto

O app já tem lista de compras, histórico de trips e autenticação JWT. Esta spec adiciona duas funcionalidades:
1. **Lista padrão** — template de produtos que o pai seleciona antes de ir ao mercado
2. **Estoque** — controle de inventário da pizzaria com alertas de mínimo

Também inclui melhoria na tela de configurações: botão de mostrar/ocultar senha.

---

## Banco de dados

Duas novas tabelas adicionadas em `db.js`:

```sql
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
```

**Seed inicial:** os dados reais de produtos e estoque serão fornecidos pelo usuário via planilha Excel no momento da implementação.

### Ligação entre compras e estoque

Ao finalizar uma compra (`POST /api/trips`), após salvar a trip e os trip_items, o sistema percorre cada `trip_item` e busca um `stock_item` com o mesmo nome (comparação case-insensitive). Se encontrar, soma `trip_item.qty` ao `stock_item.qty` e atualiza `updated_at`. Itens sem correspondência são ignorados silenciosamente.

---

## Rotas da API

Todas as rotas exigem `Authorization: Bearer <token>`.

### Lista padrão (`routes/template.js`)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/template` | Retorna itens ordenados por `sort_order` |
| POST | `/api/template` | Adiciona item (`name`, `qty`, `unit` obrigatórios) |
| PATCH | `/api/template/:id` | Edita `name`, `qty` ou `unit` |
| DELETE | `/api/template/:id` | Remove item |

### Estoque (`routes/stock.js`)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/stock` | Retorna todos os itens (inclui `qty` e `min_qty`) |
| POST | `/api/stock` | Adiciona item (`name`, `qty`, `unit`, `min_qty`) |
| PATCH | `/api/stock/:id` | Edita qualquer campo |
| DELETE | `/api/stock/:id` | Remove item |

A rota `POST /api/trips` existente recebe lógica adicional para atualizar o estoque após salvar a trip.

---

## Frontend

### Navegação

O menu inferior ganha um 5º tab **"Estoque"** com ícone de caixa. Ordem: Início · Lista · Histórico · Estoque · Config.

### Home (atualizada)

Nova seção **"⚠️ Estoque crítico"** renderizada entre o card de lista ativa e os stats, visível apenas quando `stock_items` têm `qty < min_qty`. Cada linha mostra nome, qty atual e mínimo configurado. Toque em qualquer linha navega para a aba Estoque.

### Fluxo "Usar lista padrão"

Quando `list_items` está vazia, a tela de lista exibe dois botões: "Usar lista padrão" e "+ Nova lista".

Ao tocar em "Usar lista padrão":
1. Abre tela de seleção (view dedicada `view-template-select`) com todos os `template_items`
2. Todos os itens começam marcados com checkbox
3. Cabeçalho tem botão "Editar lista" que muda para modo edição
4. Botão fixo no rodapé: "Adicionar X itens" (conta os marcados)
5. Ao confirmar, os itens selecionados são inseridos em `list_items` via `POST /api/items` em série
6. Retorna automaticamente para a tela de lista

**Modo edição da lista padrão:**
- FAB (+) para adicionar item novo (mesmo modal de adicionar item da lista de compras)
- Toque no item: abre bottom sheet para editar nome, qty e unit
- Botão de remover (×) visível em cada linha

### Tela Estoque (nova view `view-stock`)

- Lista de todos os `stock_items` ordenados por nome
- Itens com `qty < min_qty` destacados com borda laranja/vermelha e texto de alerta
- FAB (+) para adicionar item: nome, qty inicial, unit, min_qty
- Toque num item: bottom sheet com:
  - Qty atual em destaque
  - Campo de ajuste com seletor Entrada / Saída e valor numérico
  - Seção de edição: nome, unit, min_qty
  - Botão "Remover item" em vermelho

### Configurações — mostrar/ocultar senha

Na tela de configurações, o campo "Nova senha" ganha um botão de olho (👁) no canto direito do input. Ao tocar, alterna o `type` do input entre `password` e `text`. Estado padrão: oculta (bolinhas).

---

## Arquivos a criar/modificar

| Arquivo | Ação |
|---------|------|
| `db.js` | Adicionar tabelas `template_items` e `stock_items` + seed |
| `routes/template.js` | Novo arquivo com CRUD da lista padrão |
| `routes/stock.js` | Novo arquivo com CRUD do estoque |
| `routes/trips.js` | Adicionar lógica de atualização do estoque ao finalizar trip |
| `app.js` | Registrar novas rotas |
| `public/index.html` | Novas views, nav atualizado, fluxo de seleção, botão de olho |
