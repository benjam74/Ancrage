import Anthropic from '@anthropic-ai/sdk';
import { OUTPUT_SCHEMA, buildPrompt, checkRequest, toProposals, type GenerationRequest, type Proposal } from '../core/generate';
import type { KeyValue } from './cloud';
import { EVAL_SCHEMA, buildEvalPrompt, checkEvalInput, toEvaluation, type EvalInput, type Evaluation } from '../core/evaluate';

export const AI_MODEL = 'claude-opus-5-5';
const KEY = 'ancrage.ai.key';

/** The part of the SDK client this feature uses; injectable in tests. */
export interface AiClient {
  beta: {
    messages: {
      create(params: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming): Promise<Anthropic.Beta.Messages.BetaMessage>;
    };
  };
}

/** The key stays on this device; requests go straight from the browser to Anthropic. */
export function createAiClient(apiKey: string): AiClient {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

export const getApiKey = (store: KeyValue) => store.get(KEY);
export const setApiKey = (store: KeyValue, key: string) => store.set(KEY, key.trim());
export const clearApiKey = (store: KeyValue) => store.remove(KEY);

export type GenerationResult = { ok: true; proposals: Proposal[]; rejected: number } | { ok: false; error: string };

function errorMessage(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return 'Clé API refusée. Vérifie-la dans la console Anthropic.';
  }
  if (e instanceof Anthropic.RateLimitError) return 'Trop de demandes ou crédit épuisé. Réessaie dans un moment ou vérifie ton crédit.';
  if (e instanceof Anthropic.BadRequestError && /credit/i.test(e.message)) return 'Crédit Anthropic épuisé. Recharge-le dans la console Anthropic.';
  if (e instanceof Anthropic.APIConnectionError) return 'Impossible de joindre Anthropic. Vérifie ta connexion.';
  if (e instanceof Anthropic.APIError) return `Anthropic a renvoyé une erreur (${e.status ?? 'inconnue'}). Réessaie dans un moment.`;
  return 'La génération a échoué. Réessaie dans un moment.';
}

export async function generateProposals(client: AiClient, request: GenerationRequest): Promise<GenerationResult> {
  const invalid = checkRequest(request);
  if (invalid) return { ok: false, error: invalid };
  const { system, user } = buildPrompt(request);
  let response: Anthropic.Beta.Messages.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model: AI_MODEL,
      max_tokens: 16000,
      // On a safety decline, the API re-runs the request on its recommended fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      system,
      messages: [{ role: 'user', content: user }],
    });
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
  if (response.stop_reason === 'refusal') {
    return { ok: false, error: 'Claude a refusé de traiter ce texte. Reformule ou retire les passages sensibles.' };
  }
  if (response.stop_reason === 'max_tokens') {
    return { ok: false, error: 'La réponse a été coupée : le texte est trop long pour ce nombre de cartes. Réduis le texte ou le nombre de cartes.' };
  }
  const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Réponse illisible. Réessaie.' };
  }
  return { ok: true, ...toProposals(raw, request.types) };
}

export type EvaluationResult = { ok: true; evaluation: Evaluation } | { ok: false; error: string };

/** Feedback on a scenario answer; quick and cheap (low effort), and never required to grade the card. */
export async function evaluateAnswer(client: AiClient, input: EvalInput): Promise<EvaluationResult> {
  const invalid = checkEvalInput(input);
  if (invalid) return { ok: false, error: invalid };
  const { system, user } = buildEvalPrompt(input);
  let response: Anthropic.Beta.Messages.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model: AI_MODEL,
      max_tokens: 3000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: EVAL_SCHEMA } },
      system,
      messages: [{ role: 'user', content: user }],
    });
  } catch (e) {
    return { ok: false, error: errorMessage(e).replace('La génération a échoué', 'L’évaluation a échoué') };
  }
  if (response.stop_reason === 'refusal') return { ok: false, error: 'Claude n’a pas pu évaluer cette réponse. Compare-la toi-même à la réponse modèle.' };
  if (response.stop_reason === 'max_tokens') return { ok: false, error: 'Le retour a été coupé. Réessaie.' };
  let raw: unknown;
  try {
    raw = JSON.parse(response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join(''));
  } catch {
    return { ok: false, error: 'Retour illisible. Réessaie.' };
  }
  const evaluation = toEvaluation(raw, input.keyPoints);
  return evaluation ? { ok: true, evaluation } : { ok: false, error: 'Retour incomplet. Réessaie.' };
}
