'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

function useCountdown(targetDate: string) {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 })

  useEffect(() => {
    const target = new Date(targetDate).getTime()
    const update = () => {
      const diff = Math.max(0, target - Date.now())
      setTimeLeft({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      })
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [targetDate])

  return timeLeft
}

export default function CountdownSection({ heading, text, cta, targetDate }: {
  heading?: string
  text?: string
  cta?: { label: string; href: string }
  targetDate?: string
}) {
  const { days, hours, minutes, seconds } = useCountdown(targetDate ?? '')

  if (!targetDate) return null

  const blocks = [
    { value: days, label: 'Days' },
    { value: hours, label: 'Hours' },
    { value: minutes, label: 'Min' },
    { value: seconds, label: 'Sec' },
  ]

  return (
    <section data-theme-section="home-countdown" className="theme-home-countdown bg-gray-900 text-white py-16">
      <div className="max-w-4xl mx-auto px-4 text-center">
        {heading && <h2 className="text-2xl md:text-3xl font-bold mb-4">{heading}</h2>}
        {text && <p className="text-gray-400 mb-8">{text}</p>}
        <div className="flex justify-center gap-4 md:gap-6 mb-8">
          {blocks.map((b) => (
            <div key={b.label} className="bg-white/10 backdrop-blur rounded-xl px-4 py-3 min-w-[70px]">
              <span className="block text-3xl md:text-4xl font-bold tabular-nums">{String(b.value).padStart(2, '0')}</span>
              <span className="text-xs text-gray-400 uppercase tracking-wider">{b.label}</span>
            </div>
          ))}
        </div>
        {cta && (
          <Link href={cta.href} className="inline-block bg-primary text-primary-text px-8 py-3 rounded-btn font-semibold hover:bg-primary-hover transition-colors">
            {cta.label}
          </Link>
        )}
      </div>
    </section>
  )
}
