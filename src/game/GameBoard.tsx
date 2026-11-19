import type { CSSProperties } from 'react'
import { Check, X } from 'lucide-react'
import type { Game, PlayerProgress, Question } from './game'

export function GameBoard({ game, progress, onSelect }: {
  game: Game
  progress: PlayerProgress
  onSelect?: (question: Question, category: string) => void
}) {
  return (
    <div className="study-board" style={{ '--study-columns': game.categories.length } as CSSProperties}>
      {game.categories.map((category) => (
        <section key={category.id} className="study-column">
          <h3>{category.title}</h3>
          {category.questions.map((question) => {
            const assessment = progress.assessments[question.id]
            return onSelect ? (
              <button
                key={question.id}
                type="button"
                className="study-tile"
                disabled={Boolean(assessment)}
                aria-label={`${category.title}, ${question.points} points${assessment ? `, ${assessment}` : ''}`}
                onClick={() => onSelect(question, category.title)}
              >
                {assessment === 'correct' && <Check size={18} aria-hidden="true" />}
                {assessment === 'incorrect' && <X size={18} aria-hidden="true" />}
                {question.points}
              </button>
            ) : (
              <div key={question.id} className="study-tile">{question.points}</div>
            )
          })}
        </section>
      ))}
    </div>
  )
}
