import NewsletterForm from './NewsletterForm'

export default function NewsletterSection({ variant = 'banner' }: { variant?: string }) {
  if (variant === 'compact') {
    return (
      <section data-theme-section="home-newsletter" data-variant="compact" className="theme-home-newsletter">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-600 font-medium">Subscribe for updates</p>
            <NewsletterForm />
          </div>
        </div>
      </section>
    )
  }

  return (
    <section data-theme-section="home-newsletter" data-variant="banner" className="theme-home-newsletter bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl font-bold mb-2">Stay in the loop</h2>
          <p className="text-gray-400 mb-6">Get new arrivals and deals delivered to your inbox.</p>
          <div className="flex justify-center">
            <NewsletterForm />
          </div>
        </div>
      </div>
    </section>
  )
}
