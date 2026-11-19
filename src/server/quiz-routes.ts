import { APICallError, NoObjectGeneratedError } from 'ai'
import { BodyTooLargeError, readBoundedBodyText } from 'deepspace/worker'
import type { Hono } from 'hono'
import type { AppContext } from '../../worker'
import { generateQuiz, InvalidQuizError } from '../ai/quiz'
import { QUIZ_ENDPOINT, quizRequestSchema } from '../game/generation'
import { resolveAuth } from './http-routes'
import { saveGeneratedGame } from './study-store'
import { makeStudySaveTicket } from './study-ticket'

const QUIZ_TIMEOUT_MS = 45_000
const COOLDOWN_SECONDS = 10
const MAX_RECENT_CALLERS = 256

export function registerQuizRoutes(app: Hono<AppContext>) {
  // Best-effort isolate-local throttling. DeepSpace credits are enforced by the proxy.
  const callers = new Map<string, { running: boolean; retryAt: number }>()

  app.post(QUIZ_ENDPOINT, async (c) => {
    c.header('Cache-Control', 'no-store')
    const auth = await resolveAuth(c.req.raw, c.env)
    const callerJwt = c.req.header('Authorization')?.slice('Bearer '.length)
    if (!auth || !callerJwt || auth.userId.startsWith('anon-')) {
      return c.json({ code: 'sign_in_required', error: 'Sign in to generate a game.' }, 401)
    }
    if (c.req.header('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return c.json({ code: 'invalid_content_type', error: 'Send the game settings as JSON.' }, 415)
    }

    let input: unknown
    try {
      input = JSON.parse(await readBoundedBodyText(c.req.raw, 8192))
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        return c.json({ code: 'body_too_large', error: 'The game settings are too large.' }, 413)
      }
      return c.json({ code: 'invalid_json', error: 'The game settings must be valid JSON.' }, 400)
    }

    const request = quizRequestSchema.safeParse(input)
    if (!request.success) {
      return c.json({ code: 'invalid_settings', error: request.error.issues[0].message }, 400)
    }

    const now = Date.now()
    for (const [userId, call] of callers) {
      if (!call.running && call.retryAt <= now) callers.delete(userId)
    }
    const previous = callers.get(auth.userId)
    if (previous || callers.size >= MAX_RECENT_CALLERS) {
      c.header('Retry-After', String(COOLDOWN_SECONDS))
      return c.json({ code: 'quiz_rate_limited', error: 'Please wait a few seconds before generating another game.' }, 429)
    }

    const attempt = { running: true, retryAt: 0 }
    callers.set(auth.userId, attempt)
    const timeout = AbortSignal.timeout(QUIZ_TIMEOUT_MS)
    try {
      const signal = AbortSignal.any([timeout, c.req.raw.signal])
      const game = await generateQuiz(c.env, callerJwt, request.data, signal)
      try {
        await saveGeneratedGame(c.env, auth.userId, callerJwt, game)
        return c.json({ game })
      } catch {
        // Retry the write without sending another paid AI request.
        const retrySave = await makeStudySaveTicket(c.env.APP_OWNER_JWT, auth.userId, game)
        return c.json({ retrySave, error: 'Your board was generated, but could not be saved. Retry the save without using more AI credits.' }, 503)
      }
    } catch (error) {
      if (timeout.aborted) {
        return c.json({ code: 'quiz_timeout', error: 'Generation took too long. Please try again.' }, 504)
      }
      if (error instanceof InvalidQuizError || NoObjectGeneratedError.isInstance(error)) {
        return c.json({ code: 'invalid_quiz', error: 'The model returned an incomplete or invalid board. Please try again.' }, 502)
      }
      if (APICallError.isInstance(error)) {
        if (error.statusCode === 402) {
          return c.json({ code: 'insufficient_credits', error: 'Your DeepSpace account has insufficient AI credits.' }, 402)
        }
        if (error.statusCode === 401 || error.statusCode === 403) {
          return c.json({ code: 'ai_access_denied', error: 'DeepSpace could not authorize AI access for your account. Try signing in again.' }, 403)
        }
        if (error.statusCode === 429) {
          return c.json({ code: 'ai_busy', error: 'The AI service is busy. Wait a moment and try again.' }, 503)
        }
      }
      return c.json({ code: 'quiz_unavailable', error: 'The AI service could not generate a game. Please try again.' }, 502)
    } finally {
      attempt.running = false
      attempt.retryAt = Date.now() + COOLDOWN_SECONDS * 1000
    }
  })
}
