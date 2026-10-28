import { describe, expect, test } from 'vitest';
import { validateFields } from '../../src/core/validate';

describe('validateFields', () => {
  test('valid notes of every type have no error', () => {
    expect(validateFields({ type: 'basic', front: 'Q', back: 'R', reverse: false })).toEqual({});
    expect(validateFields({ type: 'cloze', text: 'Le {{contrat}}' })).toEqual({});
    expect(validateFields({ type: 'ordering', title: 'T', steps: ['A', 'B'] })).toEqual({});
    expect(validateFields({ type: 'classify', statement: 'S', categories: ['A', 'B'], answer: 'a' })).toEqual({});
    expect(validateFields({ type: 'mcq', question: 'Q', answer: 'A', distractors: ['B'] })).toEqual({});
    expect(validateFields({ type: 'scenario', situation: 'S', model: 'M', keyPoints: [] })).toEqual({});
  });

  test('basic needs a front and a back', () => {
    expect(Object.keys(validateFields({ type: 'basic', front: ' ', back: '', reverse: false })).sort()).toEqual(['back', 'front']);
  });

  test('cloze needs at least one non-empty gap', () => {
    expect(validateFields({ type: 'cloze', text: 'Aucun trou' })).toHaveProperty('text');
    expect(validateFields({ type: 'cloze', text: 'Trou vide {{  }}' })).toHaveProperty('text');
  });

  test('cloze rejects a gap with a line break or nested braces', () => {
    expect(validateFields({ type: 'cloze', text: '{{a\nb}}' })).toHaveProperty('text');
    expect(validateFields({ type: 'cloze', text: '{{a {{b}} }}' })).toHaveProperty('text');
  });

  test('ordering needs a title and at least 2 steps', () => {
    expect(validateFields({ type: 'ordering', title: 'T', steps: ['A'] })).toHaveProperty('steps');
    expect(validateFields({ type: 'ordering', title: '', steps: ['A', 'B'] })).toHaveProperty('title');
  });

  test('classify needs 2 categories and an answer among them', () => {
    expect(validateFields({ type: 'classify', statement: 'S', categories: ['A'], answer: 'A' })).toHaveProperty('categories');
    expect(validateFields({ type: 'classify', statement: 'S', categories: ['A', 'B'], answer: 'C' })).toHaveProperty('answer');
    expect(validateFields({ type: 'classify', statement: '', categories: ['A', 'B'], answer: 'A' })).toHaveProperty('statement');
  });

  test('mcq needs a question, an answer and a distinct distractor', () => {
    expect(validateFields({ type: 'mcq', question: '', answer: 'A', distractors: ['B'] })).toHaveProperty('question');
    expect(validateFields({ type: 'mcq', question: 'Q', answer: '', distractors: ['B'] })).toHaveProperty('answer');
    expect(validateFields({ type: 'mcq', question: 'Q', answer: 'Été', distractors: ['ete'] })).toHaveProperty('distractors');
  });

  test('scenario needs a situation and a model answer', () => {
    expect(Object.keys(validateFields({ type: 'scenario', situation: '', model: '', keyPoints: [] })).sort()).toEqual(['model', 'situation']);
  });

  test('messages are in French', () => {
    expect(validateFields({ type: 'cloze', text: 'x' }).text).toMatch(/trou/i);
  });
});
