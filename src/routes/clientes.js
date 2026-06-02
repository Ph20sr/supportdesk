const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { auth } = require('../middleware/auth');

router.use(auth);

router.get('/', async (req, res) => {
  try {
    const { q } = req.query;
    let sql = 'SELECT c.*, (SELECT COUNT(*) FROM tickets t WHERE t.cliente_id=c.id) as total_tickets FROM clientes c WHERE 1=1';
    const args = [];
    if (q) { sql += ' AND (c.nome LIKE ? OR c.empresa LIKE ? OR c.email LIKE ?)'; args.push(`%${q}%`,`%${q}%`,`%${q}%`); }
    sql += ' ORDER BY c.nome';
    const r = await db.execute({ sql, args });
    res.json(r.rows);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const r = await db.execute({ sql: 'SELECT * FROM clientes WHERE id=?', args: [req.params.id] });
    if (!r.rows.length) return res.status(404).json({ erro: 'Cliente não encontrado' });
    const tickets = await db.execute({ sql: 'SELECT id,titulo,status,prioridade,criado_em FROM tickets WHERE cliente_id=? ORDER BY criado_em DESC', args: [req.params.id] });
    res.json({ ...r.rows[0], tickets: tickets.rows });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { nome, email, empresa, telefone, observacoes } = req.body;
    if (!nome) return res.status(400).json({ erro: 'Nome obrigatório' });
    const id = uuidv4();
    await db.execute({ sql: 'INSERT INTO clientes (id,nome,email,empresa,telefone,observacoes) VALUES (?,?,?,?,?,?)', args: [id, nome.trim(), email||'', empresa||'', telefone||'', observacoes||''] });
    const r = await db.execute({ sql: 'SELECT * FROM clientes WHERE id=?', args: [id] });
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const fields = ['nome','email','empresa','telefone','observacoes'];
    for (const f of fields) {
      if (req.body[f] !== undefined) await db.execute({ sql: `UPDATE clientes SET ${f}=? WHERE id=?`, args: [req.body[f], req.params.id] });
    }
    const r = await db.execute({ sql: 'SELECT * FROM clientes WHERE id=?', args: [req.params.id] });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM clientes WHERE id=?', args: [req.params.id] });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
