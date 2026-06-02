const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { auth, adminOnly } = require('../middleware/auth');

router.use(auth);

router.get('/', async (req, res) => {
  try {
    const r = await db.execute('SELECT id, nome, email, perfil, ativo, criado_em FROM usuarios ORDER BY nome');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.post('/', adminOnly, async (req, res) => {
  try {
    const { nome, email, senha, perfil = 'agente' } = req.body;
    if (!nome || !email || !senha) return res.status(400).json({ erro: 'Nome, e-mail e senha obrigatórios' });
    if (senha.length < 6) return res.status(400).json({ erro: 'Senha deve ter ao menos 6 caracteres' });
    if (!['admin','agente'].includes(perfil)) return res.status(400).json({ erro: 'Perfil inválido' });
    const hash = await bcrypt.hash(senha, 10);
    const id = uuidv4();
    await db.execute({ sql: 'INSERT INTO usuarios (id,nome,email,senha_hash,perfil) VALUES (?,?,?,?,?)', args: [id, nome.trim(), email.trim().toLowerCase(), hash, perfil] });
    res.status(201).json({ id, nome, email, perfil });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ erro: 'E-mail já cadastrado' });
    res.status(500).json({ erro: e.message });
  }
});

router.patch('/:id', adminOnly, async (req, res) => {
  try {
    const { nome, perfil, ativo, senha } = req.body;
    if (nome) await db.execute({ sql: 'UPDATE usuarios SET nome=? WHERE id=?', args: [nome, req.params.id] });
    if (perfil && ['admin','agente'].includes(perfil)) await db.execute({ sql: 'UPDATE usuarios SET perfil=? WHERE id=?', args: [perfil, req.params.id] });
    if (typeof ativo === 'number') await db.execute({ sql: 'UPDATE usuarios SET ativo=? WHERE id=?', args: [ativo, req.params.id] });
    if (senha && senha.length >= 6) {
      const hash = await bcrypt.hash(senha, 10);
      await db.execute({ sql: 'UPDATE usuarios SET senha_hash=? WHERE id=?', args: [hash, req.params.id] });
    }
    const r = await db.execute({ sql: 'SELECT id,nome,email,perfil,ativo FROM usuarios WHERE id=?', args: [req.params.id] });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.delete('/:id', adminOnly, async (req, res) => {
  try {
    const total = await db.execute('SELECT COUNT(*) as n FROM usuarios WHERE ativo=1');
    if (Number(total.rows[0].n) <= 1) return res.status(400).json({ erro: 'Não é possível remover o único usuário ativo' });
    await db.execute({ sql: 'DELETE FROM sessoes WHERE usuario_id=?', args: [req.params.id] });
    await db.execute({ sql: 'DELETE FROM usuarios WHERE id=?', args: [req.params.id] });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
