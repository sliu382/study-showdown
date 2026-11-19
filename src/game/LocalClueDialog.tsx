import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/Dialog'
import { gradeAnswer } from './answer-grading'
import type { LocalClue, LocalOutcome } from './round'

export function LocalClueDialog({ clue, players, heading, onAttempt, onClose }: {
  clue: LocalClue | null
  players: readonly { name: string }[]
  heading: RefObject<HTMLHeadingElement | null>
  onAttempt: (clue: LocalClue, outcome: LocalOutcome) => void
  onClose: (clue: LocalClue) => void
}) {
  const status = useRef<HTMLParagraphElement>(null)
  const resolved = clue?.phase === 'resolved'

  useEffect(() => {
    if (resolved) status.current?.focus()
  }, [resolved])

  const announcement = clue && (resolved ? (
    clue.winner === null ? 'No one earned points.'
      : clue.winner === clue.originalPlayer ? `${players[clue.winner].name} earned ${clue.question.points} points!`
        : `${players[clue.winner].name} stole the clue for ${clue.question.points} points!`
  ) : clue.phase === 'stealing' ? `${players[clue.answeringPlayer].name} — Your chance to steal!`
    : `Current turn: ${players[clue.answeringPlayer].name}`)

  return (
    <Dialog open={clue !== null} onOpenChange={(open) => {
      if (!open && clue && clue.phase !== 'stealing') onClose(clue)
    }}>
      <DialogContent className="study-question" finalFocus={heading} hideClose={clue?.phase === 'stealing'}>
        {clue && (
          <>
            <DialogDescription>{clue.category} · {clue.question.points} points</DialogDescription>
            <DialogTitle>{clue.question.prompt}</DialogTitle>
            <p className="study-turn" tabIndex={-1} ref={status} role="status">{announcement}</p>
            {resolved ? (
              <>
                <div className="study-answer">
                  <strong>Answer</strong>
                  <p>{clue.question.answer}</p>
                  {clue.question.explanation && <p>{clue.question.explanation}</p>}
                </div>
                <button type="button" className="study-button study-primary" onClick={() => onClose(clue)}>Continue</button>
              </>
            ) : <TypedAnswerForm key={clue.answeringPlayer} clue={clue} onAttempt={onAttempt} />}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function TypedAnswerForm({ clue, onAttempt }: {
  clue: LocalClue
  onAttempt: (clue: LocalClue, outcome: LocalOutcome) => void
}) {
  const [answer, setAnswer] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const incorrect = clue.phase === 'stealing' && clue.previousOutcome === 'incorrect'

  useEffect(() => {
    input.current?.focus()
  }, [])

  return (
    <form className="study-form study-typed-answer" onSubmit={(event) => {
      event.preventDefault()
      if (!answer.trim()) return
      onAttempt(clue, gradeAnswer(clue.question, answer) ? 'correct' : 'incorrect')
    }}>
      {incorrect && <p id="study-last-grade" className="study-error">Incorrect answer. The clue is still open.</p>}
      <div>
        <label htmlFor="study-typed-answer">Your answer</label>
        <input ref={input} id="study-typed-answer" value={answer} onChange={(event) => setAnswer(event.target.value)}
          autoComplete="off" spellCheck={false} maxLength={240}
          aria-describedby={incorrect ? 'study-last-grade' : undefined} />
      </div>
      <div className="study-actions">
        <button type="submit" className="study-button study-primary" disabled={!answer.trim()}>Submit Answer</button>
        <button type="button" className="study-button study-secondary" onClick={() => onAttempt(clue, 'pass')}>Pass</button>
      </div>
    </form>
  )
}
