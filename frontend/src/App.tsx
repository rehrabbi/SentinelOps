import { useEffect, useState } from 'react'
import './App.css'

// A "discriminated union": the health state is EXACTLY one of these three
// shapes — never a contradictory mix like "loading AND error". The `kind`
// field tells us which one we have, and TypeScript forces us to handle each.
type HealthState =
  | { kind: 'loading' }
  | { kind: 'ok'; status: string }
  | { kind: 'error'; message: string }

function App() {
  // useState gives the component memory. It starts in the "loading" state.
  const [health, setHealth] = useState<HealthState>({ kind: 'loading' })

  // useEffect with an empty dependency array [] runs ONCE, right after the
  // component first renders — the correct place for a "fetch on load" effect.
  useEffect(() => {
    fetch('http://localhost:8080/healthz')
      .then((res) => {
        // fetch only rejects on network/CORS failures, NOT on HTTP errors
        // like 404/500 — so we check res.ok ourselves and throw if not.
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => setHealth({ kind: 'ok', status: data.status }))
      .catch((err) => setHealth({ kind: 'error', message: err.message }))
  }, [])

  return (
    <main className="app">
      <h1>SentinelOps</h1>
      <p className="subtitle">Incident &amp; ticket management</p>

      <section className="health-card">
        <h2>API health</h2>
        {health.kind === 'loading' && (
          <p className="status loading">Checking…</p>
        )}
        {health.kind === 'ok' && (
          <p className="status ok">● API status: {health.status}</p>
        )}
        {health.kind === 'error' && (
          <p className="status error">● Cannot reach API: {health.message}</p>
        )}
      </section>
    </main>
  )
}

export default App
