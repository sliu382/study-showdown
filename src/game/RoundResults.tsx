import type { Question } from './game'
import { rankPlayers, type summarizePlayers } from './round'

type PlayerSummaries = ReturnType<typeof summarizePlayers>

export function MissedQuestions({ questions, emptyMessage }: { questions: readonly Question[]; emptyMessage: string }) {
  if (!questions.length) return <p>{emptyMessage}</p>
  return (
    <ul>
      {questions.map((question) => (
        <li key={question.id}>
          <h3>{question.prompt}</h3>
          <p>{question.answer}</p>
          {question.explanation && <p>{question.explanation}</p>}
        </li>
      ))}
    </ul>
  )
}

export function LocalScoreboard({ players, current, stealing }: {
  players: PlayerSummaries; current: number; stealing: boolean
}) {
  return (
    <section className="study-scoreboard" aria-label="Scoreboard">
      <p className="study-turn" role="status">{stealing ? `${players[current].name} — Your chance to steal!` : `Current turn: ${players[current].name}`}</p>
      <ul>
        {players.map(({ name, score, seat }) => (
          <li key={seat} aria-current={seat === current ? 'true' : undefined}>
            <span>{name}</span><strong>{score} pts</strong>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function LocalResults({ players }: { players: PlayerSummaries }) {
  const rankings = rankPlayers(players)
  const winners = rankings.filter(({ rank }) => rank === 1)
  return (
    <>
      <section className="study-panel study-review" aria-labelledby="local-rankings">
        <h2 id="local-rankings">Final rankings</h2>
        <p className="study-winner">
          {winners.length > 1 ? 'Tie for first' : 'Winner'}: {winners.map(({ name }) => name).join(', ')}
        </p>
        <ol className="study-rankings">
          {rankings.map((player) => (
            <li key={player.seat}>
              <h3>#{player.rank} {player.name}</h3>
              <p>{player.score} pts · {player.accuracy}% accuracy · {player.correct} correct · {player.incorrect} incorrect</p>
            </li>
          ))}
        </ol>
      </section>
      <section className="study-panel study-review" aria-labelledby="local-review">
        <h2 id="local-review">Missed questions</h2>
        {rankings.map((player) => (
          <details key={player.seat} className="study-player-review">
            <summary>{player.name} · {player.incorrect} missed</summary>
            <MissedQuestions questions={player.missed} emptyMessage={player.answered ? 'No missed questions.' : 'No questions answered.'} />
          </details>
        ))}
      </section>
      <p className="study-hint study-attempt-save">Multiplayer scores aren’t saved to study history.</p>
    </>
  )
}
