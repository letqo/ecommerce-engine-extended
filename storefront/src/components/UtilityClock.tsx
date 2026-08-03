'use client'
import { useEffect, useState } from 'react'

function format(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

// Small ticking clock for theme utility bars — purely decorative chrome,
// mirrors the always-on-display feel of an e-ink device readout.
export default function UtilityClock() {
  const [time, setTime] = useState<string | null>(null)

  useEffect(() => {
    setTime(format(new Date()))
    const id = setInterval(() => setTime(format(new Date())), 1000)
    return () => clearInterval(id)
  }, [])

  return <span className="theme-utility-clock tabular-nums">{time ?? '--:--:--'}</span>
}
