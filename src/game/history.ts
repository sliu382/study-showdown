import type { Game, PlayerProgress } from './game'

export const STUDY_API = '/api/study'

export type SavedGame = Game & { id: string; createdAt: string }

export interface StudyAttempt {
  id: string
  gameId: string
  score: number
  possibleScore: number
  correctCount: number
  total: number
  missedQuestionIds: readonly string[]
  completedAt: string
}

export interface StudyHistoryEntry {
  game: Omit<SavedGame, 'categories' | 'studyContext'> & { categoryCount: number; questionCount: number }
  attempts: StudyAttempt[]
}

export interface AttemptSubmission extends PlayerProgress {
  attemptKey: string
}

export interface StudySaveTicket {
  payload: string
  signature: string
}
