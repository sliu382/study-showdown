import type { ReactNode } from 'react'
import { AuthOverlay, useSession } from 'deepspace'
import { useState } from 'react'
import { StudyHeader } from './StudyHeader'

export function StudyScreen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="study-shell">
      <title>{`${title} | StudyShowdown`}</title>
      <StudyHeader />
      <main className="study-width study-play">
        <div className="study-round-header"><h1>{title}</h1></div>
        {children}
      </main>
    </div>
  )
}

export function StudyAccess({ title, children }: { title: string; children: (userId: string) => ReactNode }) {
  const session = useSession()
  const [showSignIn, setShowSignIn] = useState(false)
  if (session.isPending) return <StudyScreen title={title}><p role="status">Checking your session…</p></StudyScreen>
  if (session.error) {
    return (
      <StudyScreen title={title}>
        <p role="alert">Could not check your session.</p>
        <button type="button" className="study-button study-secondary" onClick={() => void session.refetch()}>Retry</button>
      </StudyScreen>
    )
  }
  if (session.data?.user) return children(session.data.user.id)
  return (
    <StudyScreen title={title}>
      <div className="study-panel study-private-prompt">
        <p>Sign in to access your saved games and study history.</p>
        <button type="button" className="study-button study-primary" onClick={() => setShowSignIn(true)}>Sign in to continue</button>
      </div>
      {showSignIn && <AuthOverlay onClose={() => setShowSignIn(false)} title="Sign in to StudyShowdown" />}
    </StudyScreen>
  )
}
