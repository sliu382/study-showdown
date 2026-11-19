import { BodyTooLargeError, readBoundedBodyText } from 'deepspace/worker'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod/v4'
import type { AppContext, Env } from '../../worker'
import { STUDY_API } from '../game/history'
import { resolveAuth } from './http-routes'
import { IncompleteAttemptError, saveGeneratedGame, studyStore } from './study-store'
import { readStudySaveTicket } from './study-ticket'

const attemptInput = z.strictObject({
  attemptKey: z.uuid(),
  assessments: z.record(z.uuid(), z.enum(['correct', 'incorrect'])),
})
const ticketInput = z.strictObject({ payload: z.string(), signature: z.string().length(64) })

async function readJson(request: Request, limit: number): Promise<unknown> {
  try {
    return JSON.parse(await readBoundedBodyText(request, limit))
  } catch (error) {
    if (error instanceof BodyTooLargeError) throw new HTTPException(413, { message: 'The save request is too large.' })
    throw new HTTPException(400, { message: 'The save request must be valid JSON.' })
  }
}

export function registerStudyRoutes(app: Hono<AppContext>) {
  const study = new Hono<{
    Bindings: Env
    Variables: { userId: string; jwt: string; store: ReturnType<typeof studyStore> }
  }>()

  study.onError((error, c) => {
    if (error instanceof HTTPException) return c.json({ error: error.message }, error.status)
    if (error instanceof IncompleteAttemptError) {
      return c.json({ error: 'Assess every question on this board before saving the attempt.' }, 400)
    }
    return c.json({ error: 'Study records are temporarily unavailable. Please try again.' }, 503)
  })

  study.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store')
    const auth = await resolveAuth(c.req.raw, c.env)
    const jwt = c.req.header('Authorization')?.slice('Bearer '.length)
    if (!auth || !jwt || auth.userId.startsWith('anon-')) {
      return c.json({ error: 'Sign in to access your study records.' }, 401)
    }
    c.set('userId', auth.userId)
    c.set('jwt', jwt)
    c.set('store', studyStore(c.env, auth.userId, jwt, c.req.raw.signal))
    await next()
  })

  study.get('/history', async (c) => c.json({ entries: await c.var.store.history() }))

  study.get('/games/:id', async (c) => {
    const id = z.uuid().safeParse(c.req.param('id'))
    const game = id.success ? await c.var.store.getGame(id.data) : null
    return game ? c.json({ game }) : c.json({ error: 'Saved game not found.' }, 404)
  })

  study.post('/games/retry-save', async (c) => {
    const parsed = ticketInput.safeParse(await readJson(c.req.raw, 131072))
    const game = parsed.success
      ? await readStudySaveTicket(c.env.APP_OWNER_JWT, c.var.userId, parsed.data)
      : null
    if (!game) return c.json({ error: 'This game’s save link is invalid or expired.' }, 400)
    await saveGeneratedGame(c.env, c.var.userId, c.var.jwt, game)
    return c.json({ game })
  })

  study.post('/games/:id/attempts', async (c) => {
    const id = z.uuid().safeParse(c.req.param('id'))
    const game = id.success ? await c.var.store.getGame(id.data) : null
    if (!game) return c.json({ error: 'Saved game not found.' }, 404)
    const submission = attemptInput.safeParse(await readJson(c.req.raw, 8192))
    if (!submission.success) return c.json({ error: 'The attempt data is invalid.' }, 400)

    const attempt = await c.var.store.saveAttempt(game, submission.data)
    return c.json({ attempt })
  })

  app.route(STUDY_API, study)
}
