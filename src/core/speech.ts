import { expectedText, type Exercise } from './exercise';

/** What « Écouter » reads: the question, then the answer once it is shown. Cloze gaps are read as « blanc ». */
export function spokenText(ex: Exercise, answerShown: boolean): string {
  if (answerShown) return expectedText(ex);
  switch (ex.kind) {
    case 'choice':
      return [ex.prompt, ex.quote, ...ex.options.map((o, i) => `${i + 1}. ${o}`)].filter(Boolean).join('. ');
    case 'typed':
      return ex.figure ? ex.prompt : `${ex.before} … ${ex.after}`.replace(/\s+/g, ' ').trim();
    case 'order':
      return ex.prompt;
    case 'reveal':
      return [ex.quote ?? '', ex.quote ? '' : ex.front].filter(Boolean).join('. ') || ex.prompt;
  }
}
