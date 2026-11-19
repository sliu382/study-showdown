import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlayerProgress } from './game'
import { studyRequest } from './study-client'

export function AttemptSave({ gameId, attemptKey, progress }: {
  gameId: string
  attemptKey: string
  progress: PlayerProgress
}) {
  const inFlight = useRef(false)
  const [state, setState] = useState<{ status: 'saving' | 'saved' | 'error'; error?: string }>({ status: 'saving' })

  const save = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setState({ status: 'saving' })
    try {
      await studyRequest(`/games/${gameId}/attempts`, { body: { attemptKey, assessments: progress.assessments } })
      setState({ status: 'saved' })
    } catch (error) {
      setState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Could not save your attempt. Please retry.',
      })
    } finally {
      inFlight.current = false
    }
  }, [gameId, attemptKey, progress])

  useEffect(() => { void save() }, [save])

  return (
    <div className="study-attempt-save">
      {state.status === 'error' ? (
        <>
          <p className="study-error" role="alert">Attempt not saved. {state.error}</p>
          <button type="button" className="study-button study-secondary" onClick={() => void save()}>Retry Save</button>
        </>
      ) : <p className="study-hint" role="status">{state.status === 'saving' ? 'Saving attempt…' : 'Attempt saved to your study history.'}</p>}
    </div>
  )
}
