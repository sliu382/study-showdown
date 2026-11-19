import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../components/ui/Dialog'
import { GameBoard } from '../game/GameBoard'
import { LEARNING_LEVEL_LABELS, summarizeGame } from '../game/game'
import type { Assessment, Game, Question } from '../game/game'
import { sampleGame } from '../game/sample'
import { StudyHeader } from '../game/StudyHeader'
import { StudyAccess, StudyScreen } from '../game/StudyAccess'
import { useStudyRecord } from '../game/useStudyRecord'
import type { SavedGame } from '../game/history'
import { AttemptSave } from '../game/AttemptSave'
import { RoundSetup } from '../game/RoundSetup'
import { LocalResults, LocalScoreboard, MissedQuestions } from '../game/RoundResults'
import { LocalClueDialog } from '../game/LocalClueDialog'
import {
  assessRound, closeLocalClue, selectLocalClue, startRound, submitLocalAttempt, summarizePlayers, type RoundConfig,
} from '../game/round'

export default function Play() {
  const location = useLocation()
  const gameId = new URLSearchParams(location.search).get('game')
  if (!gameId) return <GameSession key={location.key} game={sampleGame} />
  return (
    <StudyAccess title="Saved game">
      {(userId) => <SavedRound key={`${userId}:${location.key}`} gameId={gameId} />}
    </StudyAccess>
  )
}

function SavedRound({ gameId }: { gameId: string }) {
  const { data, error, retry } = useStudyRecord<{ game: SavedGame }>(`/games/${encodeURIComponent(gameId)}`)
  if (data) return <GameSession game={data.game} />
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

function GameSession({ game }: { game: Game }) {
  const [config, setConfig] = useState<RoundConfig | null>(null)
  return config ? <Round game={game} config={config} /> : <RoundSetup game={game} onStart={setConfig} />
}

function Round({ game, config }: { game: Game; config: RoundConfig }) {
  const [attemptKey, setAttemptKey] = useState(() => crypto.randomUUID())
  const [round, setRound] = useState(() => startRound(config))
  const [active, setActive] = useState<{ question: Question; category: string } | null>(null)
  const [revealed, setRevealed] = useState(false)
  const assessmentButton = useRef<HTMLButtonElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const stats = summarizeGame(game, round.progress)
  const players = round.mode === 'local' ? summarizePlayers(game, round.players) : []
  const localClue = round.mode === 'local' ? round.clue : null
  const finished = stats.answered === stats.total && !localClue

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
    setRound((current) => assessRound(current, question, assessment))
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
              {round.mode === 'local' && ' · Local Multiplayer'}
              {game.learningLevel && ` · ${LEARNING_LEVEL_LABELS[game.learningLevel]}`}
            </p>
            <h1 ref={heading} tabIndex={-1}>{finished ? 'Round complete' : game.topic}</h1>
          </div>
          <div className="study-statistics" aria-live="polite">
            {round.mode === 'solo' && (
              <div><span>{finished ? 'Final score' : 'Score'}</span><strong>{stats.score}{finished && <small> / {stats.possibleScore}</small>}</strong></div>
            )}
            {(!finished || round.mode === 'solo') && (
              <div>
                <span>{finished ? 'Accuracy' : 'Answered'}</span>
                <strong>{finished ? `${stats.accuracy}%` : `${stats.answered} / ${stats.total}`}</strong>
              </div>
            )}
          </div>
        </div>
        {finished ? (
          <>
            {round.mode === 'local' ? <LocalResults players={players} /> : (
              <>
                <section className="study-panel study-review" aria-labelledby="review-title">
                  <h2 id="review-title">Missed questions</h2>
                  <MissedQuestions questions={stats.missed} emptyMessage="You got every question right." />
                </section>
                {game.id
                  ? <AttemptSave key={attemptKey} gameId={game.id} attemptKey={attemptKey} progress={round.progress} />
                  : <p className="study-hint study-attempt-save">Sample results are not saved.</p>}
              </>
            )}
            <div className="study-actions">
              <button type="button" className="study-button study-primary" onClick={() => {
                setRound(startRound(config))
                setAttemptKey(crypto.randomUUID())
              }}>{round.mode === 'solo' ? 'Restart Game' : 'Play Again'}</button>
              {game.id && <Link className="study-button study-secondary" to="/history">My Study History</Link>}
              <Link className="study-button study-secondary" to="/">Return Home</Link>
            </div>
          </>
        ) : (
          <>
            {round.mode === 'local' && (
              <LocalScoreboard players={players} stealing={localClue?.phase === 'stealing'}
                current={localClue?.phase === 'stealing' ? localClue.answeringPlayer : round.activePlayer} />
            )}
            <section className="study-panel study-game" aria-label="Question board">
              <p className="study-instructions">{round.mode === 'solo'
                ? 'Choose a tile. Think of your answer, then reveal and grade it.'
                : 'Choose a tile on your turn. An incorrect answer or pass gives the others a chance to steal.'}</p>
              <GameBoard game={game} progress={round.progress} onSelect={(question, category) => {
                if (round.mode === 'solo') setActive({ question, category })
                else setRound((current) => current.mode === 'local' ? selectLocalClue(current, question, category) : current)
              }} />
            </section>
          </>
        )}
      </main>
      {round.mode === 'local' && (
        <LocalClueDialog clue={round.clue} players={round.players} heading={heading}
          onAttempt={(clue, outcome) => setRound((current) => current.mode === 'local' ? submitLocalAttempt(current, clue, outcome) : current)}
          onClose={(clue) => setRound((current) => current.mode === 'local' ? closeLocalClue(current, clue) : current)} />
      )}
      {round.mode === 'solo' && <Dialog open={active !== null} onOpenChange={(open) => { if (!open) closeQuestion() }}>
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
      </Dialog>}
    </div>
  )
}
