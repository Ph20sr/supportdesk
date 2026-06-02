const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { auth } = require('../middleware/auth');

const SESSION_HOURS = 8;

router.post('/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) return res.status(400).json({ erro: 'E-mail e senha obrigatórios' });
    const r = await db.execute({ sql: 'SELECT * FROM usuarios WHERE email=? AND ativo=1', args: [email.trim().toLowerCase()] });
    if (!r.rows.length) return res.status(401).json({ erro: 'Credenciais inválidas' });
    const u = r.rows[0];
    if (!await bcrypt.compare(senha, u.senha_hash)) return res.status(401).json({ erro: 'Credenciais inválidas' });
    const token = uuidv4() + uuidv4();
    const expira = new Date(Date.now() + SESSION_HOURS * 3600000).toISOString();
    await db.execute({ sql: 'INSERT INTO sessoes (token, usuario_id, expira_em) VALUES (?,?,?)', args: [token, u.id, expira] });
    res.json({ token, id: u.id, nome: u.nome, email: u.email, perfil: u.perfil });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.post('/logout', auth, async (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  await db.execute({ sql: 'DELETE FROM sessoes WHERE token=?', args: [token] }).catch(() => {});
  res.json({ ok: true });
});

router.get('/me', auth, (req, res) => {
  res.json({ id: req.usuario.id, nome: req.usuario.nome, email: req.usuario.email, perfil: req.usuario.perfil });
});

router.get('/setup', async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const { v4: uuidv4 } = require('uuid');
    await db.execute({ sql: 'DELETE FROM usuarios WHERE email=?', args: ['admin@suporte.com'] });
    await db.execute({ sql: 'DELETE FROM sessoes', args: [] });
    const hash = await bcrypt.hash('admin123', 10);
    await db.execute({
      sql: "INSERT INTO usuarios (id, nome, email, senha_hash, perfil, ativo) VALUES (?, ?, ?, ?, ?, ?)",
      args: [uuidv4(), 'Administrador', 'admin@suporte.com', hash, 'admin', 1]
    });
    res.json({ ok: true, mensagem: 'Admin recriado! Use: admin@suporte.com / admin123' });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;