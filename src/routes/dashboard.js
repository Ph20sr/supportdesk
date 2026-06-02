const router = require('express').Router();
const { db } = require('../db');
const { auth } = require('../middleware/auth');

router.use(auth);

router.get('/resumo', async (req, res) => {
  try {
    const [byStatus, byPrio, byAgente, byCat, slaStats, recentes, tempoMedio] = await Promise.all([
      db.execute("SELECT status, COUNT(*) as n FROM tickets GROUP BY status"),
      db.execute("SELECT prioridade, COUNT(*) as n FROM tickets WHERE status NOT IN ('Resolvido','Fechado') GROUP BY prioridade"),
      db.execute(`SELECT agente_nome, agente_id, COUNT(*) as total,
                  SUM(CASE WHEN status NOT IN ('Resolvido','Fechado') THEN 1 ELSE 0 END) as abertos,
                  SUM(CASE WHEN status IN ('Resolvido','Fechado') THEN 1 ELSE 0 END) as resolvidos
                  FROM tickets WHERE agente_id IS NOT NULL GROUP BY agente_id ORDER BY total DESC`),
      db.execute("SELECT categoria, COUNT(*) as n FROM tickets GROUP BY categoria ORDER BY n DESC LIMIT 8"),
      db.execute(`SELECT
                  SUM(CASE WHEN sla_status='vencido' AND status NOT IN ('Resolvido','Fechado') THEN 1 ELSE 0 END) as vencidos,
                  SUM(CASE WHEN sla_status='critico' AND status NOT IN ('Resolvido','Fechado') THEN 1 ELSE 0 END) as criticos,
                  SUM(CASE WHEN sla_status='atencao' AND status NOT IN ('Resolvido','Fechado') THEN 1 ELSE 0 END) as atencao,
                  SUM(CASE WHEN status IN ('Resolvido','Fechado') THEN 1 ELSE 0 END) as cumpridos,
                  COUNT(*) as total FROM tickets`),
      db.execute("SELECT id, titulo, status, prioridade, sla_status, cliente_nome, agente_nome, criado_em FROM tickets ORDER BY criado_em DESC LIMIT 10"),
      db.execute(`SELECT AVG(
                    (julianday(resolvido_em) - julianday(criado_em)) * 24
                  ) as media_horas FROM tickets WHERE resolvido_em IS NOT NULL`),
    ]);

    // tickets por dia — últimos 30 dias
    const porDia = await db.execute(`
      SELECT DATE(criado_em) as dia, COUNT(*) as n
      FROM tickets
      WHERE criado_em >= datetime('now', '-30 days')
      GROUP BY DATE(criado_em)
      ORDER BY dia`);

    const porDiaResolvidos = await db.execute(`
      SELECT DATE(resolvido_em) as dia, COUNT(*) as n
      FROM tickets
      WHERE resolvido_em >= datetime('now', '-30 days')
      GROUP BY DATE(resolvido_em)
      ORDER BY dia`);

    res.json({
      byStatus: byStatus.rows,
      byPrioridade: byPrio.rows,
      byAgente: byAgente.rows,
      byCategoria: byCat.rows,
      sla: slaStats.rows[0],
      recentes: recentes.rows,
      tempoMedioHoras: tempoMedio.rows[0]?.media_horas ? Math.round(tempoMedio.rows[0].media_horas * 10) / 10 : null,
      porDia: porDia.rows,
      porDiaResolvidos: porDiaResolvidos.rows,
    });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// Configurações de e-mail
router.get('/config', auth, async (req, res) => {
  try {
    const r = await db.execute("SELECT chave, valor FROM configuracoes");
    const cfg = {};
    r.rows.forEach(row => { if (!row.chave.includes('pass')) cfg[row.chave] = row.valor; });
    res.json(cfg);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

router.post('/config', auth, async (req, res) => {
  try {
    for (const [k, v] of Object.entries(req.body)) {
      await db.execute({ sql: 'INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES (?,?)', args: [k, v] });
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

module.exports = router;
