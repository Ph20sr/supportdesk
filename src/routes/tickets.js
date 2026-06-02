const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db, SLA_HOURS } = require('../db');
const { auth } = require('../middleware/auth');
const { calcDeadline, calcSlaStatus } = require('../services/sla');
const email = require('../services/email');

router.use(auth);

const UPLOAD_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'uploads')
  : path.join(__dirname, '../../data/uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const PRIORIDADES = ['Crítica', 'Alta', 'Média', 'Baixa'];
const STATUS = ['Aberto', 'Em andamento', 'Aguardando cliente', 'Resolvido', 'Fechado'];

async function nextId() {
  const r = await db.execute("SELECT id FROM tickets ORDER BY criado_em DESC LIMIT 1");
  if (!r.rows.length) return 'TK-0001';
  const num = parseInt(r.rows[0].id.replace('TK-', '')) + 1;
  return 'TK-' + String(num).padStart(4, '0');
}

async function logHistorico(ticket_id, usuario, tipo, campo, antes, depois) {
  await db.execute({
    sql: 'INSERT INTO historico (id,ticket_id,usuario_id,usuario_nome,tipo,campo,valor_antes,valor_depois) VALUES (?,?,?,?,?,?,?,?)',
    args: [uuidv4(), ticket_id, usuario.id, usuario.nome, tipo, campo||null, antes||null, depois||null]
  });
}

// ── LIST ──────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { status, prioridade, agente_id, sla_status, q, tags, limit=50, offset=0, order='criado_em', dir='DESC' } = req.query;
    let sql = 'SELECT * FROM tickets WHERE 1=1';
    const args = [];
    if (status)     { sql += ' AND status=?'; args.push(status); }
    if (prioridade) { sql += ' AND prioridade=?'; args.push(prioridade); }
    if (agente_id)  { sql += ' AND agente_id=?'; args.push(agente_id); }
    if (sla_status) { sql += ' AND sla_status=?'; args.push(sla_status); }
    if (tags)       { sql += ' AND tags LIKE ?'; args.push(`%${tags}%`); }
    if (q) {
      sql += ' AND (titulo LIKE ? OR cliente_nome LIKE ? OR cliente_empresa LIKE ? OR id LIKE ?)';
      args.push(`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`);
    }
    const safeOrder = ['criado_em','atualizado_em','sla_deadline','prioridade'].includes(order) ? order : 'criado_em';
    const safeDir = dir === 'ASC' ? 'ASC' : 'DESC';
    sql += ` ORDER BY ${safeOrder} ${safeDir} LIMIT ? OFFSET ?`;
    args.push(Number(limit), Number(offset));

    const [tickets, meta] = await Promise.all([
      db.execute({ sql, args }),
      db.execute('SELECT status, COUNT(*) as n FROM tickets GROUP BY status'),
    ]);

    const slaVencido = await db.execute("SELECT COUNT(*) as n FROM tickets WHERE sla_status='vencido' AND status NOT IN ('Resolvido','Fechado')");
    const slaCritico = await db.execute("SELECT COUNT(*) as n FROM tickets WHERE sla_status='critico' AND status NOT IN ('Resolvido','Fechado')");
    const total = await db.execute('SELECT COUNT(*) as n FROM tickets');

    const byStatus = {};
    for (const row of meta.rows) byStatus[row.status] = Number(row.n);

    res.json({
      tickets: tickets.rows,
      meta: {
        total: Number(total.rows[0].n),
        byStatus,
        slaVencido: Number(slaVencido.rows[0].n),
        slaCritico: Number(slaCritico.rows[0].n),
      }
    });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ── GET ONE ───────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [ticket, comentarios, historico, anexos] = await Promise.all([
      db.execute({ sql: 'SELECT * FROM tickets WHERE id=?', args: [req.params.id] }),
      db.execute({ sql: 'SELECT * FROM comentarios WHERE ticket_id=? ORDER BY criado_em', args: [req.params.id] }),
      db.execute({ sql: 'SELECT * FROM historico WHERE ticket_id=? ORDER BY criado_em', args: [req.params.id] }),
      db.execute({ sql: 'SELECT * FROM anexos WHERE ticket_id=? ORDER BY criado_em', args: [req.params.id] }),
    ]);
    if (!ticket.rows.length) return res.status(404).json({ erro: 'Ticket não encontrado' });
    res.json({ ...ticket.rows[0], comentarios: comentarios.rows, historico: historico.rows, anexos: anexos.rows });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ── CREATE ────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { titulo, descricao, categoria, prioridade, cliente_id, cliente_nome, cliente_email, cliente_empresa, agente_id, tags, versao } = req.body;
    if (!titulo||!descricao||!categoria||!prioridade||!cliente_nome) return res.status(400).json({ erro: 'Campos obrigatórios: titulo, descricao, categoria, prioridade, cliente_nome' });
    if (!PRIORIDADES.includes(prioridade)) return res.status(400).json({ erro: 'Prioridade inválida' });

    let agente_nome = null;
    if (agente_id) {
      const ag = await db.execute({ sql: 'SELECT nome, email FROM usuarios WHERE id=?', args: [agente_id] });
      if (ag.rows.length) agente_nome = ag.rows[0].nome;
    }

    const id = await nextId();
    const sla_deadline = calcDeadline(prioridade, new Date().toISOString());
    const sla_status = calcSlaStatus(sla_deadline, 'Aberto');

    await db.execute({
      sql: `INSERT INTO tickets (id,titulo,descricao,categoria,prioridade,cliente_id,cliente_nome,cliente_email,cliente_empresa,agente_id,agente_nome,criado_por,criado_por_nome,tags,versao,sla_deadline,sla_status)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [id, titulo.trim(), descricao.trim(), categoria, prioridade, cliente_id||null, cliente_nome.trim(), cliente_email||'', cliente_empresa||'', agente_id||null, agente_nome, req.usuario.id, req.usuario.nome, tags||'', versao||'', sla_deadline, sla_status]
    });

    await logHistorico(id, req.usuario, 'criacao', null, null, 'Ticket criado');

    const r = await db.execute({ sql: 'SELECT * FROM tickets WHERE id=?', args: [id] });
    const t = r.rows[0];

    // email assíncrono
    const agenteEmail = agente_id ? (await db.execute({ sql: 'SELECT email FROM usuarios WHERE id=?', args: [agente_id] })).rows[0]?.email : null;
    email.notificarAbertura(t, agenteEmail).catch(()=>{});

    res.status(201).json(t);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ── UPDATE ────────────────────────────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  try {
    const r = await db.execute({ sql: 'SELECT * FROM tickets WHERE id=?', args: [req.params.id] });
    if (!r.rows.length) return res.status(404).json({ erro: 'Ticket não encontrado' });
    const antes = r.rows[0];
    const { status, prioridade, agente_id, tags, titulo, categoria, versao } = req.body;

    if (status && !STATUS.includes(status)) return res.status(400).json({ erro: 'Status inválido' });
    if (prioridade && !PRIORIDADES.includes(prioridade)) return res.status(400).json({ erro: 'Prioridade inválida' });

    if (status && status !== antes.status) {
      const resolvido_em = status === 'Resolvido' ? new Date().toISOString() : null;
      const novo_sla = calcSlaStatus(antes.sla_deadline, status);
      await db.execute({ sql: 'UPDATE tickets SET status=?, sla_status=?, resolvido_em=? WHERE id=?', args: [status, novo_sla, resolvido_em, req.params.id] });
      await logHistorico(req.params.id, req.usuario, 'status', 'status', antes.status, status);
      email.notificarStatusChange({ ...antes, status }, antes.status, antes.cliente_email).catch(()=>{});
    }
    if (prioridade && prioridade !== antes.prioridade) {
      const nova_deadline = calcDeadline(prioridade, antes.criado_em);
      await db.execute({ sql: 'UPDATE tickets SET prioridade=?, sla_deadline=? WHERE id=?', args: [prioridade, nova_deadline, req.params.id] });
      await logHistorico(req.params.id, req.usuario, 'prioridade', 'prioridade', antes.prioridade, prioridade);
    }
    if (agente_id !== undefined) {
      let agente_nome = null;
      if (agente_id) {
        const ag = await db.execute({ sql: 'SELECT nome FROM usuarios WHERE id=?', args: [agente_id] });
        agente_nome = ag.rows[0]?.nome || null;
      }
      await db.execute({ sql: 'UPDATE tickets SET agente_id=?, agente_nome=? WHERE id=?', args: [agente_id||null, agente_nome, req.params.id] });
      await logHistorico(req.params.id, req.usuario, 'atribuicao', 'agente', antes.agente_nome||'—', agente_nome||'—');
    }
    if (tags !== undefined) await db.execute({ sql: 'UPDATE tickets SET tags=? WHERE id=?', args: [tags, req.params.id] });
    if (titulo) await db.execute({ sql: 'UPDATE tickets SET titulo=? WHERE id=?', args: [titulo, req.params.id] });
    if (categoria) await db.execute({ sql: 'UPDATE tickets SET categoria=? WHERE id=?', args: [categoria, req.params.id] });
    if (versao !== undefined) await db.execute({ sql: 'UPDATE tickets SET versao=? WHERE id=?', args: [versao, req.params.id] });

    const updated = await db.execute({ sql: 'SELECT * FROM tickets WHERE id=?', args: [req.params.id] });
    res.json(updated.rows[0]);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ── DELETE ────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM comentarios WHERE ticket_id=?', args: [req.params.id] });
    await db.execute({ sql: 'DELETE FROM historico WHERE ticket_id=?', args: [req.params.id] });
    await db.execute({ sql: 'DELETE FROM anexos WHERE ticket_id=?', args: [req.params.id] });
    const r = await db.execute({ sql: 'DELETE FROM tickets WHERE id=?', args: [req.params.id] });
    if (r.rowsAffected === 0) return res.status(404).json({ erro: 'Ticket não encontrado' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ── COMENTÁRIOS ───────────────────────────────────────────────────────────────
router.post('/:id/comentarios', async (req, res) => {
  try {
    const { conteudo, interno = false } = req.body;
    if (!conteudo?.trim()) return res.status(400).json({ erro: 'Conteúdo obrigatório' });
    const ticket = await db.execute({ sql: 'SELECT * FROM tickets WHERE id=?', args: [req.params.id] });
    if (!ticket.rows.length) return res.status(404).json({ erro: 'Ticket não encontrado' });
    const id = uuidv4();
    await db.execute({
      sql: 'INSERT INTO comentarios (id,ticket_id,usuario_id,usuario_nome,conteudo,interno) VALUES (?,?,?,?,?,?)',
      args: [id, req.params.id, req.usuario.id, req.usuario.nome, conteudo.trim(), interno ? 1 : 0]
    });
    await logHistorico(req.params.id, req.usuario, 'comentario', null, null, interno ? 'Nota interna adicionada' : 'Comentário adicionado');
    const t = ticket.rows[0];
    const com = { id, ticket_id: req.params.id, usuario_id: req.usuario.id, usuario_nome: req.usuario.nome, conteudo: conteudo.trim(), interno: interno ? 1 : 0 };
    email.notificarComentario(t, com, t.cliente_email).catch(()=>{});
    res.status(201).json(com);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.delete('/:id/comentarios/:cid', async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM comentarios WHERE id=? AND ticket_id=?', args: [req.params.cid, req.params.id] });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ── ANEXOS ────────────────────────────────────────────────────────────────────
router.post('/:id/anexos', upload.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ erro: 'Arquivo obrigatório' });
    const id = uuidv4();
    await db.execute({
      sql: 'INSERT INTO anexos (id,ticket_id,usuario_id,usuario_nome,nome_original,nome_arquivo,tamanho,mimetype) VALUES (?,?,?,?,?,?,?,?)',
      args: [id, req.params.id, req.usuario.id, req.usuario.nome, req.file.originalname, req.file.filename, req.file.size, req.file.mimetype]
    });
    await logHistorico(req.params.id, req.usuario, 'anexo', null, null, `Arquivo anexado: ${req.file.originalname}`);
    res.status(201).json({ id, nome_original: req.file.originalname, nome_arquivo: req.file.filename, tamanho: req.file.size, mimetype: req.file.mimetype });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.get('/:id/anexos/:nome', async (req, res) => {
  try {
    const r = await db.execute({ sql: 'SELECT * FROM anexos WHERE nome_arquivo=? AND ticket_id=?', args: [req.params.nome, req.params.id] });
    if (!r.rows.length) return res.status(404).json({ erro: 'Arquivo não encontrado' });
    const filePath = path.join(UPLOAD_DIR, req.params.nome);
    res.download(filePath, r.rows[0].nome_original);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.delete('/:id/anexos/:aid', async (req, res) => {
  try {
    const r = await db.execute({ sql: 'SELECT nome_arquivo FROM anexos WHERE id=? AND ticket_id=?', args: [req.params.aid, req.params.id] });
    if (r.rows.length) {
      const fp = path.join(UPLOAD_DIR, r.rows[0].nome_arquivo);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    await db.execute({ sql: 'DELETE FROM anexos WHERE id=?', args: [req.params.aid] });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
