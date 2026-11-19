import { describe, expect, it } from 'vitest'
import { hasUnsupportedQuestionFormatting, normalizeQuestionFormatting, normalizeQuestionText } from './question-text'

describe('question text cleanup', () => {
  it.each([
    ['Who created *The Simpsons*?', 'Who created The Simpsons?'],
    ['**Springfield** is the setting.', 'Springfield is the setting.'],
    ['The show is _The Simpsons_.', 'The show is The Simpsons.'],
    ['*Bart* and **Lisa**', 'Bart and Lisa'],
    ['Call `console.log()`.', 'Call console.log().'],
  ])('cleans presentation markers in %j', (text, expected) => {
    expect(normalizeQuestionText(text)).toBe(expected)
  })

  it.each([
    'The answer is Springfield.',
    'Try H₂O or H2O, x² or x squared.',
    'Python uses x**2 and snake_case. Preserve __init__, _value_, and x_i.',
    'a * b, a*b*c, C++, std::vector, *.txt and *.*',
    'Prices are $3 and $5.',
    String.raw`The regex \(literal\) matches parentheses.`,
    'The caret notation x^2 remains readable plain text.',
  ])('preserves plain content %j', (text) => {
    expect(normalizeQuestionText(text)).toBe(text)
  })

  it.each([
    [String.raw`Use \(x^{2}\) and \(H_{2}O\).`, 'Use x² and H₂O.'],
    [String.raw`What is $x^2$?`, 'What is x²?'],
    [String.raw`The exponent is \[10^{-3}\].`, 'The exponent is 10⁻³.'],
    ['Water is $H_2O$.', 'Water is H₂O.'],
  ])('converts simple numeric scripts with explicit math delimiters', (text, expected) => {
    expect(normalizeQuestionText(text)).toBe(expected)
    expect(normalizeQuestionText(expected)).toBe(expected)
  })

  it('keeps a literal code span protected across repeated cleanup', () => {
    const text = 'The glob is `*name*`.'
    expect(normalizeQuestionText(text)).toBe(text)
    expect(normalizeQuestionText(normalizeQuestionText(text))).toBe(text)
  })

  it('flags complex LaTeX, headings, and fenced blocks for generation validation', () => {
    const complex = String.raw`Apply \(\frac{1}{2}\) to the result.`
    expect(normalizeQuestionText(complex)).toBe(complex)
    expect(hasUnsupportedQuestionFormatting(complex)).toBe(true)
    expect(hasUnsupportedQuestionFormatting('## Heading')).toBe(true)
    expect(hasUnsupportedQuestionFormatting('Example:\n```js\nconst a = 1\n```')).toBe(true)
    const decimalExponent = String.raw`Evaluate \(x^2.5\).`
    expect(normalizeQuestionText(decimalExponent)).toBe(decimalExponent)
    expect(hasUnsupportedQuestionFormatting(decimalExponent)).toBe(true)
  })

  it('can clean a legacy question without requiring aliases or mutating the record', () => {
    const question = { id: 'saved', prompt: 'Name **the structure**.', answer: '*Stack*' }
    expect(normalizeQuestionFormatting(question)).toMatchObject({ id: 'saved', prompt: 'Name the structure.', answer: 'Stack' })
    expect(question.answer).toBe('*Stack*')
  })
})
