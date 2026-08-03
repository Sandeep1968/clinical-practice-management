// Clearinghouse adapter — claim submission (837P) and status updates (277-style).
// MOCK MODE (default): generates a claim number, then simulates payer
// adjudication ~20s later so the tracker visibly moves during demos.
// REAL MODE: set CLEARINGHOUSE_API_KEY and implement the marked calls
// (Claim.MD, Availity, Change Healthcare, etc. all follow this shape).
const REAL = !!process.env.CLEARINGHOUSE_API_KEY;

// Simplified 837P segment builder — replace with a certified X12 library
// (e.g. via clearinghouse SDK) before real submissions.
export function build837P({ claim, clientName, providerName, providerNpi, payerName }) {
  const dos = new Date(claim.dos).toISOString().slice(0, 10).replaceAll('-', '');
  return [
    'ISA*00*          *00*          *ZZ*CPMSENDER      *ZZ*CLEARINGHOUSE  *' + dos,
    'ST*837*0001*005010X222A1',
    `NM1*85*1*${providerName}****XX*${providerNpi || 'UNKNOWN'}`,        // billing provider
    `NM1*IL*1*${clientName}`,                                            // subscriber
    `NM1*PR*2*${payerName || 'PAYER'}`,                                  // payer
    `CLM*${claim.id}*${claim.rate}***11:B:1*Y*A*Y*Y`,                    // claim
    `DTP*472*D8*${dos}`,                                                 // date of service
    ...(claim.cpt_codes || []).map(c => `SV1*HC:${c}*${claim.rate}*UN*1`),
    'SE*8*0001'
  ].join('\n');
}

export async function submitClaim(payload) {
  const x12 = build837P(payload);
  if (!REAL) {
    return {
      claimNumber: `CLM-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`,
      accepted: true,
      x12,
      // mock payers adjudicate fast: tracker moves ~20s after submission
      mockAdjudication: {
        delayMs: 20000,
        toStatus: Math.random() < 0.75 ? 'pending_patient_liability' : 'in_revision',
        expectedPayoutDays: 21
      }
    };
  }
  // REAL MODE — POST the X12 (or the clearinghouse's JSON claim format) to
  // their submission endpoint; register a webhook for 277/835 callbacks that
  // hits POST /claims/webhook/status below.
  throw new Error('Clearinghouse real mode not yet implemented');
}
