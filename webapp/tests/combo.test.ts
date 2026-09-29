import { describe, expect, it } from 'vitest';
import { addBranch, addStep, analyzeSteps, moveStep, newCombo, newStep, removeStep } from '../src/lib/combo';
import { db, id } from './helpers';

describe('Combo Lab', () => {
  it('Baumoperationen und Analyse', () => {
    let c = newCombo('d');
    const s1 = newStep(id("Magician's Rod"), { action: 'normalSummon' });
    const s2 = newStep(id("Magician's Rod"), { action: 'activate', from: 'field', tags: ['search'] });
    const s3 = newStep(id('Test Starter'), { action: 'activate', from: 'hand', tags: ['search'] });
    c = addStep(addStep(addStep(c, 'main', s1), 'main', s2), 'main', s3);
    c = addBranch(c, s2.id, 'ash');
    const branchId = c.steps[1].branches[0].id;
    const alt = newStep(id('Monster Reborn'), { tags: ['gySS'] });
    c = addStep(c, branchId, alt);
    const a = analyzeSteps(c.steps, db);
    expect(a.get(s2.id)!.hits).toEqual(expect.arrayContaining(['ash', 'veiler', 'imperm', 'ogre', 'gamma']));
    expect(a.get(s2.id)!.covered).toEqual(['ash']);
    expect(a.get(s2.id)!.droll).toBe(true);
    expect(a.get(s3.id)!.drollBlocked).toBe(true);
    expect(a.get(alt.id)!.hits).toContain('belle');
    expect(a.get(alt.id)!.summons).toBe(2);
    c = moveStep(c, s3.id, -1);
    expect(c.steps.map((s) => s.id)).toEqual([s1.id, s3.id, s2.id]);
    c = removeStep(c, alt.id);
    expect(c.steps[2].branches[0].steps).toHaveLength(0);
  });
});
