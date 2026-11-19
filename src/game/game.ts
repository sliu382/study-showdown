export const LEARNING_LEVELS = ['general', 'middle-school', 'high-school', 'college', 'graduate'] as const
export type LearningLevel = typeof LEARNING_LEVELS[number]
export const DEFAULT_LEARNING_LEVEL: LearningLevel = 'general'

export const LEARNING_LEVEL_LABELS: Record<LearningLevel, string> = {
  general: 'General knowledge',
  'middle-school': 'Middle school',
  'high-school': 'High school',
  college: 'College / Undergraduate',
  graduate: 'Graduate / Advanced',
}

export const POINT_VALUES = [100, 200, 300] as const
export type PointValue = typeof POINT_VALUES[number]
export type Assessment = 'correct' | 'incorrect'

export interface Question {
  id: string
  points: PointValue
  prompt: string
  answer: string
  acceptedAnswers?: readonly string[]
  explanation?: string
  createdAt?: string
}

export interface Category {
  id: string
  title: string
  questions: readonly Question[]
}

export interface Game {
  id?: string
  createdAt?: string
  topic: string
  learningLevel?: LearningLevel
  studyContext?: string
  categories: readonly Category[]
}

export interface PlayerProgress {
  assessments: Readonly<Partial<Record<string, Assessment>>>
}

export function assessQuestion(
  progress: PlayerProgress,
  question: Question,
  assessment: Assessment,
): PlayerProgress {
  if (Object.hasOwn(progress.assessments, question.id)) return progress
  return { assessments: { ...progress.assessments, [question.id]: assessment } }
}

export function summarizeGame(game: Game, progress: PlayerProgress) {
  const questions = game.categories.flatMap((category) => category.questions)
  const correct = questions.filter(({ id }) => progress.assessments[id] === 'correct')
  const missed = questions.filter(({ id }) => progress.assessments[id] === 'incorrect')
  const answered = correct.length + missed.length
  return {
    score: correct.reduce((sum, question) => sum + question.points, 0),
    possibleScore: questions.reduce((sum, question) => sum + question.points, 0),
    total: questions.length,
    answered,
    accuracy: answered ? Math.round(correct.length / answered * 100) : 0,
    missed,
  }
}
