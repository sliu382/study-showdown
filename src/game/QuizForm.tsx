import { lazy, Suspense, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { FormEvent, Ref } from 'react'
import { ChevronDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { z, type ZodIssue } from 'zod/v4'
import { DEFAULT_LEARNING_LEVEL, LEARNING_LEVEL_LABELS, LEARNING_LEVELS, POINT_VALUES } from './game'
import {
  CATEGORY_COUNTS, CATEGORY_MAX_LENGTH, MAX_CATEGORIES, MIN_CATEGORIES, QUIZ_ENDPOINT, STUDY_CONTEXT_MAX_LENGTH, TOPIC_MAX_LENGTH,
  quizRequestSchema, type QuizResponse,
} from './generation'

import type { SavedGame, StudySaveTicket } from './history'
import { studyRequest } from './study-client'

const AuthOverlay = lazy(async () => ({ default: (await import('deepspace')).AuthOverlay }))
const DRAFT_KEY = 'study-showdown-sign-in-draft'
const draftSchema = z.object({
  topic: z.string().max(TOPIC_MAX_LENGTH),
  categoryCount: z.literal(CATEGORY_COUNTS),
  categories: z.array(z.string().max(CATEGORY_MAX_LENGTH)).length(MAX_CATEGORIES),
  expanded: z.boolean(),
  learningLevel: z.enum(LEARNING_LEVELS).default(DEFAULT_LEARNING_LEVEL),
  studyContext: z.string().max(STUDY_CONTEXT_MAX_LENGTH).default(''),
})
const emptyDraft: z.infer<typeof draftSchema> = {
  topic: '',
  categoryCount: MIN_CATEGORIES,
  categories: Array<string>(MAX_CATEGORIES).fill(''),
  expanded: false,
  learningLevel: DEFAULT_LEARNING_LEVEL,
  studyContext: '',
}

export function QuizForm({ signInRef }: { signInRef: Ref<() => void> }) {
  const navigate = useNavigate()
  const [draft, setDraft] = useState(emptyDraft)
  const [issues, setIssues] = useState<ZodIssue[]>([])
  const [failure, setFailure] = useState<{ message: string; signIn?: boolean }>()
  const [retrySave, setRetrySave] = useState<StudySaveTicket>()
  const [busy, setBusy] = useState(false)
  const [showSignIn, setShowSignIn] = useState(false)
  const inFlight = useRef<AbortController | null>(null)

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(DRAFT_KEY)
      sessionStorage.removeItem(DRAFT_KEY)
      if (saved) {
        const restored = draftSchema.safeParse(JSON.parse(saved))
        if (restored.success) setDraft(restored.data)
      }
    } catch {
      // The form still works if browser storage is unavailable.
    }
    return () => inFlight.current?.abort()
  }, [])

  function updateDraft(changes: Partial<typeof emptyDraft>) {
    setDraft((current) => ({ ...current, ...changes }))
    setIssues([])
  }

  function openSignIn() {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } catch {
      // Keep the in-memory draft when storage is unavailable.
    }
    setShowSignIn(true)
  }

  useImperativeHandle(signInRef, () => openSignIn)

  function closeSignIn() {
    setShowSignIn(false)
    try {
      sessionStorage.removeItem(DRAFT_KEY)
    } catch {
      // The overlay is already closed.
    }
  }

  async function retryGeneratedSave(ticket: StudySaveTicket) {
    const controller = new AbortController()
    inFlight.current = controller
    setBusy(true)
    setFailure(undefined)
    try {
      const { game } = await studyRequest<{ game: SavedGame }>('/games/retry-save', {
        body: ticket, signal: controller.signal,
      })
      if (!controller.signal.aborted) navigate(`/play?game=${game.id}`)
    } catch (error) {
      if (!controller.signal.aborted) {
        setFailure({ message: error instanceof Error ? error.message : 'Could not save this board. Please try again.' })
      }
    } finally {
      inFlight.current = null
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return
    if (retrySave) {
      await retryGeneratedSave(retrySave)
      return
    }

    setFailure(undefined)
    const slots = draft.categories.slice(0, draft.categoryCount)
    const request = quizRequestSchema.safeParse({
      topic: draft.topic,
      categoryCount: draft.categoryCount,
      learningLevel: draft.learningLevel,
      studyContext: draft.studyContext,
      customCategories: slots.some((name) => name.trim()) ? slots : undefined,
    })
    setIssues(request.success ? [] : request.error.issues)
    if (!request.success) {
      if (request.error.issues.some(({ path }) => path[0] === 'customCategories' || path[0] === 'studyContext')) {
        setDraft((current) => ({ ...current, expanded: true }))
      }
      return
    }

    const controller = new AbortController()
    const timeout = AbortSignal.timeout(55_000)
    inFlight.current = controller
    setBusy(true)
    try {
      const { getAuthToken, clearAuthToken } = await import('deepspace')
      const token = await getAuthToken()
      if (controller.signal.aborted) return
      if (!token) {
        setFailure({ message: 'A DeepSpace session is required. Sign in, then try again.', signIn: true })
        return
      }
      const response = await fetch(QUIZ_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(request.data),
        signal: AbortSignal.any([controller.signal, timeout]),
      })
      const data = await response.json().catch(() => null) as QuizResponse | null
      if (controller.signal.aborted) return
      if (response.status === 401) {
        clearAuthToken()
        setFailure({ message: 'Your session expired. Sign in or try again.', signIn: true })
        return
      }
      if (data && typeof data === 'object' && 'retrySave' in data) setRetrySave(data.retrySave)
      if (!response.ok || !data || typeof data !== 'object' || !('game' in data) || !data.game) {
        setFailure({ message: data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
          ? data.error : 'The server did not return a game. Please try again.' })
        return
      }
      navigate(`/play?game=${data.game.id}`)
    } catch {
      if (controller.signal.aborted) return
      setFailure({ message: timeout.aborted
        ? 'Generation took too long. Please try again.'
        : 'Could not reach the game service. Check your connection and try again.' })
    } finally {
      inFlight.current = null
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  const topicIssue = issues.find((issue) => issue.path[0] === 'topic')
  const categoryIssue = issues.find((issue) => issue.path[0] === 'categoryCount')
  const levelIssue = issues.find((issue) => issue.path[0] === 'learningLevel')
  const contextIssue = issues.find((issue) => issue.path[0] === 'studyContext')
  const formIssue = issues.find((issue) => !issue.path.length
    || (issue.path[0] === 'customCategories' && issue.path.length === 1))

  return (
    <>
      <form className="study-form" onSubmit={submit} noValidate>
        <fieldset className="study-form-fields" disabled={busy || Boolean(retrySave)} aria-busy={busy}>
          <div>
            <label htmlFor="study-topic">Study topic</label>
            <input id="study-topic" name="topic" placeholder="e.g. The solar system" required
              maxLength={TOPIC_MAX_LENGTH} value={draft.topic}
              aria-invalid={Boolean(topicIssue)} aria-describedby={topicIssue ? 'study-topic-error' : undefined}
              onChange={(event) => updateDraft({ topic: event.target.value })} />
            {topicIssue && <p id="study-topic-error" className="study-error" role="alert">{topicIssue.message}</p>}
          </div>

          <div className="study-form-settings">
            <div>
              <label htmlFor="study-learning-level">Learning level</label>
              <div className="study-select">
                <select id="study-learning-level" name="learningLevel" value={draft.learningLevel}
                  aria-invalid={Boolean(levelIssue)} aria-describedby={levelIssue ? 'study-level-error' : undefined}
                  onChange={(event) => updateDraft({ learningLevel: LEARNING_LEVELS[event.target.selectedIndex] })}>
                  {LEARNING_LEVELS.map((level) => <option key={level} value={level}>{LEARNING_LEVEL_LABELS[level]}</option>)}
                </select>
                <ChevronDown size={16} aria-hidden="true" />
              </div>
              {levelIssue && <p id="study-level-error" className="study-error" role="alert">{levelIssue.message}</p>}
            </div>

            <fieldset className="study-category-picker" aria-describedby="study-question-count">
              <legend>Number of categories</legend>
              <div className="study-count-options">
                {CATEGORY_COUNTS.map((count) => (
                  <label className="study-count-option" key={count}>
                    <input className="sr-only" type="radio" name="categoryCount" value={count}
                      checked={draft.categoryCount === count}
                      aria-invalid={Boolean(categoryIssue)}
                      aria-describedby={categoryIssue ? 'study-count-error' : undefined}
                      onChange={() => updateDraft({ categoryCount: count })} />
                    <span>{count}</span>
                  </label>
                ))}
              </div>
              <p id="study-question-count" className="study-hint" aria-live="polite">
                {draft.categoryCount * POINT_VALUES.length} questions
              </p>
              {categoryIssue && <p id="study-count-error" className="study-error" role="alert">{categoryIssue.message}</p>}
            </fieldset>
          </div>

          <div className="study-advanced">
            <button type="button" className="study-advanced-toggle" aria-expanded={draft.expanded} aria-controls="study-advanced-fields"
              onClick={() => updateDraft({ expanded: !draft.expanded })}>
              <span>Advanced options <span className="study-hint">(optional)</span></span>
              <ChevronDown size={18} aria-hidden="true" />
            </button>
            <div id="study-advanced-fields" hidden={!draft.expanded}>
              <div className="study-advanced-content">
                <fieldset className="study-custom-categories" aria-describedby="study-category-help">
                  <legend>Custom categories</legend>
                  <p id="study-category-help" className="study-hint">
                    Only the first {draft.categoryCount} slots are used. Leave any slot blank for AI to choose.
                  </p>
                  <div className="study-category-fields">
                    {draft.categories.slice(0, draft.categoryCount).map((name, index) => {
                      const id = `study-custom-category-${index}`
                      const issue = issues.find((item) => item.path[0] === 'customCategories' && item.path[1] === index)
                      return (
                        <div key={id}>
                          <label htmlFor={id}>Category {index + 1} <span className="study-hint">(optional)</span></label>
                          <input id={id} value={name} maxLength={CATEGORY_MAX_LENGTH} placeholder="e.g. Planetary orbits"
                            aria-invalid={Boolean(issue)} aria-describedby={issue ? `${id}-error` : undefined}
                            onChange={(event) => {
                              const categories = draft.categories.slice()
                              categories[index] = event.target.value
                              updateDraft({ categories })
                            }} />
                          {issue && <p id={`${id}-error`} className="study-error" role="alert">{issue.message}</p>}
                        </div>
                      )
                    })}
                  </div>
                </fieldset>
                <div>
                  <label htmlFor="study-context">Additional study context <span className="study-hint">(optional)</span></label>
                  <textarea id="study-context" name="studyContext" rows={3} value={draft.studyContext}
                    maxLength={STUDY_CONTEXT_MAX_LENGTH}
                    placeholder="I'm preparing for an introductory biology final. Focus on cellular respiration and genetics."
                    aria-invalid={Boolean(contextIssue)}
                    aria-describedby={contextIssue ? 'study-context-count study-context-error' : 'study-context-count'}
                    onChange={(event) => updateDraft({ studyContext: event.target.value })} />
                  <p id="study-context-count" className="study-hint">{draft.studyContext.length} / {STUDY_CONTEXT_MAX_LENGTH} characters</p>
                  {contextIssue && <p id="study-context-error" className="study-error" role="alert">{contextIssue.message}</p>}
                </div>
              </div>
            </div>
          </div>
          {formIssue && <p className="study-error" role="alert">{formIssue.message}</p>}
        </fieldset>
        <p className="study-status" role="status">{busy ? (retrySave ? 'Saving your generated board…' : 'Writing questions, answers, and explanations for your board.') : ''}</p>
        {failure && <p className="study-error" role="alert">{failure.message}</p>}
        {failure?.signIn && (
          <button className="study-button study-secondary study-sign-in" type="button" onClick={openSignIn}>Sign in to DeepSpace</button>
        )}
        {retrySave && (
          <button type="button" className="study-button study-secondary study-sign-in" disabled={busy}
            onClick={() => { setRetrySave(undefined); setFailure(undefined) }}>Create a different game</button>
        )}
        <button className="study-button study-primary study-generate" type="submit" disabled={busy} aria-describedby="study-ai-note">
          {busy ? (retrySave ? 'Saving…' : 'Generating…') : retrySave ? 'Retry Saving Game' : failure ? 'Retry Generation' : 'Generate Game'}
        </button>
      </form>
      {showSignIn && (
        <Suspense fallback={<p className="study-hint" role="status">Loading sign-in…</p>}>
          <AuthOverlay title="Sign in to generate a game" description="Use your DeepSpace account to generate a custom study board." onClose={closeSignIn} />
        </Suspense>
      )}
    </>
  )
}
