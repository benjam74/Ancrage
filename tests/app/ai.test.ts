import { describe, expect, test } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { AI_MODEL, clearApiKey, generateProposals, getApiKey, setApiKey, type AiClient } from '../../src/app/ai';
import { memoryStorage } from '../../src/app/cloud';
import { OUTPUT_SCHEMA, type GenerationRequest } from '../../src/core/generate';

const request: GenerationRequest = { source: 'GROW : Goal, Reality, Options, Will.', themeName: 'GROW', types: ['cloze', 'mcq'], count: 4 };
const blank = { front: '', back: '', reverse: false, text: '', title: '', steps: [], statement: '', categories: [], answer: '', question: '', distractors: [], situation: '', model: '', keyPoints: [], rationale: '' };

function fakeClient(reply: (params: any) => unknown) {
  const calls: any[] = [];
  const client: AiClient = {
    beta: {
      messages: {
        create: async (params) => {
          calls.push(params);
          const r = reply(params);
          if (r instanceof Error) throw r;
          return r as Anthropic.Beta.Messages.BetaMessage;
        },
      },
    },
  };
  return { client, calls };
}
const message = (text: string, stop_reason = 'end_turn') => ({ content: [{ type: 'text', text }], stop_reason });

describe('generateProposals', () => {
  test('sends the model, schema, effort and server-side fallbacks', async () => {
    const { client, calls } = fakeClient(() => message(JSON.stringify({ notes: [] })));
    await generateProposals(client, request);
    expect(calls[0]).toMatchObject({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    });
    expect(AI_MODEL).toBe('claude-opus-5-5');
    expect(calls[0].messages[0].content).toContain('<source>');
  });

  test('a valid answer gives proposals and counts the rejected ones', async () => {
    const notes = [
      { ...blank, type: 'cloze', text: 'GROW : {{Goal}}, {{Reality}}' },
      { ...blank, type: 'mcq', question: 'Q', answer: 'A', distractors: [] },
    ];
    const { client } = fakeClient(() => message(JSON.stringify({ notes })));
    const res = await generateProposals(client, request);
    expect(res.ok && res.proposals.map((p) => p.fields.type)).toEqual(['cloze']);
    expect(res.ok && res.rejected).toBe(1);
  });

  test('an invalid request never calls the API', async () => {
    const { client, calls } = fakeClient(() => message('{}'));
    expect(await generateProposals(client, { ...request, source: '' })).toMatchObject({ ok: false });
    expect(calls).toHaveLength(0);
  });

  test('a refusal or a truncated answer gives a clear message', async () => {
    expect(await generateProposals(fakeClient(() => message('', 'refusal')).client, request)).toEqual({
      ok: false,
      error: 'Claude a refusé de traiter ce texte. Reformule ou retire les passages sensibles.',
    });
    expect(await generateProposals(fakeClient(() => message('{"notes": [', 'max_tokens')).client, request)).toEqual({
      ok: false,
      error: 'La réponse a été coupée : le texte est trop long pour ce nombre de cartes. Réduis le texte ou le nombre de cartes.',
    });
  });

  test('an unreadable answer gives a message', async () => {
    expect(await generateProposals(fakeClient(() => message('pas du json')).client, request)).toMatchObject({ ok: false, error: expect.stringMatching(/illisible/) });
  });

  test('SDK errors become French messages', async () => {
    const auth = new Anthropic.AuthenticationError(401, {}, 'invalid x-api-key', new Headers());
    const rate = new Anthropic.RateLimitError(429, {}, 'rate limited', new Headers());
    const net = new Anthropic.APIConnectionError({ message: 'Connection error.' });
    expect(await generateProposals(fakeClient(() => auth).client, request)).toEqual({ ok: false, error: 'Clé API refusée. Vérifie-la dans la console Anthropic.' });
    expect(await generateProposals(fakeClient(() => rate).client, request)).toEqual({ ok: false, error: 'Trop de demandes ou crédit épuisé. Réessaie dans un moment ou vérifie ton crédit.' });
    expect(await generateProposals(fakeClient(() => net).client, request)).toEqual({ ok: false, error: 'Impossible de joindre Anthropic. Vérifie ta connexion.' });
  });

  test('an exhausted credit balance (400) says so', async () => {
    const credit = new Anthropic.BadRequestError(400, { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } }, undefined, new Headers());
    expect(await generateProposals(fakeClient(() => credit).client, request)).toEqual({ ok: false, error: 'Crédit Anthropic épuisé. Recharge-le dans la console Anthropic.' });
  });
});

describe('API key storage', () => {
  test('stores, trims and forgets the key', () => {
    const store = memoryStorage();
    expect(getApiKey(store)).toBeNull();
    setApiKey(store, '  sk-ant-xyz ');
    expect(getApiKey(store)).toBe('sk-ant-xyz');
    clearApiKey(store);
    expect(getApiKey(store)).toBeNull();
  });
});

describe('evaluateAnswer', async () => {
  const { evaluateAnswer } = await import('../../src/app/ai');
  const { EVAL_SCHEMA } = await import('../../src/core/evaluate');
  const input = { situation: 'Je bloque.', model: 'Qu’est-ce qui bloque ?', keyPoints: ['Ouverte'], answer: 'Qu’est-ce qui te bloque ?' };
  const good = { verdict: 'reussi', points: [{ covered: true, comment: 'Oui.' }], feedback: 'Bien.', improved: 'Qu’est-ce qui te bloque, là ?' };

  test('sends a short, low-effort structured request', async () => {
    const { client, calls } = fakeClient(() => message(JSON.stringify(good)));
    const res = await evaluateAnswer(client, input);
    expect(res).toMatchObject({ ok: true, evaluation: { verdict: 'reussi', points: [{ point: 'Ouverte', covered: true }] } });
    expect(calls[0]).toMatchObject({
      model: 'claude-opus-5-5',
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: EVAL_SCHEMA } },
    });
    expect(calls[0].max_tokens).toBeLessThanOrEqual(4000);
  });
  test('no answer: no call', async () => {
    const { client, calls } = fakeClient(() => message('{}'));
    expect(await evaluateAnswer(client, { ...input, answer: '' })).toMatchObject({ ok: false });
    expect(calls).toHaveLength(0);
  });
  test('an unreadable or incomplete answer, a refusal or a network error give a message', async () => {
    for (const reply of [message('pas du json'), message(JSON.stringify({ ...good, verdict: '?' })), message('', 'refusal'), new Anthropic.APIConnectionError({ message: 'down' })]) {
      const { client } = fakeClient(() => reply);
      const res = await evaluateAnswer(client, input);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.length).toBeGreaterThan(5);
    }
  });
});
