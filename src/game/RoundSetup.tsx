import { useEffect, useRef, useState } from 'react'
import type { Game } from './game'
import { defaultPlayerName, LOCAL_PLAYER_COUNTS, type LocalPlayerCount, type RoundConfig } from './round'
import { StudyScreen } from './StudyAccess'

export function RoundSetup({ game, onStart }: { game: Game; onStart: (config: RoundConfig) => void }) {
  const [mode, setMode] = useState<RoundConfig['mode']>('solo')
  const [playerCount, setPlayerCount] = useState<LocalPlayerCount>(2)
  const [names, setNames] = useState(['', '', '', ''])
  const soloOption = useRef<HTMLInputElement>(null)

  useEffect(() => {
    soloOption.current?.focus()
  }, [])

  return (
    <StudyScreen title="Set up your game">
      <form className="study-panel study-form study-round-setup" onSubmit={(event) => {
        event.preventDefault()
        onStart(mode === 'solo' ? { mode } : { mode, playerCount, names })
      }}>
        <h2>{game.topic}</h2>
        <fieldset className="study-mode-picker">
          <legend>Game mode</legend>
          <label>
            <input ref={soloOption} type="radio" name="mode" value="solo" checked={mode === 'solo'} onChange={() => setMode('solo')} />
            Solo Study
          </label>
          <label>
            <input type="radio" name="mode" value="local" checked={mode === 'local'} onChange={() => setMode('local')} />
            Local Multiplayer
          </label>
        </fieldset>
        {mode === 'local' && (
          <>
            <div>
              <label htmlFor="study-player-count">Number of players</label>
              <select id="study-player-count" value={playerCount} onChange={(event) => setPlayerCount(LOCAL_PLAYER_COUNTS[event.target.selectedIndex])}>
                {LOCAL_PLAYER_COUNTS.map((count) => <option key={count} value={count}>{count}</option>)}
              </select>
            </div>
            <fieldset className="study-setup-names">
              <legend>Player names (optional)</legend>
              {names.slice(0, playerCount).map((name, index) => {
                const label = defaultPlayerName(index)
                return (
                  <div key={label}>
                    <label htmlFor={`study-player-${index}`}>{label}</label>
                    <input id={`study-player-${index}`} value={name} placeholder={label} maxLength={30}
                      onChange={(event) => {
                        const value = event.target.value
                        setNames((current) => current.map((entry, seat) => seat === index ? value : entry))
                      }} />
                  </div>
                )
              })}
            </fieldset>
            <p className="study-hint">Choose a host who isn’t playing. Players answer aloud and look away while the host checks the answer. Passes don’t affect accuracy. Multiplayer scores aren’t saved to study history.</p>
          </>
        )}
        <button type="submit" className="study-button study-primary">Start Game</button>
      </form>
    </StudyScreen>
  )
}
