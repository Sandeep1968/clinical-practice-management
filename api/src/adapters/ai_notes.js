// AI clinical note drafting adapter.
// MOCK MODE (default): structured template draft from encounter context.
// REAL MODE: set ANTHROPIC_API_KEY — calls Claude to draft from a transcript.
// HIPAA: real mode requires a BAA with the AI vendor and zero data retention.
const REAL = !!process.env.ANTHROPIC_API_KEY;

export async function draftNote({ templateType = 'SOAP', clientName, dos, transcript }) {
  if (!REAL) {
    const sections = {
      SOAP: {
        Subjective: `${clientName} attended the ${dos} session. Reported mood and symptoms discussed. [Review transcript / add detail]`,
        Objective: 'Client was alert and oriented x4. Affect congruent. Engaged throughout the session.',
        Assessment: 'Progress toward treatment plan goals observed. Continue current approach. [Clinician judgment required]',
        Plan: 'Continue weekly sessions. Review treatment plan goals next visit.'
      },
      DAP: {
        Data: `${clientName} attended the ${dos} session. [Summarize presentation]`,
        Assessment: 'Client engaged; symptoms discussed relative to treatment goals.',
        Plan: 'Continue weekly sessions.'
      },
      BIRP: {
        Behavior: `${clientName} presented on ${dos}. [Describe observed behavior]`,
        Intervention: 'Therapeutic interventions applied per treatment plan.',
        Response: 'Client responsive to interventions.',
        Plan: 'Continue weekly sessions.'
      }
    };
    const s = sections[templateType] || sections.SOAP;
    return {
      draft: Object.entries(s).map(([k, v]) => `${k}:\n${v}`).join('\n\n'),
      model: 'mock-template',
      disclaimer: 'AI DRAFT — clinician must review, edit, and sign. The signature is the legal record.'
    };
  }

  // REAL MODE — call Claude with the session transcript:
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `Draft a ${templateType} psychotherapy progress note from this session transcript. ` +
          `Be factual, clinical, and concise. Do not invent details not in the transcript.\n\n` +
          `Client: ${clientName}\nDate of service: ${dos}\n\nTranscript:\n${transcript || '(none provided)'}`
      }]
    })
  });
  if (!res.ok) throw new Error(`AI service error ${res.status}`);
  const data = await res.json();
  return {
    draft: data.content?.[0]?.text || '',
    model: data.model,
    disclaimer: 'AI DRAFT — clinician must review, edit, and sign. The signature is the legal record.'
  };
}
