// ERA (835) adapter — payer remittance advice.
// MOCK MODE (default): generates a realistic ERA covering the practice's
// adjudicated claims: payer pays ~80% (contractual adjustment CO-45),
// remainder is patient responsibility (PR-1/PR-2 deductible/coinsurance).
// REAL MODE: 835 files arrive from the clearinghouse (SFTP or webhook);
// set CLEARINGHOUSE_API_KEY and implement the fetch + X12 835 parse here —
// map to the same { eraRef, total, lines } shape so posting logic is untouched.
const REAL = !!process.env.CLEARINGHOUSE_API_KEY;

export async function fetchRemittances({ claims }) {
  if (!claims.length) return [];
  if (!REAL) {
    const lines = claims.map(c => {
      const billed = Number(c.rate);
      const paid = Math.round(billed * 0.8 * 100) / 100;
      const patientResp = Math.round((billed - paid) * 100) / 100;
      return {
        claimId: c.id,
        claimNumber: c.claim_number,
        billed, paid,
        patientResponsibility: patientResp,
        adjustmentCodes: ['CO-45', 'PR-2']
      };
    });
    return [{
      eraRef: `TRN-${Date.now()}`,
      payerId: claims[0].payer_id || null,
      total: Math.round(lines.reduce((s, l) => s + l.paid, 0) * 100) / 100,
      lines,
      raw: { mock: true, generatedAt: new Date().toISOString() }
    }];
  }
  // REAL MODE — pull 835 files from clearinghouse, parse X12, return same shape
  throw new Error('ERA real mode not yet implemented');
}
