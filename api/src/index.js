import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import clientRoutes from './routes/clients.js';
import appointmentRoutes from './routes/appointments.js';
import encounterRoutes from './routes/encounters.js';
import claimRoutes from './routes/claims.js';
import eligibilityRoutes from './routes/eligibility.js';
import remittanceRoutes from './routes/remittances.js';
import prescriptionRoutes from './routes/prescriptions.js';
import analyticsRoutes from './routes/analytics.js';
import reminderRoutes from './routes/reminders.js';
import portalRoutes from './routes/portal.js';
import platformRoutes from './routes/platform.js';
import treatmentPlanRoutes from './routes/treatment_plans.js';
import documentRoutes from './routes/documents.js';
import messageRoutes from './routes/messages.js';
import notificationRoutes from './routes/notifications.js';
import billingRoutes from './routes/billing.js';
import customizationRoutes from './routes/customization.js';
import { pool } from './db.js';
import { sendSms } from './adapters/sms.js';
import { sendEmail } from './adapters/email.js';
import schedulingRoutes from './routes/scheduling.js';
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
app.use('/eligibility', requireAuth, eligibilityRoutes);
app.use('/remittances', requireAuth, remittanceRoutes);
app.use('/prescriptions', requireAuth, prescriptionRoutes);
app.use('/treatment-plans', requireAuth, treatmentPlanRoutes);
app.use('/documents', requireAuth, documentRoutes);
app.use('/messages', requireAuth, messageRoutes);
app.use('/notifications', requireAuth, notificationRoutes);
app.use('/billing', requireAuth, billingRoutes);
app.use('/customization', requireAuth, customizationRoutes);
app.use('/scheduling', requireAuth, schedulingRoutes);
app.use('/analytics', requireAuth, analyticsRoutes);
app.use('/reminders', requireAuth, reminderRoutes);
app.use('/portal', portalRoutes);     // patient portal — own JWT type
app.use('/platform', platformRoutes); // super-admin console — own JWT type

// Reminder worker: sends due SMS reminders every 60s.
// PRODUCTION: move to a dedicated worker pod on a queue.
setInterval(async () => {
  try {
    const { rows } = await pool.query('SELECT * FROM fetch_due_reminders(50)');
    for (const rem of rows) {
      try {
        if (rem.channel === 'email') {
          if (!rem.email) { await pool.query('SELECT mark_reminder($1,$2,$3)', [rem.id, 'skipped_no_consent', null]); continue; }
          const mail = await sendEmail({ to: rem.email, subject: 'Appointment reminder', text: rem.message });
          await pool.query('SELECT mark_reminder($1,$2,$3)', [rem.id, 'sent', mail.id]);
        } else {
          // TCPA: SMS requires explicit consent + a number on file
          if (!rem.phone || !rem.sms_consent) { await pool.query('SELECT mark_reminder($1,$2,$3)', [rem.id, 'skipped_no_consent', null]); continue; }
          const sms = await sendSms({ to: rem.phone, body: rem.message });
          await pool.query('SELECT mark_reminder($1,$2,$3)', [rem.id, 'sent', sms.sid]);
        }
      } catch (e) {
        await pool.query('SELECT mark_reminder($1,$2,$3)', [rem.id, 'failed', e.message]);
      }
    }
  } catch (e) { console.error('[reminder-worker]', e.message); }
}, 60000);

// central error handler — never leak internals
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.expose ? err.message : 'internal error' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`CPM API listening on :${port}`));
