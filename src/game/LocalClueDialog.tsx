import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/Dialog'
import type { LocalClue, LocalOutcome } from './round'

export function LocalClueDialog({ clue, players, heading, onAttempt, onClose }: {
  clue: LocalClue | null
  players: readonly { name: string }[]
  heading: RefObject<HTMLHeadingElement | null>
  onAttempt: (clue: LocalClue, outcome: LocalOutcome) => void
  onClose: (clue: LocalClue) => void
}) {
  const [hostCheck, setHostCheck] = useState<LocalClue | null>(null)
  const status = useRef<HTMLParagraphElement>(null)
  const correctButton = useRef<HTMLButtonElement>(null)
  const checking = clue !== null && hostCheck === clue

  useEffect(() => {
    if (checking) correctButton.current?.focus()
    else if (clue) status.current?.focus()
  }, [checking, clue])

  function grade(clue: LocalClue, outcome: LocalOutcome) {
    setHostCheck((current) => current === clue ? null : current)
    onAttempt(clue, outcome)
  }

  const resolved = clue?.phase === 'resolved'
  const announcement = clue && (resolved ? (
    clue.winner === null ? 'No one earned points.'
      : clue.winner === clue.originalPlayer ? `${players[clue.winner].name} earned ${clue.question.points} points!`
        : `${players[clue.winner].name} stole the clue for ${clue.question.points} points!`
  ) : clue.phase === 'stealing' ? `${players[clue.answeringPlayer].name} — Your chance to steal!`
    : `Current turn: ${players[clue.answeringPlayer].name}`)

  return (
    <Dialog open={clue !== null} onOpenChange={(open) => {
      if (!open && clue && clue.phase !== 'stealing') {
        setHostCheck(null)
        onClose(clue)
      }
    }}>
      <DialogContent className="study-question" finalFocus={heading} hideClose={clue?.phase === 'stealing'}>
        {clue && (
          <>
            <DialogDescription>{clue.category} · {clue.question.points} points</DialogDescription>
            <DialogTitle>{clue.question.prompt}</DialogTitle>
            <p className="study-turn" tabIndex={-1} ref={status} role="status">{announcement}</p>
            {(resolved || checking) && (
              <div className="study-answer">
                <strong>{resolved ? 'Answer' : 'Host only · Players look away'}</strong>
                <p>{clue.question.answer}</p>
                {clue.question.explanation && <p>{clue.question.explanation}</p>}
              </div>
            )}
            {resolved ? (
              <button type="button" className="study-button study-primary" onClick={() => onClose(clue)}>Continue</button>
            ) : checking ? (
              <div className="study-actions">
                <button ref={correctButton} type="button" className="study-button study-primary" onClick={() => grade(clue, 'correct')}>Correct</button>
                <button type="button" className="study-button study-secondary" onClick={() => grade(clue, 'incorrect')}>Incorrect</button>
                <button type="button" className="study-button study-secondary" onClick={() => setHostCheck(null)}>Hide Answer</button>
              </div>
            ) : (
              <>
                <p className="study-hint">Answer aloud or pass. When grading, only the host should look at the screen.</p>
                <div className="study-actions">
                  <button type="button" className="study-button study-primary" onClick={() => setHostCheck(clue)}>Check Answer Privately</button>
                  <button type="button" className="study-button study-secondary" onClick={() => grade(clue, 'pass')}>Pass</button>
                </div>
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
