'use client'

export default function Error({ reset }: { reset: () => void }) {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', textAlign: 'center' }}>
      <div>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, margin: 0, color: '#111' }}>Something went wrong</h1>
        <p style={{ color: '#666', marginTop: '0.5rem', marginBottom: '1.5rem' }}>An unexpected error occurred.</p>
        <button onClick={reset} style={{ background: '#111', color: '#fff', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 600 }}>
          Try again
        </button>
      </div>
    </div>
  )
}
