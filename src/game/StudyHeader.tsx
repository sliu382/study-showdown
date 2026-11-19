import { useState } from 'react'
import { AuthOverlay, signOut, useSession } from 'deepspace'
import { BookOpen } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

export function StudyHeader({ onSignIn }: { onSignIn?: () => void }) {
  const session = useSession()
  const navigate = useNavigate()
  const [showSignIn, setShowSignIn] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState('')
  const user = session.data?.user

  async function leaveAccount() {
    setError('')
    setSigningOut(true)
    try {
      const result = await signOut()
      if (result.error) throw result.error
      navigate('/', { replace: true })
    } catch {
      setError('Could not sign out. Please try again.')
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <header className="study-header">
      <nav className="study-width study-nav" aria-label="StudyShowdown navigation">
        <Link to="/" className="study-brand">
          <span className="study-brand-icon"><BookOpen size={21} aria-hidden="true" /></span>
          <span>Study<span className="study-gold">Showdown</span></span>
        </Link>
        <div className="study-nav-actions">
          {session.isPending ? <span className="study-hint" role="status">Checking session…</span>
            : session.error ? <button type="button" className="study-button study-secondary" onClick={() => void session.refetch()}>Retry sign-in check</button>
            : user ? (
              <>
                <Link to="/history" className="study-nav-link">My History</Link>
                <span className="study-account-name" title={user.name || user.email}>{user.name || user.email}</span>
                <button type="button" className="study-button study-secondary" disabled={signingOut}
                  onClick={() => void leaveAccount()}>{signingOut ? 'Signing out…' : 'Sign Out'}</button>
              </>
            ) : (
              <button type="button" className="study-button study-secondary"
                onClick={onSignIn ?? (() => setShowSignIn(true))}>Sign In</button>
            )}
        </div>
        {error && <p className="study-error study-nav-error" role="alert">{error}</p>}
      </nav>
      {showSignIn && <AuthOverlay title="Sign in to StudyShowdown" description="Access your saved games and study history." onClose={() => setShowSignIn(false)} />}
    </header>
  )
}
