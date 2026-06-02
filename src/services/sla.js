const { db, SLA_HOURS } = require('../db');

function calcDeadline(prioridade, criadoEm) {
  const hours = SLA_HOURS[prioridade] || 24;
  const base = criadoEm ? new Date(criadoEm) : new Date();
  return new Date(base.getTime() + hours * 3600 * 1000).toISOString();
}

function calcSlaStatus(deadline, status) {
  if (status === 'Resolvido') return 'resolvido';
  if (!deadline) return 'ok';
  const now = Date.now();
  const dl = new Date(deadline).getTime();
  const diff = dl - now;
  if (diff < 0) return 'vencido';
  if (diff < 2 * 3600 * 1000) return 'critico';
  if (diff < 4 * 3600 * 1000) return 'atencao';
  return 'ok';
}

// Atualiza sla_status de todos os tickets abertos
async function refreshSlaStatus() {
  try {
    const r = await db.execute("SELECT id, sla_deadline, status FROM tickets WHERE status != 'Resolvido'");
    for (const t of r.rows) {
      const novo = calcSlaStatus(t.sla_deadline, t.status);
      if (novo !== t.sla_status) {
        await db.execute({ sql: 'UPDATE tickets SET sla_status=? WHERE id=?', args: [novo, t.id] });
      }
    }
  } catch (e) {
    console.error('[sla]', e.message);
  }
}

module.exports = { calcDeadline, calcSlaStatus, refreshSlaStatus };
