import { Link } from 'react-router-dom'
import { LEARNING_LEVEL_LABELS } from '../game/game'
import type { StudyHistoryEntry } from '../game/history'
import { StudyAccess, StudyScreen } from '../game/StudyAccess'
import { useStudyRecord } from '../game/useStudyRecord'

const completionDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export default function History() {
  return <StudyAccess title="My Study History">{(userId) => <HistoryList key={userId} />}</StudyAccess>
}

function HistoryList() {
  const { data, error, retry } = useStudyRecord<{ entries: StudyHistoryEntry[] }>('/history')
  return (
    <StudyScreen title="My Study History">
      {error ? (
        <div className="study-panel study-private-prompt">
          <p role="alert">{error}</p>
          <button type="button" className="study-button study-secondary" onClick={retry}>Retry</button>
        </div>
      ) : !data ? <p role="status">Loading saved games…</p>
        : data.entries.length === 0 ? (
          <div className="study-panel study-private-prompt">
            <p>Your generated games will appear here, along with each completed attempt.</p>
            <Link to="/" className="study-button study-primary">Create a Game</Link>
          </div>
        ) : (
          <ul className="study-history-list">
            {data.entries.map(({ game, attempts }) => (
              <li className="study-panel study-history-card" key={game.id}>
                <div className="study-history-heading">
                  <div>
                    <h2>{game.topic}</h2>
                    <p className="study-hint">{game.learningLevel ? LEARNING_LEVEL_LABELS[game.learningLevel] : 'General knowledge'} · {game.categoryCount} categories · {game.questionCount} questions</p>
                  </div>
                  <Link className="study-button study-secondary" to={`/play?game=${game.id}`}>Replay Game</Link>
                </div>
                {attempts.length ? (
                  <details className="study-history-attempts" open>
                    <summary>Attempts ({attempts.length})</summary>
                    <ul>
                      {attempts.map((attempt) => (
                        <li key={attempt.id}>
                          <time dateTime={attempt.completedAt}>{completionDate.format(new Date(attempt.completedAt))}</time>
                          <span>{attempt.score} / {attempt.possibleScore} pts</span>
                          <span>{Math.round(attempt.correctCount / attempt.total * 100)}% accuracy</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : <p className="study-hint">No completed attempts yet.</p>}
              </li>
            ))}
          </ul>
        )}
    </StudyScreen>
  )
}
