const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  transporter = nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  return transporter;
}

const FROM = process.env.SMTP_FROM || 'SupportDesk <noreply@suporte.com>';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function send(to, subject, html) {
  const t = getTransporter();
  if (!t || !to) return;
  try {
    await t.sendMail({ from: FROM, to, subject, html });
  } catch (e) {
    console.error('[email]', e.message);
  }
}

const wrap = (content) => `
  <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e5e5;border-radius:12px;overflow:hidden">
    <div style="background:#1a6b45;padding:24px 32px">
      <span style="color:#fff;font-size:18px;font-weight:600">🎫 SupportDesk</span>
    </div>
    <div style="padding:32px">${content}</div>
    <div style="padding:16px 32px;background:#f9f9f7;border-top:1px solid #eee;font-size:12px;color:#888">
      Este é um e-mail automático. Não responda diretamente.
    </div>
  </div>`;

async function notificarAbertura(ticket, agenteEmail) {
  if (agenteEmail) {
    await send(agenteEmail, `[${ticket.id}] Novo ticket atribuído: ${ticket.titulo}`, wrap(`
      <h2 style="margin:0 0 16px;color:#1a1a1a">Novo ticket atribuído a você</h2>
      <p><strong>ID:</strong> ${ticket.id}<br>
      <strong>Título:</strong> ${ticket.titulo}<br>
      <strong>Prioridade:</strong> ${ticket.prioridade}<br>
      <strong>Cliente:</strong> ${ticket.cliente_nome}<br>
      <strong>SLA:</strong> ${ticket.sla_deadline ? new Date(ticket.sla_deadline).toLocaleString('pt-BR') : '—'}</p>
      <a href="${BASE_URL}/#ticket-${ticket.id}" style="display:inline-block;margin-top:16px;background:#1a6b45;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:500">Ver ticket →</a>
    `));
  }
  if (ticket.cliente_email) {
    await send(ticket.cliente_email, `Chamado ${ticket.id} registrado — ${ticket.titulo}`, wrap(`
      <h2 style="margin:0 0 16px;color:#1a1a1a">Seu chamado foi registrado</h2>
      <p>Olá, <strong>${ticket.cliente_nome}</strong>!</p>
      <p>Seu chamado foi registrado com sucesso e nossa equipe já foi notificada.</p>
      <p><strong>Número:</strong> ${ticket.id}<br>
      <strong>Assunto:</strong> ${ticket.titulo}<br>
      <strong>Prioridade:</strong> ${ticket.prioridade}</p>
      <p style="color:#666;font-size:13px">Você receberá atualizações por e-mail conforme o chamado for tratado.</p>
    `));
  }
}

async function notificarStatusChange(ticket, statusAntes, emailCliente) {
  if (!emailCliente) return;
  await send(emailCliente, `[${ticket.id}] Atualização: ${ticket.titulo}`, wrap(`
    <h2 style="margin:0 0 16px;color:#1a1a1a">Atualização do seu chamado</h2>
    <p>Olá, <strong>${ticket.cliente_nome}</strong>!</p>
    <p>O status do seu chamado foi atualizado:</p>
    <p><strong>${statusAntes}</strong> → <strong>${ticket.status}</strong></p>
    <p><strong>Número:</strong> ${ticket.id}<br>
    <strong>Assunto:</strong> ${ticket.titulo}</p>
    ${ticket.status === 'Resolvido' ? '<p style="color:#0e5c30;font-weight:500">✅ Seu chamado foi resolvido. Obrigado por usar nosso suporte!</p>' : ''}
  `));
}

async function notificarComentario(ticket, comentario, emailCliente) {
  if (!emailCliente || comentario.interno) return;
  await send(emailCliente, `[${ticket.id}] Nova resposta: ${ticket.titulo}`, wrap(`
    <h2 style="margin:0 0 16px;color:#1a1a1a">Nova resposta no seu chamado</h2>
    <p>Olá, <strong>${ticket.cliente_nome}</strong>!</p>
    <p><strong>${comentario.usuario_nome}</strong> respondeu:</p>
    <blockquote style="border-left:3px solid #1a6b45;margin:16px 0;padding:12px 16px;background:#f0f7f3;border-radius:0 8px 8px 0;color:#333">${comentario.conteudo}</blockquote>
  `));
}

module.exports = { notificarAbertura, notificarStatusChange, notificarComentario };
