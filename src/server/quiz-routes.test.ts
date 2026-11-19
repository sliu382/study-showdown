import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import type { AppContext, Env } from '../../worker'
import { POINT_VALUES } from '../game/game'
import { QUIZ_ENDPOINT } from '../game/generation'
import { GAMES } from '../schemas/study-schema'
import { mockStudyRoom } from './study-room.fixture'
import { registerStudyRoutes } from './study-routes'
import { registerQuizRoutes } from './quiz-routes'

vi.mock('./http-routes', () => ({
  resolveAuth: async (request: Request) => request.headers.get('Authorization') === 'Bearer mock-session'
    ? { userId: 'test-student', claims: { sub: 'test-student' } }
    : null,
}))

const validRequest = { topic: 'Astronomy', categoryCount: 3 }

function setup(mockOutput: unknown = {
  categories: ['Stars', 'Moons', 'Planets'].map((title) => ({
    title,
    questions: POINT_VALUES.map((points) => ({
      points, prompt: `${title} clue for ${points}`, answer: 'Test answer', explanation: 'Test explanation',
    })),
  })),
}, providerStatus = 200) {
  const mockProvider = vi.fn(async (_url: string, _options: RequestInit) => providerStatus === 200
    ? Response.json({
      id: 'mock-completion',
      created: 1,
      model: 'gpt-6-luna',
      choices: [{
        index: 0, message: { role: 'assistant', content: JSON.stringify(mockOutput) }, finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 100, completion_tokens: 300 },
    })
    : Response.json({ error: { message: 'Private provider error details' } }, { status: providerStatus }))
  const room = mockStudyRoom()
  const env = { ...room.env, API_WORKER: { fetch: mockProvider } } as unknown as Env
  const app = new Hono<AppContext>()
  registerQuizRoutes(app)
  registerStudyRoutes(app)
  function post(body: string, authorized = true) {
    const headers = new Headers({ 'Content-Type': 'application/json' })
    if (authorized) headers.set('Authorization', 'Bearer mock-session')
    return app.request(QUIZ_ENDPOINT, { method: 'POST', headers, body }, env)
  }
  function retry(ticket: unknown) {
    return app.request('/api/study/games/retry-save', {
      method: 'POST', headers: { Authorization: 'Bearer mock-session' }, body: JSON.stringify(ticket),
    }, env)
  }
  return { mockProvider, post, retry, room }
}

describe('quiz endpoint with mocked auth and DeepSpace proxy', () => {
  it('uses caller billing and requests structured output through the installed AI SDK', async () => {
    const { mockProvider, post, room } = setup()
    const response = await post(JSON.stringify(validRequest))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      game: { topic: 'Astronomy', learningLevel: 'general', categories: expect.any(Array) },
    })
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect([...room.collections.get(GAMES)!.values()]).toMatchObject([
      { createdBy: 'test-student', data: { topic: 'Astronomy', learningLevel: 'general' } },
    ])
    expect(mockProvider).toHaveBeenCalledOnce()
    const [url, options] = mockProvider.mock.calls[0]
    expect(url).toContain('/api/proxy/openai/v1/chat/completions')
    expect(new Headers(options.headers).get('X-Auth-Token')).toBe('mock-session')
    expect(JSON.parse(options.body as string)).toMatchObject({
      model: 'gpt-6-luna',
      reasoning_effort: 'low',
      response_format: { type: 'json_schema' },
      messages: [
        { role: expect.stringMatching(/system|developer/), content: expect.stringContaining('untrusted JSON data') },
        { role: 'user', content: JSON.stringify({ ...validRequest, learningLevel: 'general' }) },
      ],
    })
  })

  it('sends validated personalization as user data and returns it as game metadata', async () => {
    const { mockProvider, post } = setup()
    const studyContext = 'Focus on orbital mechanics.\nAvoid advanced calculus.'
    const response = await post(JSON.stringify({
      ...validRequest, learningLevel: 'college', studyContext: `  ${studyContext}  `,
    }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ game: { learningLevel: 'college', studyContext } })

    const [, options] = mockProvider.mock.calls[0]
    const { messages } = JSON.parse(options.body as string)
    expect(messages[0].content).toContain('Increase difficulty within that same learning level')
    expect(messages[0].content).not.toContain(studyContext)
    expect(messages[1].role).toBe('user')
    expect(JSON.parse(messages[1].content)).toEqual({ ...validRequest, learningLevel: 'college', studyContext })
  })

  it('retries an unconfirmed board save without invoking the model again', async () => {
    const { mockProvider, post, retry, room } = setup()
    room.failures.add(GAMES)
    const response = await post(JSON.stringify(validRequest))
    expect(response.status).toBe(503)
    const { retrySave } = await response.json() as { retrySave: { payload: string; signature: string } }
    expect(retrySave.signature).toHaveLength(64)
    room.failures.delete(GAMES)
    expect((await retry({ ...retrySave, payload: retrySave.payload + ' ' })).status).toBe(400)
    expect((await retry(retrySave)).status).toBe(200)
    expect((await retry(retrySave)).status).toBe(200)
    expect(room.collections.get(GAMES)?.size).toBe(1)
    expect(mockProvider).toHaveBeenCalledOnce()
  })

  it('rejects anonymous, malformed, oversized, or invalid requests before calling AI', async () => {
    const { mockProvider, post } = setup()
    expect((await post(JSON.stringify(validRequest), false)).status).toBe(401)
    expect((await post('not-json')).status).toBe(400)
    expect((await post('x'.repeat(8193))).status).toBe(413)
    expect((await post(JSON.stringify({ ...validRequest, categoryCount: 7 }))).status).toBe(400)
    expect((await post(JSON.stringify({ ...validRequest, learningLevel: 'unknown' }))).status).toBe(400)
    expect((await post(JSON.stringify({ ...validRequest, studyContext: 'a'.repeat(501) }))).status).toBe(400)
    expect(mockProvider).not.toHaveBeenCalled()
  })

  it('throttles duplicate requests from the same user', async () => {
    const { mockProvider, post } = setup()
    const [first, second] = await Promise.all([post(JSON.stringify(validRequest)), post(JSON.stringify(validRequest))])
    expect([first.status, second.status].sort()).toEqual([200, 429])
    expect(mockProvider).toHaveBeenCalledOnce()
  })

  it('returns a safe invalid-output message when the model does not return a board', async () => {
    const { post } = setup({ categories: [] })
    const response = await post(JSON.stringify(validRequest))
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ code: 'invalid_quiz' })
  })

  it('returns a safe credit error and does not retry a refused provider request', async () => {
    const { mockProvider, post } = setup(undefined, 402)
    const response = await post(JSON.stringify(validRequest))
    expect(response.status).toBe(402)
    expect(await response.json()).toEqual({
      code: 'insufficient_credits', error: 'Your DeepSpace account has insufficient AI credits.',
    })
    expect(mockProvider).toHaveBeenCalledOnce()
  })
})
