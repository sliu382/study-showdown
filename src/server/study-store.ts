import { createUserToolExecutor, RECORD_NOT_FOUND } from 'deepspace/worker'
import type { ActionResult, GetActionData, QueryActionData } from 'deepspace/worker'
import type { Env } from '../../worker'
import { summarizeGame } from '../game/game'
import type { AttemptSubmission, SavedGame, StudyAttempt, StudyHistoryEntry } from '../game/history'
import { ATTEMPTS, GAMES } from '../schemas/study-schema'
import { createActionTools } from './action-routes'

type GameData = Omit<SavedGame, 'id' | 'createdAt'>
type AttemptData = Omit<StudyAttempt, 'id' | 'completedAt'> & { attemptKey: string }

export async function saveGeneratedGame(env: Env, userId: string, jwt: string, game: SavedGame) {
  const { id, createdAt: _generatedAt, ...data } = game
  const result = await createActionTools(env, userId, jwt).create(GAMES, data, id)
  if (!result.success || result.data?.recordId !== id) throw new Error('Game write was not confirmed')
}

export function studyStore(env: Env, userId: string, jwt: string, signal: AbortSignal) {
  const read = createUserToolExecutor(env, userId, signal)

  async function list<T>(collection: string, where: Record<string, unknown> = {}) {
    const result = await read('records.query', {
      collection, where: { ...where, createdBy: userId }, orderBy: 'createdAt', orderDir: 'desc',
    }) as ActionResult<QueryActionData<T>>
    if (!result.success) throw new Error('Study records could not be read')
    return result.data.records.filter((record) => record.createdBy === userId)
  }

  function toAttempt(record: QueryActionData<AttemptData>['records'][number]): StudyAttempt {
    const { attemptKey: _attemptKey, ...data } = record.data
    return { ...data, id: record.recordId, completedAt: record.createdAt }
  }

  async function getGame(id: string): Promise<SavedGame | null> {
    const result = await read('records.get', { collection: GAMES, recordId: id }) as ActionResult<GetActionData<GameData>>
    if (!result.success) {
      if (result.error === RECORD_NOT_FOUND || result.error.startsWith('READ DENIED:')) return null
      throw new Error('Study game could not be read')
    }
    const record = result.data.record
    if (record.createdBy !== userId) return null
    return { ...record.data, id: record.recordId, createdAt: record.createdAt }
  }

  async function saveAttempt(game: SavedGame, submission: AttemptSubmission): Promise<StudyAttempt> {
    const { attemptKey, assessments } = submission
    const stats = summarizeGame(game, { assessments })
    if (stats.total === 0 || stats.answered !== stats.total || Object.keys(assessments).length !== stats.total) {
      throw new IncompleteAttemptError()
    }

    const where = { gameId: game.id, attemptKey }
    const [existing] = await list<AttemptData>(ATTEMPTS, where)
    if (existing) return toAttempt(existing)

    const data: AttemptData = {
      ...where,
      score: stats.score,
      possibleScore: stats.possibleScore,
      correctCount: stats.total - stats.missed.length,
      total: stats.total,
      missedQuestionIds: stats.missed.map(({ id }) => id),
    }
    // Omit the record ID: create with an explicit record ID is an upsert.
    // The unique index makes concurrent attempts with this key insert only once.
    await createActionTools(env, userId, jwt).create(ATTEMPTS, data).catch(() => undefined)
    const [saved] = await list<AttemptData>(ATTEMPTS, where)
    if (!saved) throw new Error('Attempt write was not confirmed')
    return toAttempt(saved)
  }

  async function history(): Promise<StudyHistoryEntry[]> {
    const [games, attempts] = await Promise.all([list<GameData>(GAMES), list<AttemptData>(ATTEMPTS)])
    const byGame = new Map<string, StudyAttempt[]>()
    for (const record of attempts) {
      const attempt = toAttempt(record)
      const related = byGame.get(attempt.gameId) ?? []
      related.push(attempt)
      byGame.set(attempt.gameId, related)
    }
    const entries = games.map(({ recordId, createdAt, data }) => ({
      game: {
        id: recordId, createdAt, topic: data.topic, learningLevel: data.learningLevel,
        categoryCount: data.categories.length,
        questionCount: data.categories.reduce((sum, category) => sum + category.questions.length, 0),
      },
      attempts: byGame.get(recordId) ?? [],
    }))
    const recent = (entry: StudyHistoryEntry) => entry.attempts[0]?.completedAt ?? entry.game.createdAt
    return entries.sort((a, b) => recent(b).localeCompare(recent(a)))
  }

  return { getGame, saveAttempt, history }
}

export class IncompleteAttemptError extends Error {}
