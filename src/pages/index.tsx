import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { GameBoard } from '../game/GameBoard'
import { QuizForm } from '../game/QuizForm'
import { sampleGame } from '../game/sample'
import { StudyHeader } from '../game/StudyHeader'
import { seo } from '../seo'

const sampleQuestionCount = sampleGame.categories.reduce((total, category) => total + category.questions.length, 0)

export default function Landing() {
  const openSignIn = useRef<() => void>(null)
  return (
    <div className="study-shell study-landing-shell" data-testid="static-landing">
      <Seo {...seo} path="/" />
      <StudyHeader onSignIn={() => openSignIn.current?.()} />
      <main className="study-width study-landing">
        <div className="study-intro">
          <h1>Turn any topic into a <span className="study-gold">study game.</span></h1>
          <p>Turn what you’re studying into a Jeopardy-style quiz and practice recalling the answers.</p>
        </div>

        <div className="study-landing-grid">
          <section className="study-panel study-config" aria-labelledby="config-title">
            <h2 id="config-title">Create your game.</h2>
            <QuizForm signInRef={openSignIn} />
          </section>

          <section className="study-panel study-preview" aria-labelledby="sample-title">
            <div className="study-preview-heading">
              <h2 id="sample-title">Try a sample</h2>
              <p>{sampleGame.topic} · {sampleQuestionCount} questions</p>
            </div>
            <GameBoard game={sampleGame} progress={{ assessments: {} }} />
            <Link className="study-button study-secondary study-sample-link" to="/play">
              Play Sample Game
            </Link>
          </section>
        </div>
        <p id="study-ai-note" className="study-hint study-ai-note">Uses your DeepSpace AI credits. Review AI-generated answers for accuracy.</p>
      </main>
    </div>
  )
}
