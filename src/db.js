const { createClient } = require('@libsql/client');
const path = require('path');
const fs = require('fs');

const DB_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = createClient({ url: `file:${path.join(DB_DIR, 'supportdesk.db')}` });

const SLA_HOURS = { 'Crítica': 4, 'Alta': 8, 'Média': 24, 'Baixa': 72 };

async function initDb() {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      perfil TEXT NOT NULL DEFAULT 'agente',
      ativo INTEGER NOT NULL DEFAULT 1,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessoes (
      token TEXT PRIMARY KEY,
      usuario_id TEXT NOT NULL,
      expira_em DATETIME NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clientes (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      email TEXT,
      empresa TEXT,
      telefone TEXT,
      observacoes TEXT,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      titulo TEXT NOT NULL,
      descricao TEXT NOT NULL,
      categoria TEXT NOT NULL,
      prioridade TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Aberto',
      cliente_id TEXT,
      cliente_nome TEXT NOT NULL,
      cliente_email TEXT,
      cliente_empresa TEXT,
      agente_id TEXT,
      agente_nome TEXT,
      criado_por TEXT NOT NULL,
      criado_por_nome TEXT,
      tags TEXT DEFAULT '',
      versao TEXT DEFAULT '',
      sla_deadline DATETIME,
      sla_status TEXT DEFAULT 'ok',
      resolvido_em DATETIME,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS comentarios (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      usuario_id TEXT NOT NULL,
      usuario_nome TEXT NOT NULL,
      conteudo TEXT NOT NULL,
      interno INTEGER NOT NULL DEFAULT 0,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS historico (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      usuario_id TEXT NOT NULL,
      usuario_nome TEXT NOT NULL,
      tipo TEXT NOT NULL,
      campo TEXT,
      valor_antes TEXT,
      valor_depois TEXT,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS anexos (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      usuario_id TEXT NOT NULL,
      usuario_nome TEXT NOT NULL,
      nome_original TEXT NOT NULL,
      nome_arquivo TEXT NOT NULL,
      tamanho INTEGER,
      mimetype TEXT,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS configuracoes (
      chave TEXT PRIMARY KEY,
      valor TEXT
    );

    CREATE TRIGGER IF NOT EXISTS trg_ticket_updated
    AFTER UPDATE ON tickets
    BEGIN
      UPDATE tickets SET atualizado_em = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;
  `);

  const bcrypt = require('bcryptjs');
  const { v4: uuidv4 } = require('uuid');
  const existe = await db.execute("SELECT id FROM usuarios WHERE email = 'admin@suporte.com'");
  if (!existe.rows.length) {
    const hash = await bcrypt.hash('admin123', 10);
    await db.execute({
      sql: "INSERT INTO usuarios (id, nome, email, senha_hash, perfil) VALUES (?, ?, ?, ?, ?)",
      args: [uuidv4(), 'Administrador', 'admin@suporte.com', hash, 'admin']
    });
    console.log('Admin criado: admin@suporte.com / admin123');
  }
}

module.exports = { db, SLA_HOURS, initDb };
