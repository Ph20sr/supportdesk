const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./db');
const { refreshSlaStatus } = require('./services/sla');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Routes
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/usuarios',  require('./routes/usuarios'));
app.use('/api/clientes',  require('./routes/clientes'));
app.use('/api/tickets',   require('./routes/tickets'));
app.use('/api/dashboard', require('./routes/dashboard'));

// SPA fallback
app.get('*', (_, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`SupportDesk Pro rodando na porta ${PORT}`);
    // Atualiza SLA a cada 5 minutos
    refreshSlaStatus();
    setInterval(refreshSlaStatus, 5 * 60 * 1000);
  });
}).catch(e => { console.error('Erro fatal:', e); process.exit(1); });
