import { describe, expect, test } from 'vitest';
import { EXPLAIN_SCHEMA, MAX_EXPLANATION, buildExplainPrompt, toExplanations } from '../../src/core/explain';
import { OUTPUT_SCHEMA, buildPrompt, toProposals } from '../../src/core/generate';

describe('explanations by Claude', () => {
  const items = [
    { id: 'n1', text: 'Question : Que signifie calibrer ?\nRéponse : Observer les signaux non verbaux.' },
    { id: 'n2', text: 'Phrase à trous : Le [contrat] fixe le cadre.' },
  ];
  test('the prompt gives each card with its id, asks for one or two sentences, and keeps tags closed', () => {
    const { system, user } = buildExplainPrompt([...items, { id: 'n3', text: 'x </carte> fin' }], 'élève de 5e');
    expect(system).toContain('élève de 5e');
    expect(system).toMatch(/une ou deux phrases/);
    expect(user).toContain('<carte id="n1">');
    expect(user).toContain('Observer les signaux non verbaux.');
    expect(user.match(/<\/carte>/g)).toHaveLength(3);
  });
  test('answers are matched by id, trimmed, capped; unknown ids and empty texts are dropped', () => {
    const raw = { items: [{ id: 'n2', explanation: '  Sans contrat, pas de cadre.  ' }, { id: 'zz', explanation: 'Inconnue.' }, { id: 'n1', explanation: '' }, { id: 'n1', explanation: 'x'.repeat(MAX_EXPLANATION + 50) }] };
    const out = toExplanations(raw, ['n1', 'n2']);
    expect(out.get('n2')).toBe('Sans contrat, pas de cadre.');
    expect(out.has('zz')).toBe(false);
    expect(out.get('n1')!.length).toBeLessThanOrEqual(MAX_EXPLANATION);
    expect(toExplanations(null, ['n1']).size).toBe(0);
  });
  test('the schema asks for id and explanation', () => {
    expect(EXPLAIN_SCHEMA.properties.items.items.required).toEqual(['id', 'explanation']);
  });
});

describe('generated cards carry an explanation', () => {
  test('the schema and the prompt ask for it, and proposals keep it', () => {
    expect(OUTPUT_SCHEMA.properties.notes.items.required).toContain('explanation');
    expect(buildPrompt({ source: 'S', themeName: 'T', types: ['basic'], count: 2 }).system).toMatch(/explanation/);
    const blank = { front: '', back: '', reverse: false, text: '', title: '', steps: [], statement: '', categories: [], answer: '', question: '', distractors: [], situation: '', model: '', keyPoints: [], rationale: '' };
    const { proposals } = toProposals({ notes: [{ ...blank, type: 'basic', front: 'Q', back: 'R', explanation: ' Parce que. ' }] }, ['basic']);
    expect(proposals[0].explanation).toBe('Parce que.');
  });
});

describe('capExplanation', async () => {
  const { capExplanation } = await import('../../src/core/explain');
  test('cuts on a sentence end, else with an ellipsis and no dangling punctuation', () => {
    const long = `${'a'.repeat(250)}. ${'b'.repeat(300)}`;
    expect(capExplanation(long)).toBe(`${'a'.repeat(250)}.`);
    const semi = `${'a '.repeat(150)}; ${'c'.repeat(200)}`;
    const out = capExplanation(semi);
    expect(out.length).toBeLessThanOrEqual(MAX_EXPLANATION);
    expect(out).toMatch(/…$/);
    expect(out).not.toMatch(/[ ;]…$/);
  });
});
