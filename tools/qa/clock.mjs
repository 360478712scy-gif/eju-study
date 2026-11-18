// QA only: `EJU_QA_DATE=2026-11-19T10:00 node --import ./tools/qa/clock.mjs server.mjs` runs the server as if it were that time.
const target = process.env.EJU_QA_DATE;
if (target) {
  const Real = Date;
  const offset = new Real(target).getTime() - Real.now();
  globalThis.Date = class extends Real {
    constructor(...a) { if (a.length === 0) super(Real.now() + offset); else super(...a); }
    static now() { return Real.now() + offset; }
  };
  console.log('[qa-clock] now =', new Date().toString());
}
