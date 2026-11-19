import { describe, expect, it } from 'vitest'
import { DEFAULT_LEARNING_LEVEL, LEARNING_LEVELS } from './game'
import { quizRequestSchema } from './generation'

const valid = { topic: '  Astronomy  ', categoryCount: 3 }

describe('quiz request validation', () => {
  it.each([3, 6])('accepts %i categories without custom names', (categoryCount) => {
    expect(quizRequestSchema.parse({ ...valid, categoryCount })).toEqual({ topic: 'Astronomy', categoryCount, learningLevel: DEFAULT_LEARNING_LEVEL })
  })

  it('accepts all custom names and trims them', () => {
    const customCategories = [' Stars ', 'Moons', 'Planets']
    expect(quizRequestSchema.parse({ ...valid, customCategories }).customCategories).toEqual(['Stars', 'Moons', 'Planets'])
  })

  it('normalizes blank slots without changing their positions', () => {
    const customCategories = ['', ' Moons ', '  ', null, 'Planets', null]
    expect(quizRequestSchema.parse({ ...valid, categoryCount: 6, customCategories }).customCategories)
      .toEqual([null, 'Moons', null, null, 'Planets', null])
  })

  it.each(LEARNING_LEVELS)('accepts learning level %s', (learningLevel) => {
    const request = quizRequestSchema.parse({ ...valid, learningLevel })
    expect(request.learningLevel).toBe(learningLevel)
    expect(request.studyContext).toBeUndefined()
  })

  it('trims multiline context and accepts exactly 500 characters after trimming', () => {
    const context = 'Focus on genetics.\nAvoid advanced statistics.'
    expect(quizRequestSchema.parse({ ...valid, studyContext: `  ${context}  ` }).studyContext).toBe(context)
    expect(quizRequestSchema.parse({ ...valid, studyContext: ` ${'a'.repeat(500)} ` }).studyContext).toHaveLength(500)
  })

  it('omits blank context from the serialized request', () => {
    const request = quizRequestSchema.parse({ ...valid, studyContext: ' \n ' })
    expect(JSON.parse(JSON.stringify(request))).not.toHaveProperty('studyContext')
  })

  it.each([
    ['too few categories', { categoryCount: 2 }],
    ['too many categories', { categoryCount: 7 }],
    ['a fractional count', { categoryCount: 3.5 }],
    ['a string count', { categoryCount: '3' }],
    ['an empty topic', { topic: '  ' }],
    ['a one-character topic', { topic: 'x' }],
    ['a long topic', { topic: 'x'.repeat(151) }],
    ['duplicate category names', { customCategories: [' Stars ', null, 'sTARS'] }],
    ['a short category array', { customCategories: ['Stars', 'Planets'] }],
    ['a long category array', { customCategories: ['Stars', 'Moons', 'Planets', 'Comets'] }],
    ['a long category name', { customCategories: ['x'.repeat(61), '', ''] }],
    ['an invalid category type', { customCategories: [42, '', ''] }],
    ['an unsupported learning level', { learningLevel: 'elementary' }],
    ['a non-string learning level', { learningLevel: 3 }],
    ['a non-string context', { studyContext: ['genetics'] }],
    ['context over the character limit', { studyContext: 'a'.repeat(501) }],
    ['unexpected fields', { model: 'whatever' }],
  ])('rejects %s', (_label, overrides) => {
    expect(quizRequestSchema.safeParse({ ...valid, ...overrides }).success).toBe(false)
  })
})
