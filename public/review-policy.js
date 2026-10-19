// Trial pacing for a first attempt, not an official per-question time limit.
// q.minutes is retained as a generous exercise limit and never fills a workload budget.
export const TIMING_MIN_SAMPLES = 5;
const positive = n => Number.isFinite(n) && n > 0;
const median = values => {
  const xs = [...values].sort((a, b) => a - b), middle = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[middle] : (xs[middle - 1] + xs[middle]) / 2;
};

export function questionKind(q) {
  if (q.topic === 'vocab') return 'vocab';
  if (q.topic === 'listening' || q.audio) return 'listening';
  if (q.topic === 'reading') return 'reading';
  if (q.subject === 'math' && (q.official || q.unitKind === 'math-group' || q.kind === 'math-group')) return 'math-group';
  if (q.official && ['physics', 'chemistry'].includes(q.subject)) return 'official-science';
  return 'short';
}

function baseline(q) {
  const kind = questionKind(q);
  let seconds;
  if (kind === 'vocab') seconds = 15;
  else if (kind === 'official-science') seconds = q.subject === 'physics' ? 120 : 100;
  else if (kind === 'math-group') seconds = /(?:mIII|mIV)$/.test(q.id || '') ? 600 : 480;
  else if (kind === 'listening') seconds = 150;
  else if (kind === 'reading') seconds = q.official ? 180 : 45;
  else seconds = 45;
  // Explicit authored pacing may refine a particular question, unlike its loose limit.
  if (positive(q.estimatedSeconds)) seconds = q.estimatedSeconds;
  const audioSeconds = q.audioDurationSeconds ?? q.audioSeconds ?? q.durationSeconds;
  if (kind === 'listening' && positive(audioSeconds)) seconds = Math.max(seconds, audioSeconds + 25);
  return {kind, seconds, audioFloor: kind === 'listening' && positive(audioSeconds) ? audioSeconds + 25 : 0};
}

function calibrationClass(q) {
  return [questionKind(q), q.subject, !!q.official, !!q.selfGrade, q.difficulty || 'unspecified'].join('|');
}

/**
 * Calibrate only against different questions' first ever, independent successes.
 * bank lets historical attempts be associated with their actual unit/difficulty.
 * Without bank, no cross-question inference is made from subject alone.
 */
export function timing(q, attempts = [], bank = []) {
  const {kind, seconds: baselineSeconds, audioFloor} = baseline(q);
  const byId = new Map(bank.map(item => [item.id, item]));
  byId.set(q.id, q);
  const seen = new Set(), samples = [], targetClass = calibrationClass(q);
  for (const a of attempts) {
    if (!a?.questionId || seen.has(a.questionId)) continue;
    seen.add(a.questionId);
    const item = byId.get(a.questionId);
    if (!item || calibrationClass(item) !== targetClass || !a.correct || a.hinted || a.assisted || a.reviewOf || a.repeat || a.isRetry || !positive(a.seconds)) continue;
    samples.push(a.seconds);
  }
  const recent = samples.slice(-30), calibrated = recent.length >= TIMING_MIN_SAMPLES;
  // A single unusually long session must not manufacture additional planned work.
  const measured = calibrated ? Math.max(baselineSeconds * .5, Math.min(baselineSeconds * 2, median(recent))) : baselineSeconds;
  const estimatedSeconds = Math.ceil(Math.max(audioFloor, measured));
  return {
    kind,
    unit: ({vocab: '词项', short: '小题', 'official-science': '真题小题', 'math-group': '题组', listening: '听力题', reading: '阅读题'})[kind],
    estimatedSeconds,
    baselineSeconds,
    generousLimitSeconds: positive(q.minutes) ? Math.round(q.minutes * 60) : null,
    calibrated,
    sampleCount: recent.length,
    basis: calibrated ? '同题型不同题的首次独立正确用时中位数（试行）' : '试行首答配速，待足量独立作答校准',
    // Assistance and correction are separate activities, not first-attempt pace.
    includesReview: false
  };
}

// These names identify a concrete operation, not a whole subject or broad chapter.
// A broad legacy skill (e.g. wave-optics / math-probability / listen-main) cannot
// silently certify transfer; it requires a more precise label or a verified pair.
export const FINE_TRANSFER_SKILLS = Object.freeze([
  'trig-add', 'trig-double', 'trig-range', 'trig-combine',
  'integral-power', 'integral-log', 'integral-sub', 'integral-parts',
  'integral-area', 'integral-trig', 'integral-symmetry', 'integral-volume', 'integral-absolute',
  'wave-speed', 'wave-direction', 'wave-standing', 'wave-string', 'wave-pipe',
  'wave-doppler', 'wave-interference', 'wave-refraction',
  'electric-superposition', 'capacitor-condition', 'capacitor-combination', 'resistor-combination',
  'magnetic-orbit', 'magnetic-lenz', 'magnetic-flux', 'magnetic-rod',
  'organic-name-alcohol', 'organic-name-carbonyl', 'organic-ester',
  'organic-aldehyde-test', 'organic-oxidation',
  'purify-solid', 'purify-selectivity', 'purify-liquid', 'purify-gas', 'purify-ammonia',
  'impulse', 'heat-balance', 'thermo-pv'
]);
const fineSkills = new Set(FINE_TRANSFER_SKILLS);
const broadSkills = new Set(['math', 'physics', 'chemistry', 'japanese', 'mixed', 'trig', 'integral', 'wave', 'electric', 'magnetic', 'organic', 'purify', 'listening', 'reading', 'vocab']);

function preciseSkill(q) {
  const skill = q.transferSkill || q.skill;
  if (typeof skill !== 'string' || broadSkills.has(skill)) return null;
  return fineSkills.has(skill) || (q.transferSkillVerified === true && skill !== q.topic) ? skill : null;
}

/** An explicit verified pair is authored metadata, never inferred from similar titles. */
export function transferRelation(original, candidate) {
  if (!original || !candidate || original.id === candidate.id) return {eligible: false, reason: '必须是不同题目'};
  if (original.subject !== candidate.subject) return {eligible: false, reason: '科目不同'};
  if (original.topic === 'vocab' || candidate.topic === 'vocab') return {eligible: false, reason: '词汇使用间隔回忆，不伪装成新题迁移'};
  const explicit = original.verifiedTransferWith?.includes(candidate.id) || candidate.verifiedTransferWith?.includes(original.id);
  const left = preciseSkill(original), right = preciseSkill(candidate);
  if (!explicit && !(left && left === right)) return {eligible: false, reason: '缺少相同细考点或人工核验的题对'};
  const kind = questionKind(original), candidateKind = questionKind(candidate);
  const simpler = (original.official && !candidate.official) || (kind === 'math-group' && candidateKind !== 'math-group') || (Number.isFinite(original.difficulty) && Number.isFinite(candidate.difficulty) && candidate.difficulty < original.difficulty);
  return {
    eligible: true,
    skill: left === right && left ? left : `verified:${[original.id, candidate.id].sort().join(':')}`,
    kind: simpler ? 'bridge' : 'transfer',
    demonstratesMastery: !simpler,
    verifiedBy: explicit ? 'authored-pair' : 'exact-fine-skill',
    reason: simpler ? '同考点的基础唤醒，不能作为原真题难度的掌握证据' : '不同题目的同一细考点验证'
  };
}

/** Return unused candidates only. An empty result is a real supply gap. */
export function transferCandidates(original, bank, attempts = [], excludedIds = []) {
  const used = new Set([...attempts.map(a => a.questionId), ...excludedIds]);
  return bank.filter(q => !used.has(q.id)).map(q => ({questionId: q.id, originalId: original.id, question: q, ...transferRelation(original, q)})).filter(r => r.eligible).sort((a, b) => Number(b.demonstratesMastery) - Number(a.demonstratesMastery) || Number(b.question.variantOf === original.id) - Number(a.question.variantOf === original.id) || Number(!!b.question.official) - Number(!!a.question.official) || a.questionId.localeCompare(b.questionId));
}
