import type { Question } from './game'

export function normalizeAnswer(answer: string): string {
  return answer.normalize('NFC').toLowerCase().trim()
    .replace(/\s+/gu, ' ')
    // Strip a single sentence-ending period after a word or closing parenthesis.
    // Keep internal dots, numeric trailing dots, operators, and notation.
    .replace(/(?<=[\p{L})])\.$/u, '')
    .replace(/^(?:a|an|the) (?=\p{L})/u, '')
}

function legacyAnswer(answer: string): string | null {
  const normalized = normalizeAnswer(answer)
  // Only use the whole answer if it looks like a short term or expression.
  // Never guess an alias by taking the first word or sentence of an explanation.
  if (!/[\p{L}\p{N}]/u.test(normalized) || normalized.length > 64 || normalized.split(' ').length > 4
    || /^(?:use|choose|consider|try|you|we)\b|[.!?]\s|[,;:]|\b(?:it|this|that|they|is|are|was|were|means|because|not|or|and)\b/u.test(normalized)) {
    return null
  }
  return normalized
}

type AnswerKey = Pick<Question, 'answer' | 'acceptedAnswers'>

export function canGradeQuestion(question: AnswerKey): boolean {
  return Boolean(question.acceptedAnswers?.some((answer) => normalizeAnswer(answer)) || legacyAnswer(question.answer))
}

export function gradeAnswer(question: AnswerKey, submission: string): boolean {
  const normalized = normalizeAnswer(submission)
  if (!normalized) return false
  const variants = question.acceptedAnswers ?? []
  if (variants.some((answer) => normalizeAnswer(answer) === normalized)) return true
  const canonical = variants.length ? normalizeAnswer(question.answer) : legacyAnswer(question.answer)
  return normalized === canonical
}
