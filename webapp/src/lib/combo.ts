import { CardDb, isMonster } from './carddb';
import type { Branch, Combo, ComboStep, EffectTag } from './types';
import { uid } from './util';

export function newStep(cardId: number, partial: Partial<ComboStep> = {}): ComboStep {
  return { id: uid(), cardId, action: 'activate', from: 'hand', tags: [], note: '', choke: false, branches: [], ...partial };
}

export function newCombo(deckId: string, name = 'Neue Combo'): Combo {
  return { id: uid(), deckId, name, notes: '', start: [], steps: [] };
}

type StepFn = (steps: ComboStep[]) => ComboStep[];

/** Wendet `fn` auf die Schrittliste des Containers an ('main' oder eine Branch-ID). */
function mapContainer(steps: ComboStep[], container: string, fn: StepFn, isRoot = true): ComboStep[] {
  if (isRoot && container === 'main') return fn(steps);
  return steps.map((s) => ({
    ...s,
    branches: s.branches.map((b) =>
      b.id === container ? { ...b, steps: fn(b.steps) } : { ...b, steps: mapContainer(b.steps, container, fn, false) },
    ),
  }));
}

/** Wendet `fn` auf jede Liste an, die einen Schritt mit `id` enthält. */
function mapListWith(steps: ComboStep[], id: string, fn: StepFn): ComboStep[] {
  if (steps.some((s) => s.id === id)) return fn(steps);
  return steps.map((s) => ({ ...s, branches: s.branches.map((b) => ({ ...b, steps: mapListWith(b.steps, id, fn) })) }));
}

export function addStep(c: Combo, container: string, step: ComboStep, afterId?: string): Combo {
  return {
    ...c,
    steps: mapContainer(c.steps, container, (list) => {
      const i = afterId ? list.findIndex((s) => s.id === afterId) : -1;
      if (i < 0) return [...list, step];
      return [...list.slice(0, i + 1), step, ...list.slice(i + 1)];
    }),
  };
}

export function updateStep(c: Combo, id: string, patch: Partial<ComboStep>): Combo {
  return { ...c, steps: mapListWith(c.steps, id, (list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s))) };
}

export function removeStep(c: Combo, id: string): Combo {
  return { ...c, steps: mapListWith(c.steps, id, (list) => list.filter((s) => s.id !== id)) };
}

export function moveStep(c: Combo, id: string, dir: -1 | 1): Combo {
  return {
    ...c,
    steps: mapListWith(c.steps, id, (list) => {
      const i = list.findIndex((s) => s.id === id);
      const j = i + dir;
      if (j < 0 || j >= list.length) return list;
      const out = [...list];
      [out[i], out[j]] = [out[j], out[i]];
      return out;
    }),
  };
}

export function addBranch(c: Combo, stepId: string, condition: string): Combo {
  const branch: Branch = { id: uid(), condition, note: '', steps: [] };
  return updateStepWith(c, stepId, (s) => ({ ...s, branches: [...s.branches, branch] }));
}

function updateStepWith(c: Combo, id: string, fn: (s: ComboStep) => ComboStep): Combo {
  return { ...c, steps: mapListWith(c.steps, id, (list) => list.map((s) => (s.id === id ? fn(s) : s))) };
}

function mapBranches(steps: ComboStep[], fn: (b: Branch[]) => Branch[]): ComboStep[] {
  return steps.map((s) => ({ ...s, branches: fn(s.branches).map((b) => ({ ...b, steps: mapBranches(b.steps, fn) })) }));
}

export function updateBranch(c: Combo, branchId: string, patch: Partial<Branch>): Combo {
  return { ...c, steps: mapBranches(c.steps, (bs) => bs.map((b) => (b.id === branchId ? { ...b, ...patch } : b))) };
}

export function removeBranch(c: Combo, branchId: string): Combo {
  return { ...c, steps: mapBranches(c.steps, (bs) => bs.filter((b) => b.id !== branchId)) };
}

export function countSteps(steps: ComboStep[]): number {
  return steps.reduce((n, s) => n + 1 + s.branches.reduce((m, b) => m + countSteps(b.steps), 0), 0);
}

const SUMMON_TAGS: EffectTag[] = ['deckSS', 'gySS'];

export function summonsIn(step: ComboStep): number {
  let n = step.action === 'normalSummon' || step.action === 'specialSummon' ? 1 : 0;
  if (step.action === 'activate') n += step.tags.filter((t) => SUMMON_TAGS.includes(t)).length;
  return n;
}

export interface StepAnalysis {
  /** Unterbrechungs-IDs, die diesen Schritt treffen können */
  hits: string[];
  /** Beschwörungen im Zug nach diesem Schritt */
  summons: number;
  /** Maxx "C" würde hier ziehen */
  maxxDraw: boolean;
  /** Ab hier kann Nibiru aktiviert werden */
  nibiru: boolean;
  /** Erste Suche → Droll & Lock Bird möglich */
  droll: boolean;
  /** Suche nach aktivem Droll-Lock scheitert */
  drollBlocked: boolean;
  /** Für die Unterbrechungen, die hier treffen, gibt es eine Alternative (Branch) */
  covered: string[];
}

/** Analysiert eine Schrittliste (inkl. Branches) mit Vorbelegung aus der Hauptlinie. */
export function analyzeSteps(
  steps: ComboStep[],
  db: CardDb,
  start = { summons: 0, searched: false },
  out = new Map<string, StepAnalysis>(),
): Map<string, StepAnalysis> {
  let summons = start.summons;
  let searched = start.searched;
  for (const s of steps) {
    const card = db.get(s.cardId);
    const monster = !!card && isMonster(card);
    const hits: string[] = [];
    if (s.action === 'activate') {
      if (s.tags.some((t) => t === 'search' || t === 'deckSS' || t === 'deckSend')) hits.push('ash');
      if (s.tags.some((t) => t === 'gyAdd' || t === 'gySS' || t === 'gyBanish')) hits.push('belle');
      if (s.from === 'field' && monster) hits.push('veiler', 'imperm');
      if (s.from === 'field') hits.push('ogre');
      if (monster) hits.push('gamma');
      if (s.from === 'gy') hits.push('crow');
    }
    const before = summons;
    const added = summonsIn(s);
    summons += added;
    const isSearch = s.action === 'activate' && s.tags.includes('search');
    const covered = s.branches.map((b) => b.condition).filter((c) => hits.includes(c) || c === 'nibiru' || c === 'droll' || c === 'maxx');
    out.set(s.id, {
      hits,
      summons,
      maxxDraw: added > 0,
      nibiru: before < 5 && summons >= 5,
      droll: isSearch && !searched,
      drollBlocked: isSearch && searched,
      covered,
    });
    for (const b of s.branches) analyzeSteps(b.steps, db, { summons, searched: searched || isSearch }, out);
    if (isSearch) searched = true;
  }
  return out;
}
