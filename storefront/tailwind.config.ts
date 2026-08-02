import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--primary)',
        'primary-hover': 'var(--primary-hover)',
        'primary-text': 'var(--primary-text)',
        accent: 'var(--accent)',
        'hero-text': 'var(--hero-text)',
        'hero-sub': 'var(--hero-sub)',
        'footer-bg': 'var(--footer-bg)',
        'footer-text': 'var(--footer-text)',
      },
      borderRadius: {
        btn: 'var(--radius-btn)',
        card: 'var(--radius-card)',
      },
    },
  },
  plugins: [],
}

export default config
