const { db } = require('../db');

async function auth(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ erro: 'Não autenticado' });
  try {
    const now = new Date().toISOString();
    const r = await db.execute({
      sql: `SELECT s.token, u.id, u.nome, u.email, u.perfil
            FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
            WHERE s.token = ? AND s.expira_em > ? AND u.ativo = 1`,
      args: [token, now]
    });
    if (!r.rows.length) return res.status(401).json({ erro: 'Sessão expirada' });
    req.usuario = r.rows[0];
    next();
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
}

function adminOnly(req, res, next) {
  if (req.usuario?.perfil !== 'admin') return res.status(403).json({ erro: 'Acesso restrito a administradores' });
  next();
}

module.exports = { auth, adminOnly };
