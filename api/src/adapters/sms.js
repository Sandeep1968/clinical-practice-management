// SMS adapter — appointment reminders and patient messaging.
// MOCK MODE (default): logs the message and returns a fake SID.
// REAL MODE: set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM.
// TCPA: callers must check sms_consent before invoking — this adapter
// refuses to send without a phone number but consent is the caller's gate.
const REAL = !!process.env.TWILIO_ACCOUNT_SID;

export async function sendSms({ to, body }) {
  if (!to) throw new Error('no phone number on file');
  if (!REAL) {
    console.log(`[sms:mock] to=${to} body="${body}"`);
    return { sid: `MOCK-SMS-${Date.now()}`, status: 'sent' };
  }
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM, Body: body })
  });
  if (!res.ok) throw new Error(`Twilio error ${res.status}`);
  const data = await res.json();
  return { sid: data.sid, status: data.status };
}
