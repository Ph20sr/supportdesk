# SupportDesk Pro

Sistema empresarial de tickets de suporte — nível produção.

## Funcionalidades

- **Tickets completos** — categorias, prioridade, status detalhado (5 estágios), tags, versão do sistema
- **SLA automático** — prazo calculado por prioridade, alertas de vencimento com badge pulsante
- **Atribuição de agentes** — tickets atribuídos a membros da equipe, filtro por agente
- **Comentários** — respostas públicas + notas internas (não enviadas ao cliente)
- **Anexos** — upload de arquivos por ticket (até 10MB), download seguro
- **Histórico completo** — log de todas as alterações com autor e timestamp
- **Dashboard com gráficos** — volume, categorias, status, SLA compliance, desempenho por agente
- **Clientes** — cadastro com histórico de tickets
- **Equipe** — múltiplos agentes com perfis admin / agente
- **E-mail** — notificações automáticas de abertura, status e comentários
- **Dark mode** — alternância com persistência no localStorage
- **Paginação** — lista de tickets com 25 por página

## Stack

- **Backend:** Node.js + Express
- **Banco:** SQLite (libsql)  
- **Frontend:** HTML/CSS/JS puro + Chart.js
- **E-mail:** Nodemailer (SMTP configurável)
- **Upload:** Multer

## Deploy no Railway

### 1. Subir para GitHub

```bash
git init
git add .
git commit -m "SupportDesk Pro v2.0"
git remote add origin https://github.com/SEU_USUARIO/supportdesk-pro.git
git push -u origin main
```

### 2. Criar projeto no Railway

1. [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**
2. Selecione o repositório
3. Railway detecta Node.js e faz o build automaticamente

### 3. Adicionar Volume (persistência)

1. No painel do serviço → **Volumes → Add Volume**
2. Mount path: `/data`
3. Banco + uploads salvos em `/data/`

### 4. Variáveis de ambiente

| Variável | Descrição | Exemplo |
|---|---|---|
| `PORT` | Porta (Railway define automaticamente) | `3000` |
| `RAILWAY_VOLUME_MOUNT_PATH` | Caminho do volume | `/data` |
| `SMTP_HOST` | Servidor SMTP | `smtp.gmail.com` |
| `SMTP_PORT` | Porta SMTP | `587` |
| `SMTP_USER` | Usuário SMTP | `seu@gmail.com` |
| `SMTP_PASS` | Senha SMTP / App Password | `••••••••` |
| `SMTP_FROM` | Remetente | `SupportDesk <noreply@empresa.com>` |
| `BASE_URL` | URL pública do sistema | `https://app.railway.app` |

> **Gmail:** Use uma App Password (Conta Google → Segurança → Senhas de app)

## Usuário padrão

Criado automaticamente no primeiro start:
```
E-mail: admin@suporte.com
Senha:  admin123
```
**Troque a senha assim que fizer o deploy!**

## SLA por prioridade

| Prioridade | Prazo |
|---|---|
| Crítica | 4 horas |
| Alta | 8 horas |
| Média | 24 horas |
| Baixa | 72 horas |

## API REST

Todas as rotas exigem `Authorization: Bearer {token}`.

### Autenticação
```
POST /api/auth/login    → { email, senha }
POST /api/auth/logout
GET  /api/auth/me
```

### Tickets
```
GET    /api/tickets?status=&prioridade=&agente_id=&sla_status=&q=&limit=&offset=&order=
GET    /api/tickets/:id
POST   /api/tickets
PATCH  /api/tickets/:id
DELETE /api/tickets/:id

POST   /api/tickets/:id/comentarios  → { conteudo, interno }
DELETE /api/tickets/:id/comentarios/:cid

POST   /api/tickets/:id/anexos       → multipart/form-data (arquivo)
GET    /api/tickets/:id/anexos/:nome → download
DELETE /api/tickets/:id/anexos/:aid
```

### Clientes / Usuários / Dashboard
```
GET/POST/PATCH/DELETE /api/clientes/:id
GET/POST/PATCH/DELETE /api/usuarios/:id
GET /api/dashboard/resumo
GET/POST /api/dashboard/config
```

## Rodar localmente

```bash
npm install
npm run dev    # nodemon (hot reload)
npm start      # produção
```

Acesse: http://localhost:3000
