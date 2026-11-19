import { z } from 'zod/v4'
import { DEFAULT_LEARNING_LEVEL, LEARNING_LEVELS } from './game'
import type { SavedGame, StudySaveTicket } from './history'

export const QUIZ_ENDPOINT = '/api/quiz/generate'
export const TOPIC_MAX_LENGTH = 150
export const CATEGORY_MAX_LENGTH = 60
export const STUDY_CONTEXT_MAX_LENGTH = 500
export const CATEGORY_COUNTS = [3, 4, 5, 6] as const
export const MIN_CATEGORIES = CATEGORY_COUNTS[0]
export const MAX_CATEGORIES = Math.max(...CATEGORY_COUNTS)

export const quizRequestSchema = z.strictObject({
  topic: z.string().trim()
    .min(2, 'Enter a study topic with at least 2 characters.')
    .max(TOPIC_MAX_LENGTH, 'Keep the study topic to 150 characters.'),
  categoryCount: z.literal(CATEGORY_COUNTS, { error: 'Choose 3, 4, 5, or 6 categories.' }),
  customCategories: z.array(
    z.string().trim().max(CATEGORY_MAX_LENGTH, 'Keep each category name to 60 characters.')
      .nullable().transform((name) => name || null),
  ).max(MAX_CATEGORIES).optional(),
  learningLevel: z.enum(LEARNING_LEVELS, { error: 'Choose a supported learning level.' }).default(DEFAULT_LEARNING_LEVEL),
  studyContext: z.string().trim()
    .max(STUDY_CONTEXT_MAX_LENGTH, 'Keep additional study context to 500 characters.')
    .transform((context) => context || undefined).optional(),
}, { error: 'Send only supported quiz settings.' })
  .superRefine(({ categoryCount, customCategories }, context) => {
    if (!customCategories) return
    if (customCategories.length !== categoryCount) {
      context.addIssue({
        code: 'custom', path: ['customCategories'], message: 'Include one category slot for each selected category.',
      })
    }
    const seen = new Set<string>()
    customCategories.forEach((name, index) => {
      if (!name) return
      const key = name.toLowerCase()
      if (seen.has(key)) {
        context.addIssue({
          code: 'custom', path: ['customCategories', index], message: 'Give each custom category a different name.',
        })
      }
      seen.add(key)
    })
  })

export type QuizRequest = z.infer<typeof quizRequestSchema>
export type QuizResponse = { game: SavedGame } | { code?: string; error: string; retrySave?: StudySaveTicket }
