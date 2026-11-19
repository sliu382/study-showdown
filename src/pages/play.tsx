import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../components/ui/Dialog'
import { GameBoard } from '../game/GameBoard'
import { assessQuestion, LEARNING_LEVEL_LABELS, summarizeGame } from '../game/game'
import type { Assessment, Game, PlayerProgress, Question } from '../game/game'
import { sampleGame } from '../game/sample'
import { StudyHeader } from '../game/StudyHeader'
import { StudyAccess, StudyScreen } from '../game/StudyAccess'
import { useStudyRecord } from '../game/useStudyRecord'
import type { SavedGame } from '../game/history'
import { AttemptSave } from '../game/AttemptSave'

export default function Play() {
  const location = useLocation()
  const gameId = new URLSearchParams(location.search).get('game')
  if (!gameId) return <Round key={location.key} game={sampleGame} />
  return (
    <StudyAccess title="Saved game">
      {(userId) => <SavedRound key={`${userId}:${location.key}`} gameId={gameId} />}
    </StudyAccess>
  )
}

function SavedRound({ gameId }: { gameId: string }) {
  const { data, error, retry } = useStudyRecord<{ game: SavedGame }>(`/games/${encodeURIComponent(gameId)}`)
  if (data) return <Round game={data.game} />
  return (
    <StudyScreen title="Saved game">
      {error ? (
        <div className="study-panel study-private-prompt">
          <p role="alert">{error}</p>
          <div className="study-actions">
            <button type="button" className="study-button study-secondary" onClick={retry}>Retry</button>
            <Link to="/history" className="study-button study-secondary">My Study History</Link>
          </div>
        </div>
      ) : <p role="status">Loading saved game…</p>}
    </StudyScreen>
  )
}

function Round({ game }: { game: Game }) {
  const [attemptKey, setAttemptKey] = useState(() => crypto.randomUUID())
  const [progress, setProgress] = useState<PlayerProgress>({ assessments: {} })
  const [active, setActive] = useState<{ question: Question; category: string } | null>(null)
  const [revealed, setRevealed] = useState(false)
  const assessmentButton = useRef<HTMLButtonElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const stats = summarizeGame(game, progress)
  const finished = stats.answered === stats.total

  useEffect(() => {
    if (revealed) assessmentButton.current?.focus()
  }, [revealed])

  useEffect(() => {
    heading.current?.focus()
  }, [finished])

  function closeQuestion() {
    setActive(null)
    setRevealed(false)
  }

  function recordAnswer(assessment: Assessment) {
    if (!active || !revealed) return
    const { question } = active
    setProgress((current) => assessQuestion(current, question, assessment))
    closeQuestion()
  }

  return (
    <div className="study-shell">
      <title>{`${finished ? 'Results' : game.topic} | StudyShowdown`}</title>
      <StudyHeader />
      <main className="study-width study-play">
        <div className="study-round-header">
          <div>
            <p className="study-hint">
              {finished ? game.topic : game.id ? 'AI-generated game' : 'Sample game'}
              {game.learningLevel && ` · ${LEARNING_LEVEL_LABELS[game.learningLevel]}`}
            </p>
            <h1 ref={heading} tabIndex={-1}>{finished ? 'Round complete' : game.topic}</h1>
          </div>
          <div className="study-statistics" aria-live="polite">
            <div><span>{finished ? 'Final score' : 'Score'}</span><strong>{stats.score}{finished && <small> / {stats.possibleScore}</small>}</strong></div>
            <div>
              <span>{finished ? 'Accuracy' : 'Answered'}</span>
              <strong>{finished ? `${stats.accuracy}%` : `${stats.answered} / ${stats.total}`}</strong>
            </div>
          </div>
        </div>
        {finished ? (
          <>
            <section className="study-panel study-review" aria-labelledby="review-title">
              <h2 id="review-title">Missed questions</h2>
              {stats.missed.length === 0 ? <p>You got every question right.</p> : (
                <ul>
                  {stats.missed.map((question) => (
                    <li key={question.id}>
                      <h3>{question.prompt}</h3>
                      <p>{question.answer}</p>
                      {question.explanation && <p>{question.explanation}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {game.id
              ? <AttemptSave key={attemptKey} gameId={game.id} attemptKey={attemptKey} progress={progress} />
              : <p className="study-hint study-attempt-save">Sample results are not saved.</p>}
            <div className="study-actions">
              <button type="button" className="study-button study-primary" onClick={() => {
                setProgress({ assessments: {} })
                setAttemptKey(crypto.randomUUID())
              }}>Restart Game</button>
              {game.id && <Link className="study-button study-secondary" to="/history">My Study History</Link>}
              <Link className="study-button study-secondary" to="/">Return Home</Link>
            </div>
          </>
        ) : (
          <section className="study-panel study-game" aria-label="Question board">
            <p className="study-instructions">Choose a tile. Think of your answer, then reveal and grade it.</p>
            <GameBoard game={game} progress={progress} onSelect={(question, category) => setActive({ question, category })} />
          </section>
        )}
      </main>
      <Dialog open={active !== null} onOpenChange={(open) => { if (!open) closeQuestion() }}>
        <DialogContent className="study-question" finalFocus={heading}>
          {active && (
            <>
              <DialogDescription>{active.category} · {active.question.points} points</DialogDescription>
              <DialogTitle>{active.question.prompt}</DialogTitle>
              {revealed ? (
                <>
                  <div className="study-answer">
                    <strong>Answer</strong>
                    <p>{active.question.answer}</p>
                    {active.question.explanation && <p>{active.question.explanation}</p>}
                  </div>
                  <div className="study-actions">
                    <button ref={assessmentButton} type="button" className="study-button study-primary" onClick={() => recordAnswer('correct')}>Correct</button>
                    <button type="button" className="study-button study-secondary" onClick={() => recordAnswer('incorrect')}>Incorrect</button>
                  </div>
                </>
              ) : <button type="button" className="study-button study-primary" onClick={() => setRevealed(true)}>Reveal Answer</button>}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
