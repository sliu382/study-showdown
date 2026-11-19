import type { Question } from './game'

const SCRIPT_SYMBOLS = '0123456789+-'
const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻'
const SUBSCRIPT = '₀₁₂₃₄₅₆₇₈₉₊₋'

function normalizeProse(text: string): string {
  return text
    .replace(/(?<![\p{L}\p{N}*_])(\*{1,3}|_{1,2})([^\s*_\r\n](?:[^*_\r\n]*[^\s*_\r\n])?)\1(?![\p{L}\p{N}*_])/gu,
      (match, marker: string, content: string) => (marker.startsWith('_') && !/\s/u.test(content)) || !/[\p{L}\p{N}]/u.test(content) ? match : content)
    .replace(/\\\(([^\\\r\n]+)\\\)|\\\[([^\\\r\n]+)\\\]|\$\$([^$\r\n]+)\$\$|(?<!\$)\$([^\s$]+)\$(?!\$)/gu,
      (match, parenthesized?: string, bracketed?: string, block?: string, inline?: string) => {
        const expression = parenthesized ?? bracketed ?? block ?? inline ?? ''
        const converted = expression.replace(/(?<=[\p{L}\p{N})])([_^])(?:\{([+-]?\d+)\}|(\d)(?![\d.]))/gu,
          (_script, kind: string, braced?: string, bare?: string) => {
            const alphabet = kind === '^' ? SUPERSCRIPT : SUBSCRIPT
            return [...(braced ?? bare ?? '')].map((symbol) => alphabet[SCRIPT_SYMBOLS.indexOf(symbol)]).join('')
          })
        // Without a numeric script the delimiters may be literal code or currency.
        return converted === expression || /[\\^_{}]/u.test(converted) ? match : converted
      })
}

export function normalizeQuestionText(text: string): string {
  // Protect code spans from prose cleanup. Keep the delimiters if unwrapping
  // the span would make a later cleanup pass change its literal content.
  return text.split(/((?<!`)`[^`\r\n]+`(?!`))/gu).map((part, index) => {
    if (index % 2 === 0) return normalizeProse(part)
    const code = part.slice(1, -1)
    return normalizeProse(code) === code ? code : part
  }).join('')
}

export function hasUnsupportedQuestionFormatting(text: string): boolean {
  return /^[ \t]*(?:`{3,}|~{3,}|#{1,6}[ \t]+)|\\\([^\r\n]*?\\\)|\\\[[^\r\n]*?\\\]|\\(?:frac|sqrt|begin|text)\s*\{|\$\$[^$]+\$\$|\$[^$\s]*[_^][^$\s]+\$/mu.test(text)
}

type QuestionText = Pick<Question, 'prompt' | 'answer' | 'explanation' | 'acceptedAnswers'>

export function normalizeQuestionFormatting<T extends QuestionText>(question: T) {
  return {
    ...question,
    prompt: normalizeQuestionText(question.prompt),
    answer: normalizeQuestionText(question.answer),
    explanation: question.explanation === undefined ? undefined : normalizeQuestionText(question.explanation),
    acceptedAnswers: question.acceptedAnswers?.map(normalizeQuestionText),
  }
}
