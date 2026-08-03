// Email adapter — appointment reminders, statements, portal notices.
// MOCK MODE (default): logs and returns a fake id.
// REAL MODE: set SES_REGION + AWS creds, or SMTP_URL for any SMTP provider.
// HIPAA: email must not contain PHI beyond appointment date/time; a BAA is
// required with the provider (AWS SES and Postmark both offer one).
const REAL = !!(process.env.SES_REGION || process.env.SMTP_URL);

export async function sendEmail({ to, subject, text }) {
  if (!to) throw new Error('no email address on file');
  if (!REAL) {
    console.log(`[email:mock] to=${to} subject="${subject}"`);
    return { id: `MOCK-EMAIL-${Date.now()}`, status: 'sent' };
  }
  // REAL MODE — implement SES SendEmail or nodemailer over SMTP_URL here.
  throw new Error('email real mode not yet implemented');
}
