import { useAuthProfileReady } from 'deepspace'
import { Link } from 'react-router-dom'
import { APP_NAME } from '../../constants'

export default function HomePage() {
  const { isSignedIn, user } = useAuthProfileReady({ requireUser: true })

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3 bg-background px-6 text-center text-foreground">
      <h1 className="text-2xl font-semibold">{APP_NAME}</h1>
      <Link to="/" className="text-sm text-foreground underline">Create a study game</Link>
      {isSignedIn && user && (
        <p className="text-sm text-muted-foreground">Signed in as {user.name ?? user.email}</p>
      )}
    </div>
  )
}
