# Design: Backend próprio + SQLite para Pizzaria Compras

**Data:** 2026-05-07  
**Status:** Aprovado

## Contexto

O app atual é um HTML único que se conecta diretamente ao Supabase. A migração move o banco para dentro da própria hospedagem, eliminando dependências externas. Qualquer pessoa que acessar o link vê a mesma lista compartilhada.

## Arquitetura

```
Railway (um serviço só)
└── Node.js + Express
    ├── Serve index.html (frontend)
    ├── /api/* (REST API)
    └── SQLite (arquivo local no servidor)
```

Um único repositório, um único deploy, uma URL pública.

## Backend

**Runtime:** Node.js  
**Framework:** Express  
**Banco:** SQLite via `better-sqlite3` (síncrono, zero config)  
**Arquivo do banco:** `data/pizzaria.db` (criado automaticamente na primeira execução)

### Tabelas

```sql
list_items (id, name, qty, unit, checked, total_paid, created_at)
trips      (id, grand_total, finished_at)
trip_items (id, trip_id, name, qty, unit, total_paid)
```

Sem `family_code` — lista única compartilhada para todos.

### Tabela de credenciais

```sql
credentials (id, username, password_hash)
```

Criada com um usuário padrão na primeira execução (`admin` / `pizza123`). Apenas um registro existe sempre.

### Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | /api/login | Valida usuário+senha, retorna token JWT |
| POST | /api/credentials | Atualiza usuário e/ou senha (requer auth) |
| GET | /api/items | Todos os itens da lista ativa (requer auth) |
| POST | /api/items | Adicionar item (requer auth) |
| PATCH | /api/items/:id | Marcar como comprado + registrar preço (requer auth) |
| DELETE | /api/items/:id | Remover item (requer auth) |
| GET | /api/trips | Histórico de compras (requer auth) |
| POST | /api/trips | Finalizar compra (requer auth) |
| GET | /api/trips/:id | Detalhes de uma compra com itens (requer auth) |

**Autenticação:** JWT armazenado no `localStorage`. Todas as rotas `/api/*` (exceto `/api/login`) exigem o header `Authorization: Bearer <token>`. Token expira em 7 dias.

## Frontend

O `index.html` é reescrito para:
- Remover toda dependência do SDK do Supabase
- Chamar os endpoints `/api/*` com `fetch()` nativo
- **Tela de login** — usuário + senha, exibida quando não há token válido
- **Tela de configurações** — acessível pelo menu, permite trocar usuário e senha
- Remover a tela de setup (URL/chave/código familiar) — não é mais necessária
- Manter todo o visual e UX existentes

## Hosting

**Plataforma:** Railway  
**Deploy:** via GitHub (push = deploy automático)  
**Banco de dados:** SQLite persiste em volume no Railway  
**Custo:** gratuito no plano Hobby ($5 de crédito/mês, suficiente para uso leve)

## Estrutura de arquivos

```
pizzaria-compras/
├── server.js          # Express + rotas da API
├── package.json
├── data/              # SQLite (gitignored)
│   └── pizzaria.db
└── public/
    └── index.html     # Frontend reescrito
```
