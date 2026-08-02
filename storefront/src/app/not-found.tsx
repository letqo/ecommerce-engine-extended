import Link from 'next/link'

export default function NotFound() {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', margin: 0, background: '#fff' }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: '4rem', fontWeight: 700, margin: 0, color: '#111' }}>404</h1>
          <p style={{ color: '#666', marginTop: '0.5rem', marginBottom: '1.5rem' }}>Page not found</p>
          <Link href="/" style={{ color: '#111', textDecoration: 'underline' }}>Go home</Link>
        </div>
      </body>
    </html>
  )
}
