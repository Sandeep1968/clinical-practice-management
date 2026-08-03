// Pverify eligibility adapter.
// MOCK MODE (default): deterministic fake responses so the pipeline works
// end-to-end without credentials.
// REAL MODE: set PVERIFY_CLIENT_ID + PVERIFY_CLIENT_SECRET and implement
// the token + EligibilitySummary calls where marked.
const REAL = !!process.env.PVERIFY_CLIENT_ID;

export async function checkEligibility({ policy, client }) {
  if (!REAL) {
    // Deterministic-ish mock keyed off member id so demos are stable
    const seed = [...(policy.member_id || 'X')].reduce((a, c) => a + c.charCodeAt(0), 0);
    return {
      ref: `MOCK-${Date.now()}`,
      status: seed % 7 === 0 ? 'failed' : 'verified',
      copay: 25.0,
      deductibleRemaining: Math.round((seed % 12) * 125 * 100) / 100,
      plan: 'PPO Standard (mock)',
      coverageActive: seed % 7 !== 0,
      raw: { mock: true, memberId: policy.member_id }
    };
  }

  // REAL MODE — Pverify API flow:
  // 1. POST https://api.pverify.com/Token  (client credentials → bearer token)
  // 2. POST https://api.pverify.com/API/EligibilitySummary with payer code,
  //    member id, provider NPI, DOS
  // 3. Map response → { ref, status, copay, deductibleRemaining, plan, coverageActive, raw }
  throw new Error('Pverify real mode not yet implemented — set up credentials and complete adapter');
}
