interface ContentPageProps {
  title: string
  content?: string | null
  children?: React.ReactNode
}

export default function ContentPage({ title, content, children }: ContentPageProps) {
  return (
    <div data-theme-section="content-page" className="theme-content-page max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="theme-content-title text-3xl font-bold text-gray-900 mb-8">{title}</h1>
      {content ? (
        <div
          className="theme-content-body prose prose-gray max-w-none prose-headings:font-bold prose-a:text-primary"
          dangerouslySetInnerHTML={{ __html: content.replace(/\n/g, '<br />') }}
        />
      ) : children ? (
        <div className="theme-content-body">{children}</div>
      ) : (
        <p className="text-gray-400">This page has no content yet.</p>
      )}
    </div>
  )
}
