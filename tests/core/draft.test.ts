import { describe, expect, test } from 'vitest';
import { FIELD_SPECS, draftToFields, emptyDraft, fieldsToDraft } from '../../src/core/draft';
import type { NoteFields, NoteType } from '../../src/core/model';

const samples: NoteFields[] = [
  { type: 'basic', front: 'Q', back: 'R', reverse: true },
  { type: 'cloze', text: 'GROW : {{Goal}}, {{Reality}}' },
  { type: 'ordering', title: 'T', steps: ['A', 'B', 'C'] },
  { type: 'classify', statement: 'S', categories: ['Omission', 'Distorsion'], answer: 'Omission' },
  { type: 'mcq', question: 'Q', answer: 'A', distractors: ['B', 'C'] },
  { type: 'scenario', situation: 'S', model: 'M', keyPoints: ['k1', 'k2'] },
];

describe('drafts', () => {
  test('every note type has field specs whose keys match its fields', () => {
    for (const fields of samples) {
      const keys = FIELD_SPECS[fields.type].map((f) => f.key).sort();
      expect(keys).toEqual(Object.keys(fields).filter((k) => k !== 'type').sort());
    }
  });

  test('an empty draft has a value for every field', () => {
    const draft = emptyDraft('basic');
    expect(draft).toEqual({ front: '', back: '', reverse: false });
  });

  test('steps: trims, drops blank lines and duplicates', () => {
    expect(draftToFields('ordering', { title: ' T ', steps: 'A\n\n  B \nA\n' })).toEqual({ type: 'ordering', title: 'T', steps: ['A', 'B'] });
  });

  test('categories: comma list, trims, drops empties and case/accent duplicates', () => {
    expect(draftToFields('classify', { statement: 'S', categories: 'Omission, Distorsion,, omission ,', answer: ' Omission ' })).toEqual({
      type: 'classify',
      statement: 'S',
      categories: ['Omission', 'Distorsion'],
      answer: 'Omission',
    });
  });

  test('fields → draft → fields is the identity for every type', () => {
    for (const fields of samples) expect(draftToFields(fields.type, fieldsToDraft(fields))).toEqual(fields);
  });

  test('missing draft keys become empty values', () => {
    expect(draftToFields('mcq' as NoteType, {})).toEqual({ type: 'mcq', question: '', answer: '', distractors: [] });
  });
});
