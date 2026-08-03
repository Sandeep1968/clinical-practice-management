import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import clientRoutes from './routes/clients.js';
import appointmentRoutes from './routes/appointments.js';
import encounterRoutes from './routes/encounters.js';
import claimRoutes from './routes/claims.js';
import { requireAuth } from './middleware/auth.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/auth', authRoutes);
app.use('/clients', requireAuth, clientRoutes);
app.use('/appointments', requireAuth, appointmentRoutes);
app.use('/encounters', requireAuth, encounterRoutes);
app.use('/claims', requireAuth, claimRoutes);

// central error handler — never leak internals
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.expose ? err.message : 'internal error' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`CPM API listening on :${port}`));
