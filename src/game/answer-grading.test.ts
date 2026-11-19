import { describe, expect, it } from 'vitest'
import { canGradeQuestion, gradeAnswer, normalizeAnswer } from './answer-grading'
import { sampleGame } from './sample'

const stack = {
  answer: 'A stack. It follows last in, first out (LIFO) order.',
  acceptedAnswers: ['stack', 'LIFO stack', 'last in first out stack'],
}

describe('typed answer grading', () => {
  it.each(['stack', 'STACK', '  stack  ', 'a stack', 'the stack.', 'stack.', 'LIFO   STACK', 'last in first out stack'])(
    'accepts a normalized match for %j',
    (answer) => expect(gradeAnswer(stack, answer)).toBe(true),
  )

  it.each(['queue', 'not a stack', 'stack or queue', 'stack overflow', 'stacks', '   ', ''])(
    'rejects %j',
    (answer) => expect(gradeAnswer(stack, answer)).toBe(false),
  )

  it('also accepts the exact human-readable answer', () => {
    expect(gradeAnswer(stack, stack.answer)).toBe(true)
  })

  it.each([
    ['C++', 'C'],
    ['C#', 'C'],
    ['console.log', 'consolelog'],
    ['.NET', 'NET'],
    ['3.0', '30'],
    ['x < 5', 'x > 5'],
    ['x == 5', 'x = 5'],
    ['-2', '2'],
    ['Na+', 'Na'],
    ['SO₄²⁻', 'SO4'],
    ['n!', 'n'],
    ['a + b', '+ b'],
    ['(x, y)', '(x y)'],
  ])('preserves the distinction between %s and %s', (canonical, different) => {
    const question = { answer: canonical, acceptedAnswers: [canonical] }
    expect(gradeAnswer(question, canonical)).toBe(true)
    expect(gradeAnswer(question, different)).toBe(false)
  })

  it('collapses tabs and newlines between words', () => {
    expect(normalizeAnswer('  The   Domain\nName\tSystem.  ')).toBe('domain name system')
  })

  it('uses whole concise legacy answers and refuses to extract guesses from explanations', () => {
    const legacy = { answer: 'A stack.' }
    expect(canGradeQuestion(legacy)).toBe(true)
    expect(gradeAnswer(legacy, 'Stack')).toBe(true)
    expect(gradeAnswer({ answer: 'Binary search' }, 'binary search')).toBe(true)
    expect(canGradeQuestion({ answer: stack.answer })).toBe(false)
    expect(gradeAnswer({ answer: stack.answer }, 'stack')).toBe(false)
    expect(canGradeQuestion({ answer: 'It follows FIFO order.' })).toBe(false)
    expect(canGradeQuestion({ answer: 'Use a queue.' })).toBe(false)
    expect(canGradeQuestion({ answer: '   ' })).toBe(false)
  })

  it('gives every sample clue a gradable answer', () => {
    expect(sampleGame.categories.flatMap(({ questions }) => questions).every(canGradeQuestion)).toBe(true)
  })
})
