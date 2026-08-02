export default function VideoSection({ heading, text, videoUrl }: {
  heading?: string
  text?: string
  videoUrl?: string
}) {
  if (!videoUrl) return null

  const isYouTube = videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')
  const isVimeo = videoUrl.includes('vimeo.com')

  let embedUrl = videoUrl
  if (isYouTube) {
    const id = videoUrl.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]+)/)?.[1]
    if (id) embedUrl = `https://www.youtube-nocookie.com/embed/${id}`
  } else if (isVimeo) {
    const id = videoUrl.match(/vimeo\.com\/(\d+)/)?.[1]
    if (id) embedUrl = `https://player.vimeo.com/video/${id}`
  }

  return (
    <section data-theme-section="home-video" className="theme-home-video max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      {heading && <h2 className="text-2xl font-bold mb-2 text-center">{heading}</h2>}
      {text && <p className="text-gray-600 text-center mb-8">{text}</p>}
      <div className="aspect-video rounded-card overflow-hidden bg-gray-100">
        {isYouTube || isVimeo ? (
          <iframe
            src={embedUrl}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title={heading ?? 'Video'}
          />
        ) : (
          <video src={videoUrl} controls className="w-full h-full object-cover">
            <track kind="captions" />
          </video>
        )}
      </div>
    </section>
  )
}
