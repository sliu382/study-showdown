import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import type { AppContext } from '../../worker'
import type { Assessment } from '../game/game'
import type { SavedGame, StudyAttempt } from '../game/history'
import { sampleGame } from '../game/sample'
import { ATTEMPTS } from '../schemas/study-schema'
import { saveGeneratedGame } from './study-store'
import { registerStudyRoutes } from './study-routes'
import { makeStudySaveTicket } from './study-ticket'
import { mockStudyRoom } from './study-room.fixture'

vi.mock('./http-routes', () => ({
  resolveAuth: (request: Request) => {
    const userId = request.headers.get('Authorization')?.slice(7)
    return userId ? { userId, claims: { sub: userId } } : null
  },
}))

async function setup(categoryCount = 3) {
  const room = mockStudyRoom()
  const app = new Hono<AppContext>()
  registerStudyRoutes(app)
  const game: SavedGame = {
    id: crypto.randomUUID(), topic: sampleGame.topic, createdAt: new Date().toISOString(),
    studyContext: 'Review algorithms', learningLevel: 'college',
    categories: Array.from({ length: categoryCount }, (_, index) => {
      const category = sampleGame.categories[index % sampleGame.categories.length]
      return { ...category, id: crypto.randomUUID(), questions: category.questions.map((question) => ({
        ...question, id: crypto.randomUUID(),
      })) }
    }),
  }
  await saveGeneratedGame(room.env, 'owner', 'owner', game)
  const questions = game.categories.flatMap((category) => category.questions)
  const assessments = Object.fromEntries(questions.map(({ id }, index): [string, Assessment] =>
    [id, index === 0 ? 'incorrect' : 'correct']))
  const attemptKey = crypto.randomUUID()
  const gamePath = `/games/${game.id}`
  function request(path: string, user?: string, body?: unknown) {
    return app.request(`/api/study${path}`, {
      method: body ? 'POST' : 'GET',
      headers: user ? { Authorization: `Bearer ${user}` } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }, room.env)
  }
  function complete(key = attemptKey) {
    return request(`${gamePath}/attempts`, 'owner', { attemptKey: key, assessments })
  }
  return { request, room, game, gamePath, complete, questions, assessments, attemptKey }
}

describe('study history with mocked auth and RecordRoom', () => {
  it('requires auth, hides other users’ game IDs, and only lists the owner’s own games', async () => {
    const { request, game, gamePath, assessments, attemptKey } = await setup()
    expect((await request('/history')).status).toBe(401)
    expect((await request(gamePath, 'visitor')).status).toBe(404)
    expect((await request(`${gamePath}/attempts`, 'visitor', { attemptKey, assessments })).status).toBe(404)
    expect(await (await request('/history', 'visitor')).json()).toEqual({ entries: [] })
    expect(await (await request(gamePath, 'owner')).json()).toMatchObject({ game: {
      id: game.id, topic: game.topic, learningLevel: 'college', studyContext: 'Review algorithms',
    } })
    expect(await (await request('/history', 'owner')).json()).toMatchObject({
      entries: [{ game: { id: game.id, categoryCount: 3, questionCount: 9 }, attempts: [] }],
    })
    const ticket = await makeStudySaveTicket('mock-test-signing-secret', 'owner', game)
    expect((await request('/games/retry-save', 'visitor', ticket)).status).toBe(400)
  })

  it.each([3, 6])('saves a self-assessed attempt using stored point values on a %i-category board', async (count) => {
    const { complete, questions, game, request } = await setup(count)
    const response = await complete()
    expect(response.status).toBe(200)
    const { attempt } = await response.json() as { attempt: StudyAttempt }
    expect(attempt).toMatchObject({
      gameId: game.id, score: count * 600 - 100, possibleScore: count * 600,
      total: count * 3, correctCount: count * 3 - 1, missedQuestionIds: [questions[0].id],
    })
    expect(await (await request('/history', 'owner')).json()).toMatchObject({
      entries: [{ game: { id: game.id }, attempts: [attempt] }],
    })
  })

  it('keeps concurrent and retried submissions idempotent while allowing a fresh replay', async () => {
    const { complete, room } = await setup()
    const results = await Promise.all([complete(), complete()])
    const first = await results[0].json()
    expect(await results[1].json()).toEqual(first)
    expect(await (await complete()).json()).toEqual(first)
    expect((await complete(crypto.randomUUID())).status).toBe(200)
    expect(room.collections.get(ATTEMPTS)?.size).toBe(2)
  })

  it('rejects incomplete and unrelated assessments and reports failed writes for retry', async () => {
    const { complete, gamePath, request, room, attemptKey, assessments, questions } = await setup()
    const route = `${gamePath}/attempts`
    expect((await request(route, 'owner', { attemptKey, assessments: {} })).status).toBe(400)
    const { [questions[0].id]: first, ...remaining } = assessments
    expect((await request(route, 'owner', { attemptKey, assessments: { ...remaining, [crypto.randomUUID()]: first } })).status).toBe(400)
    room.failures.add(ATTEMPTS)
    expect((await complete()).status).toBe(503)
    room.failures.delete(ATTEMPTS)
    expect((await complete()).status).toBe(200)
  })
})
