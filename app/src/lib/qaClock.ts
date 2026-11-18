// QA only: open the app with ?qaDate=2026-11-19T10:00 to view it as of that moment (design review of study days).
const target = new URLSearchParams(location.search).get('qaDate');
if (target) {
  const Real = Date;
  const offset = new Real(target).getTime() - Real.now();
  (globalThis as { Date: DateConstructor }).Date = class extends Real {
    constructor(...a: []) {
      if (a.length === 0) super(Real.now() + offset);
      else super(...(a as unknown as [string]));
    }
    static now() {
      return Real.now() + offset;
    }
  } as unknown as DateConstructor;
}
export {};
