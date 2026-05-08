# Design: Melhorias UI + Novas Funcionalidades
**Data:** 2026-05-08  
**Status:** Aprovado

## Resumo

Conjunto de 9 melhorias no app Compras da Pizzaria, cobrindo: cores, categorias, análise detalhada, compras avulsas, nome do mercado, edição/exclusão de compras, unidade do estoque na lista, seleção em massa no template, e manual de funções.

---

## 1. Banco de Dados

### Migrações (ALTER TABLE + CREATE TABLE — sem destruir dados)

```sql
ALTER TABLE template_items ADD COLUMN category TEXT NOT NULL DEFAULT '';
ALTER TABLE stock_items     ADD COLUMN category TEXT NOT NULL DEFAULT '';
ALTER TABLE trips           ADD COLUMN store_name TEXT NOT NULL DEFAULT '';

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
```

Dados existentes não são afetados — campos novos ficam com valor vazio/zero.

---

## 2. Rotas Backend

### Novas
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/avulsas` | Lista todas as compras avulsas |
| POST | `/api/avulsas` | Registra compra avulsa |
| DELETE | `/api/avulsas/:id` | Exclui compra avulsa |
| GET | `/api/analytics` | Dados analíticos para a Home |

### Modificadas
| Método | Rota | Mudança |
|--------|------|---------|
| POST | `/api/trips` | Aceita `store_name` no body |
| PATCH | `/api/trips/:id` | Edita `store_name` e `finished_at` |
| DELETE | `/api/trips/:id` | Exclui trip + trip_items (cascade) |
| GET/POST/PATCH | `/api/template` | Aceita e retorna campo `category` |
| GET/POST/PATCH | `/api/stock` | Aceita e retorna campo `category` |

### Analytics endpoint
`GET /api/analytics?month=YYYY-MM`  
Retorna:
```json
{
  "month_total": 0,
  "month_trips": 0,
  "avg_ticket": 0,
  "top_products": [{ "name": "", "total": 0, "count": 0 }],
  "monthly_totals": [{ "month": "2026-04", "total": 0 }]
}
```

---

## 3. Frontend — Cores

| Elemento | Antes | Depois |
|----------|-------|--------|
| Fundo da página | `bg-white` / `bg-gray-50` | Bege quente `#faf7f3` |
| Cards de estatísticas | Branco simples | Gradientes coloridos |
| Stat "Idas ao mercado" | Texto vermelho | Gradiente azul |
| Stat "Total do mês" | Texto vermelho | Gradiente verde |
| Borda item com categoria | Sem cor | Borda lateral colorida por categoria |

### Paleta de categorias
| Categoria | Cor | Hex |
|-----------|-----|-----|
| Carne | Âmbar | `#f97316` |
| Laticínios | Azul | `#0ea5e9` |
| Doces | Rosa | `#ec4899` |
| Outros / vazio | Slate | `#64748b` |

### Tema Compras Avulsas
- Primário: roxo `#7c3aed`
- Header e botões da aba avulsas usam roxo em vez de vermelho

---

## 4. Lista Padrão (Template)

### Seleção em massa
- Botão **"Selecionar tudo"** / **"Desmarcar tudo"** toggle no topo da lista (modo seleção)
- Funciona como toggle: se todos selecionados → desmarca tudo; caso contrário → seleciona tudo

### Filtros por categoria
- Row de chips abaixo do header: `Todos | Carne | Laticínios | Doces | Outros`
- Chip ativo fica com cor da categoria (fundo colorido)
- Filtro só mostra itens da categoria selecionada (sem recarregar do servidor)

### Campo categoria nos modais
- Modal "Adicionar à Lista Padrão" e "Editar Item" ganham `<select>` de categoria
- Opções: Todos, Carne, Laticínios, Doces, Outros

---

## 5. Lista Ativa

### Unidade do estoque
- Ao confirmar a seleção do template, o backend (ou frontend) verifica se existe um `stock_item` com o mesmo nome (case-insensitive)
- Se existir: usa `stock_items.unit` para o item na lista
- Se não existir: usa a unidade do template (comportamento atual)
- Implementado no `confirmTemplateSelect()` no frontend antes do POST `/api/items`

---

## 6. Finalizar Compra

### Campo "Nome do mercado"
- Modal de finalização (`modal-finish`) ganha campo de texto antes do botão "Salvar compra"
- Placeholder: "Ex: Atacadão, Assaí, BH..."
- Valor enviado no body de `POST /api/trips` como `store_name`

---

## 7. Histórico de Compras

### Cards do histórico
- Exibe nome do mercado abaixo da data (quando preenchido)

### Tela de detalhe da compra
- Botão **Editar** → abre modal com campos: nome do mercado e data da compra
- Botão **Excluir** → confirmação → `DELETE /api/trips/:id` → volta para histórico

---

## 8. Home — Analytics Expandido

### Novo layout da seção de estatísticas
- Seletor de mês: `← Maio 2026 →`
- Cards coloridos: Total gasto (verde), Idas ao mercado (azul), Ticket médio (laranja)
- Top 5 produtos do mês: lista com barras de progresso relativas
- Substitui os 2 cards simples atuais

### Dados
- Carregado via `GET /api/analytics?month=YYYY-MM` ao trocar o mês selecionado

---

## 9. Compras Avulsas

### Nova aba (6ª posição na nav)
- Ícone: sacola de compras
- Cor ativa: roxo `#7c3aed`

### Funcionalidade
- Formulário fixo no topo: produto, qtd, unidade, preço pago, mercado
- Botão "Registrar compra avulsa" → `POST /api/avulsas`
- Lista de compras avulsas abaixo, ordenadas por data desc
- Botão × em cada item para excluir

### Separação no histórico
- A tela de histórico mostra trips normais + opcionalmente avulsas com badge "Avulsa"
- Ou mantém histórico separado (apenas trips na aba Histórico, avulsas na aba Avulsas)
- **Decisão:** avulsas ficam apenas na aba Avulsas, histórico mantém apenas trips da lista

---

## 10. Manual de Funções

### Implementação
- Botão **?** no header de cada view (ao lado do título)
- Clique abre `modal-help` com conteúdo contextual por view
- Modal com scroll, título e descrição de cada função disponível na tela atual

### Conteúdo por tela
| Tela | O que explica |
|------|---------------|
| Home | Dashboard, seletor de mês, estoque crítico |
| Lista | Adicionar item, marcar como comprado, finalizar |
| Template | Selecionar tudo, filtros, editar lista padrão |
| Histórico | Ver detalhes, editar mercado, excluir compra |
| Estoque | Adicionar produto, ajustar quantidade, nível mínimo |
| Avulsas | Como registrar uma compra rápida sem lista |

---

## Ordem de implementação sugerida

1. Migrações do banco de dados (`db.js`)
2. Rotas backend: analytics, avulsas, trips PATCH/DELETE, campo category
3. Tema de cores (CSS no `<style>`)
4. Template: campo category, filtros, selecionar tudo
5. Lista ativa: unidade do estoque no confirmTemplateSelect
6. Finalização: campo store_name no modal e route
7. Histórico: mostrar mercado, editar/excluir trip
8. Home: analytics expandido com seletor de mês
9. Compras avulsas: nova aba + view
10. Manual de funções: modal de ajuda contextual
