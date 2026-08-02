'use client'
import { useState } from 'react'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'
const STORE_ID = process.env.NEXT_PUBLIC_STORE_ID ?? ''

export default function NewsletterForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setStatus('loading')
    setError('')
    try {
      const res = await fetch(`${API_URL}/store/newsletter/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Store-Id': STORE_ID },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) throw new Error('Failed')
      setStatus('success')
    } catch {
      setStatus('error')
      setError('Something went wrong. Please try again.')
    }
  }

  if (status === 'success') {
    return (
      <p className="text-sm font-medium text-white">
        ✓ You're subscribed — welcome aboard!
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} data-theme-section="newsletter" className="theme-newsletter flex gap-2 max-w-sm">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Your email address"
        required
        className="theme-newsletter-input flex-1 px-3 py-2 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-white/40 min-w-0"
      />
      <button
        type="submit"
        disabled={status === 'loading'}
        className="theme-newsletter-button px-4 py-2 bg-white text-gray-900 rounded-lg text-sm font-semibold hover:bg-gray-100 transition-colors disabled:opacity-60 whitespace-nowrap"
      >
        {status === 'loading' ? '…' : 'Subscribe'}
      </button>
      {error && <p className="text-xs text-red-300 mt-1 absolute">{error}</p>}
    </form>
  )
}
