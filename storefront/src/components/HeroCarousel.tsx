'use client'
import { useEffect, useRef, useState } from 'react'

const ADVANCE_MS = 5000

// Full-bleed crossfading background layer for the hero section — sits behind the text
// (absolute inset-0, z-0) rather than in its own bezeled column. Pauses on hover/focus and
// skips the timer under prefers-reduced-motion; dots still work either way.
export default function HeroCarousel({ images }: { images: string[] }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const reducedMotion = useRef(false)

  useEffect(() => {
    reducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  useEffect(() => {
    if (images.length <= 1 || paused || reducedMotion.current) return
    const id = setInterval(() => setIndex((i) => (i + 1) % images.length), ADVANCE_MS)
    return () => clearInterval(id)
  }, [images.length, paused])

  if (images.length === 0) return null

  return (
    <div
      className="theme-hero-bg absolute inset-0 z-0 overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {images.map((url, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={url}
          src={url}
          alt=""
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000"
          style={{ opacity: i === index ? 1 : 0 }}
        />
      ))}
      <div className="theme-hero-bg-scrim absolute inset-0" aria-hidden="true" />
      {images.length > 1 && (
        <div className="theme-hero-carousel-dots absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-2 z-10" role="tablist" aria-label="Hero images">
          {images.map((_, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={i === index}
              aria-label={`Show image ${i + 1} of ${images.length}`}
              onClick={() => setIndex(i)}
              className="theme-hero-carousel-dot w-2 h-2 rounded-full transition-colors"
              style={{ background: i === index ? 'var(--primary)' : 'rgba(255,255,255,0.5)' }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
