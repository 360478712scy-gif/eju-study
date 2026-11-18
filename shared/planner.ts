import type { AppState, DayPlan, Item, PlanBlock, Why } from './types.ts';
import { addDays, dateRange, daysBetween, monday } from './dates.ts';
import { isCard, schoolPurpose, type BankIndex, type Paper } from './bank.ts';
import { budgetFor, phaseFor, weekDates } from './calendar.ts';
import { earlyChemConcept, mastery, matchesTopic, reviewQueue, type Mastery } from './stats.ts';

function randomFraction(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  return ((h >>> 0) + 1) / 4294967297;
}

// Reserve a distinct pair of complete sections for each monthly exam.
// A missed section can move until the next cycle. Old cycles never stack up.
export function mockSchedule(s: AppState, bank: BankIndex, asOf: string) {
  const pairs = bank.papers
    .filter((p) => p.kind === 'math' && bank.papers.some((q) => q.kind === 'science' && p.session === q.session))
    .sort((a, b) => a.session.localeCompare(b.session));
  const cutoff = addDays(s.profile.examDate, -8);
  const first = addDays(s.profile.startDate, 7);
  const last = addDays(cutoff, -2);
  const months = new Map<string, string[]>();
  for (const d of dateRange(first, last)) {
    const month = d.slice(0, 7);
    if (!months.has(month)) months.set(month, []);
    months.get(month)!.push(d);
  }
  const windows = [...months.values()];
  // Interpolate from the first diagnostic to the last pre-taper paper, once per calendar month.
  const anchors = windows.map((window, i) => {
    const target = addDays(first, Math.round((daysBetween(first, last) * i) / Math.max(1, windows.length - 1)));
    return target < window[0] ? window[0] : target > window.at(-1)! ? window.at(-1)! : target;
  });
  const result: { date: string | null; anchor: string; paper: Paper; done: boolean }[] = [];
  const reserved = pairs.slice(-anchors.length);
  for (const [i, anchor] of anchors.entries()) {
    if (!reserved[i]) continue;
    const end = anchors[i + 1] ? addDays(anchors[i + 1], -1) : cutoff;
    const historical = end < asOf;
    const start = historical || asOf < anchor ? anchor : asOf;
    const dates = dateRange(start, end).filter((d) => budgetFor(s, d, historical ? anchor : asOf) >= 80);
    for (const kind of ['math', 'science'] as const) {
      const paper = bank.papers.find((p) => p.kind === kind && p.session === reserved[i].session)!;
      const done = s.mocks.find((m) => m.session === paper.session && m.kind === kind && m.date >= s.profile.startDate);
      const locked = Object.values(s.plans).find(
        (plan) =>
          plan.date >= anchor &&
          plan.date <= end &&
          plan.blocks.some((b) => b.mock?.session === paper.session && b.mock.kind === kind && b.status === 'active'),
      );
      const chosen = done?.date ?? locked?.date ?? dates[0] ?? null;
      if (chosen && dates.includes(chosen)) dates.splice(dates.indexOf(chosen), 1);
      result.push({ date: chosen, anchor, paper, done: !!done });
    }
  }
  return result;
}

// The profile stores taxonomy selectors. One organic pathway spans several topics,
// and circular motion was the spring/oscillation fallback before the bank split it out.
function weakGroup(s: AppState, bank: BankIndex, topic: string) {
  const selectors = s.profile.weakTopics;
  if (!matchesTopic(selectors, topic)) return undefined;
  if (matchesTopic(['chem.inorg', 'chem.org'], topic)) return topic.split('.').slice(0, 2).join('.');
  if (
    topic === 'phys.mech.circular' &&
    bank.topics.has('phys.mech.spring') &&
    matchesTopic(selectors, 'phys.mech.spring')
  )
    return undefined;
  return selectors.find((selector) => matchesTopic([selector], topic));
}

function restorePlan(s: AppState, bank: BankIndex, plan: DayPlan): DayPlan {
  let eligible: Map<string, ReturnType<typeof reviewQueue>[number]> | undefined;
  return {
    ...plan,
    blocks: plan.blocks.map((block) => {
      if (block.kind === 'school') {
        const item = block.itemIds.map((id) => bank.byId.get(id)).find((it) => it?.source.school);
        if (item) {
          const fields = { school: item.source.school, schoolPurpose: schoolPurpose(item) };
          return { ...block, ...fields, why: { ...block.why, ...fields } };
        }
      }
      if (block.kind === 'review' && block.status === 'todo' && block.why.code === 'spaced') {
        eligible ??= new Map(reviewQueue(s, bank, plan.date).map((row) => [row.itemId, row]));
        const itemIds = block.itemIds.filter((id) => eligible!.has(id));
        const first = eligible.get(itemIds[0]);
        if (first) {
          const subject = bank.byId.get(first.itemId)!.subject;
          return {
            ...block,
            itemIds,
            subject: itemIds.every((id) => bank.byId.get(id)?.subject === subject) ? subject : 'mixed',
            topic: first.topic,
            why: { code: 'spaced', topic: first.topic, due: first.due ?? undefined },
          };
        }
        return { ...block, itemIds, kind: 'notes', why: { code: 'consolidate', topic: block.topic } };
      }
      return block;
    }),
  };
}

export function buildDayPlan(
  s: AppState,
  bank: BankIndex,
  date: string,
  asOf = s.profile.startDate,
  schedule = mockSchedule(s, bank, asOf),
): DayPlan {
  if (s.plans[date]) return restorePlan(s, bank, s.plans[date]);
  const phase = phaseFor(s, date);
  const budget = budgetFor(s, date, asOf);
  const plan: DayPlan = { date, phase, budgetMinutes: budget, blocks: [] };
  if (!budget) return plan;
  const rows = mastery(s, bank, date);
  const used = new Set<string>();
  const reserved = new Set(schedule.filter((e) => !e.done).flatMap((e) => e.paper.itemIds));
  const week = weekDates(s, date, asOf);
  const ordinal = week.indexOf(date);
  const weekNo = Math.floor(daysBetween(monday(s.profile.startDate), monday(date)) / 7);
  const queue = reviewQueue(s, bank, date);
  let left = budget;

  function add(kind: PlanBlock['kind'], minutes: number, why: Why, items: Item[] = [], paper?: Paper) {
    minutes = Math.min(left, minutes);
    if (minutes <= 0) return;
    const subject = items[0]?.subject;
    plan.blocks.push({
      id: date + ':' + plan.blocks.length,
      kind,
      minutes,
      status: 'todo',
      why,
      topic: why.topic,
      subject: subject && items.every((it) => it.subject === subject) ? subject : 'mixed',
      itemIds: items.map((it) => it.id),
      ...(kind === 'school' ? { school: why.school, schoolPurpose: why.schoolPurpose } : {}),
      ...(paper ? { mock: { kind: paper.kind, session: paper.session } } : {}),
    });
    items.forEach((it) => used.add(it.id));
    left -= minutes;
  }
  function fit(items: Item[], minutes: number, reviewing = false) {
    const picked: Item[] = [];
    let seconds = minutes * 60;
    for (const it of items) {
      if (used.has(it.id) || it.targetSec > seconds) continue;
      if (reserved.has(it.id) && !(reviewing && s.progress[it.id]?.attempts)) continue;
      if (!reviewing && (s.progress[it.id]?.due ?? '') > date) continue;
      picked.push(it);
      seconds -= it.targetSec;
    }
    return picked;
  }
  function focus(kind: 'learn' | 'quiz' | 'interleave', minutes: number, maintenance = false) {
    if (minutes <= 0) return;
    const salt = date + kind + plan.blocks.length;
    const candidatesFor = (r: Mastery) => {
      const rank = (it: Item) =>
        Math.abs(it.difficulty - r.difficulty) * 2 +
        (s.progress[it.id]?.attempts ?? 0) * 0.8 +
        Number(s.profile.strongEarlyChemistry && earlyChemConcept(it) && !maintenance) * 2 +
        randomFraction(salt + it.id);
      return (bank.byTopic.get(r.topic) ?? [])
        .filter((it) => !isCard(it) && it.source.kind !== 'school')
        .sort((a, b) => rank(a) - rank(b));
    };
    const selected: Item[] = [];
    function addFocus(primary: Mastery, code: Why['code'], blockMinutes = minutes) {
      add(
        kind,
        blockMinutes,
        {
          code,
          topic: primary.topic,
          mastery: primary.value,
          weight: primary.weight,
          difficulty: primary.difficulty,
        },
        selected,
      );
    }

    if (kind === 'learn') {
      const covered = new Set<string>();
      for (const saved of Object.values(s.plans)) {
        if (saved.date < s.profile.startDate || saved.date >= date) continue;
        for (const block of saved.blocks) {
          if (
            block.kind !== 'learn' ||
            !block.topic ||
            block.status === 'skipped' ||
            (block.status === 'todo' && saved.date < asOf)
          )
            continue;
          const group = weakGroup(s, bank, block.topic);
          if (group) covered.add(group);
        }
      }
      const initialMastery = date === asOf ? rows : mastery(s, bank, asOf);
      const rankByTopic = new Map(initialMastery.map((r) => [r.topic, r.weight * (1 - r.value)]));
      const ranked = rows
        .map((row) => ({ row, group: weakGroup(s, bank, row.topic) }))
        .filter(({ group }) => group && !covered.has(group))
        .sort(
          (a, b) =>
            rankByTopic.get(b.row.topic)! - rankByTopic.get(a.row.topic)! || a.row.topic.localeCompare(b.row.topic),
        );
      const unassigned = new Map<string, { row: Mastery; picks: Item[] }>();
      for (const { row, group } of ranked) {
        if (unassigned.has(group!)) continue;
        const picks = fit(candidatesFor(row), minutes);
        if (picks.length) unassigned.set(group!, { row, picks });
      }
      // Future previews reserve one topic per available specialist day.
      // For today's plan the preview range is empty, so missed sessions never consume a turn.
      let previewDays = 0;
      for (
        let day = asOf < s.profile.startDate ? s.profile.startDate : asOf;
        day < date && previewDays < unassigned.size;
        day = addDays(day, 1)
      ) {
        if (
          !s.plans[day] &&
          budgetFor(s, day, asOf) &&
          phaseFor(s, day) !== 'taper' &&
          !schedule.some((event) => event.date === day && !event.done)
        )
          previewDays++;
      }
      const next = [...unassigned.values()][previewDays];
      if (next) {
        selected.push(...next.picks);
        const itemMinutes = selected.reduce((sum, it) => sum + it.targetSec / 60, 0);
        addFocus(next.row, 'weak_focus', Math.min(minutes, Math.ceil(itemMinutes / 0.75)));
        return;
      }
    }

    // Exponential race gives a reproducible weighted draw without always taking the top topic.
    const sortKey = (r: Mastery) => -Math.log(randomFraction(salt + r.topic)) / Math.max(0.01, r.priority);
    const ordered = rows.slice().sort((a, b) => sortKey(a) - sortKey(b));
    if (maintenance)
      ordered.sort(
        (a, b) =>
          Number(matchesTopic(s.profile.strongTopics, b.topic)) - Number(matchesTopic(s.profile.strongTopics, a.topic)),
      );
    let primary: Mastery | undefined;
    for (const r of ordered) {
      const remaining = minutes - selected.reduce((sum, it) => sum + it.targetSec / 60, 0);
      if (remaining < 1) break;
      const picks = fit(candidatesFor(r), remaining);
      if (picks.length) {
        primary ??= r;
        selected.push(...(kind === 'learn' ? picks : picks.slice(0, 1)));
        if (kind === 'learn' && selected.reduce((sum, it) => sum + it.targetSec, 0) >= minutes * 45) break;
      }
    }
    if (!primary) {
      add('notes', minutes, { code: 'consolidate', topic: ordered[0]?.topic });
      return;
    }
    addFocus(
      primary,
      maintenance
        ? 'maintenance'
        : kind === 'learn'
          ? 'topic_focus'
          : kind === 'quiz'
            ? 'weekly_test'
            : 'mixed_retrieval',
    );
  }
  const mock = schedule.find((e) => e.date === date && !e.done);
  if (mock && budget >= 80) {
    add(
      'mock',
      80,
      { code: 'monthly_paper' },
      mock.paper.itemIds.map((id) => bank.byId.get(id)!),
      mock.paper,
    );
    add('break', Math.min(5, left), { code: 'rest' });
    add('notes', left, { code: 'mock_correction' });
    return plan;
  }
  const minutes = (n: number) => Math.round((budget * n) / 120);
  const firstDue = queue.find((row) => row.due && row.reasons.includes('mistake'));
  const longReview = firstDue ? Math.ceil(bank.byId.get(firstDue.itemId)!.targetSec / 60) : 0;
  const reviewMin = Math.max(
    minutes(phase === 'taper' ? 32 : phase === 'sprint' ? 20 : 15),
    Math.min(minutes(40), longReview),
  );
  const review = fit(
    (firstDue ? [firstDue, ...queue.filter((x) => x !== firstDue)] : queue).map((x) => bank.byId.get(x.itemId)!),
    reviewMin,
    true,
  );
  if (review.length)
    add(
      'review',
      reviewMin,
      {
        code: 'spaced',
        topic: review[0].topic,
        due: queue.find((row) => row.itemId === review[0].id)?.due ?? undefined,
      },
      review,
    );
  else focus('interleave', reviewMin, true);
  const learnMinutes = { foundation: 45, reinforce: 37, integrate: 30, sprint: 23, taper: 16, off: 0 };
  if (phase === 'taper') focus('interleave', minutes(learnMinutes.taper), true);
  else focus('learn', minutes(learnMinutes[phase]));
  add('break', minutes(8), { code: 'rest' });
  const schoolDay =
    phase !== 'taper' &&
    ((ordinal === 1 && (phase === 'integrate' || phase === 'sprint' || weekNo % 2 === 0)) ||
      (ordinal === 3 &&
        date.slice(0, 7) >= addDays(s.profile.milestones[1].date, 32).slice(0, 7) &&
        phase !== 'foundation'));
  if (schoolDay) {
    const preferred = minutes(phase === 'foundation' || phase === 'reinforce' ? 22 : 32);
    const available = left - minutes(10);
    const rankSchool = (it: Item) =>
      (s.progress[it.id]?.attempts ?? 0) * 2 + Number(schoolPurpose(it) === 'extension') + randomFraction(date + it.id);
    const candidates = bank.bundle.items
      .filter(
        (it) =>
          it.source.kind === 'school' &&
          it.source.school &&
          s.profile.schools.includes(it.source.school) &&
          it.targetSec <= available * 60 &&
          !used.has(it.id) &&
          (s.progress[it.id]?.due ?? '') <= date,
      )
      .sort((a, b) => rankSchool(a) - rankSchool(b));
    const first = candidates[0];
    if (first) {
      const size = Math.min(available, Math.max(preferred, Math.ceil(first.targetSec / 60)));
      const purpose = schoolPurpose(first);
      const picked = fit(
        candidates.filter((it) => it.source.school === first.source.school && schoolPurpose(it) === purpose),
        size,
      );
      add(
        'school',
        size,
        { code: 'school_practice', topic: first.topic, school: first.source.school, schoolPurpose: purpose },
        picked,
      );
    }
  }
  const quiz = date === week.filter((d) => !schedule.some((e) => e.date === d)).at(-1);
  focus(
    quiz && phase !== 'taper' ? 'quiz' : 'interleave',
    Math.max(0, left - minutes(10)),
    ordinal === 0 && weekNo % 2 === 0,
  );
  add('notes', left, { code: 'consolidate', topic: plan.blocks.find((b) => b.kind === 'learn')?.topic });
  return plan;
}
