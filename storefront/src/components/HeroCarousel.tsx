'use client'
import { useEffect, useRef, useState } from 'react'

const ADVANCE_MS = 5000

// Auto-advancing image carousel for the showcase hero's visual column. Pauses on hover/focus
// and skips the timer entirely under prefers-reduced-motion — dots still work either way.
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
      className="theme-hero-bezel-wrap w-full"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="theme-hero-bezel">
        <div className="theme-hero-screen relative">
          <span className="theme-hero-screen-tag">{String(index + 1).padStart(2, '0')} / {String(images.length).padStart(2, '0')}</span>
          {images.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={url}
              src={url}
              alt=""
              className="theme-hero-showcase-image absolute inset-0 w-full h-full object-contain transition-opacity duration-700"
              style={{ opacity: i === index ? 1 : 0 }}
            />
          ))}
        </div>
      </div>
      {images.length > 1 && (
        <div className="theme-hero-carousel-dots flex justify-center gap-2 mt-3" role="tablist" aria-label="Hero images">
          {images.map((_, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={i === index}
              aria-label={`Show image ${i + 1} of ${images.length}`}
              onClick={() => setIndex(i)}
              className="theme-hero-carousel-dot w-2 h-2 rounded-full transition-colors"
              style={{ background: i === index ? 'var(--primary)' : 'var(--line, rgba(0,0,0,0.2))' }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
