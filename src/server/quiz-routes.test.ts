import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import type { AppContext, Env } from '../../worker'
import { POINT_VALUES } from '../game/game'
import { QUIZ_ENDPOINT } from '../game/generation'
import { GAMES } from '../schemas/study-schema'
import { createActionTools } from './action-routes'
import { registerAuthAndIntegrationRoutes, registerStaticRoutes } from './http-routes'
import { mockStudyRoom } from './study-room.fixture'
import { registerStudyRoutes } from './study-routes'
import { registerQuizRoutes } from './quiz-routes'

vi.mock('deepspace/worker', async (importOriginal) => ({
  ...await importOriginal<typeof import('deepspace/worker')>(),
  verifyJwt: async (_config: unknown, token: string) => ({
    result: token === 'mock-session'
      ? { userId: 'test-student', claims: { sub: 'test-student' } }
      : null,
  }),
}))

const validRequest = { topic: 'Astronomy', categoryCount: 3 }

function setup(mockOutput: unknown = {
  categories: ['Stars', 'Moons', 'Planets'].map((title) => ({
    title,
    questions: POINT_VALUES.map((points) => ({
      points, prompt: `${title} clue for ${points}`, answer: 'Test answer', acceptedAnswers: ['  Fixture answer  '], explanation: 'Test explanation',
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
  registerAuthAndIntegrationRoutes(app)
  registerQuizRoutes(app)
  registerStudyRoutes(app)
  registerStaticRoutes(app)
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
  return { app, env, mockProvider, post, retry, room }
}

describe('integration execution boundary', () => {
  it.each([
    ['unauthenticated OpenAI', '/api/integrations/openai/chat-completion', undefined],
    ['invalid session', '/api/integrations/openai/chat-completion', 'Bearer invalid-session'],
    ['unconfigured integration', '/api/integrations/unconfigured/example', 'Bearer mock-session'],
    ['server-action provider', '/api/integrations/google/example', 'Bearer mock-session'],
  ])('rejects a browser request for %s before the upstream', async (_description, path, authorization) => {
    const { app, env, mockProvider } = setup()
    const response = await app.request(path, {
      method: 'POST',
      headers: authorization ? { Authorization: authorization } : undefined,
      body: '{}',
    }, env)

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'not_found' })
    expect(mockProvider).not.toHaveBeenCalled()
  })

  it('keeps browser callers on the validated, caller-billed quiz route', async () => {
    const { app, env, mockProvider, post } = setup()
    expect((await post(JSON.stringify({ ...validRequest, topic: '' }))).status).toBe(400)
    expect(mockProvider).not.toHaveBeenCalled()
    expect((await post(JSON.stringify(validRequest))).status).toBe(200)
    expect((await post(JSON.stringify(validRequest))).status).toBe(429)

    const bypass = await app.request('/api/integrations/openai/chat-completion', {
      method: 'POST',
      headers: { Authorization: 'Bearer mock-session', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validRequest, topic: '' }),
    }, env)
    expect(bypass.status).toBe(404)
    expect(mockProvider).toHaveBeenCalledOnce()
    expect(new Headers(mockProvider.mock.calls[0][1].headers).get('X-Auth-Token')).toBe('mock-session')
  })

  it('keeps the integration catalog accessible without owner credentials', async () => {
    const { app, env, mockProvider } = setup()
    const response = await app.request('/api/integrations', {}, env)
    expect(response.status).toBe(200)
    expect(mockProvider).toHaveBeenCalledOnce()
    const [url, options] = mockProvider.mock.calls[0]
    expect(new URL(url).pathname).toBe('/api/integrations')
    expect(new Headers(options?.headers).has('Authorization')).toBe(false)
  })

  it('rejects unconfigured server-action integrations before forwarding', async () => {
    const { env, mockProvider } = setup()
    const tools = createActionTools(env, 'test-student', 'mock-session')
    expect(await tools.integration('openai/chat-completion')).toMatchObject({
      success: false, code: 'integration_not_configured',
    })
    expect(mockProvider).not.toHaveBeenCalled()
  })
})

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
    const [stored] = [...room.collections.get(GAMES)!.values()]
    expect(stored.data.categories).toEqual(expect.arrayContaining([expect.objectContaining({
      questions: expect.arrayContaining([expect.objectContaining({ acceptedAnswers: ['Fixture answer'] })]),
    })]))
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
