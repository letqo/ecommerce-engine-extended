import type { Metadata } from 'next'
import { Link } from '@/i18n/navigation'
import { getStoreInfo, buildAlternates, API_URL, STORE_ID } from '@/lib/seo'
import { Clock, Tag } from 'lucide-react'

interface Post {
  id: string
  title: string
  slug: string
  excerpt?: string | null
  coverImage?: string | null
  publishedAt?: string | null
  tags: string[]
  readingTime: number
}

async function getPosts(): Promise<Post[]> {
  try {
    const res = await fetch(`${API_URL}/store/blog?limit=50`, {
      headers: { 'X-Store-Id': STORE_ID },
      next: { revalidate: 60 },
    })
    if (!res.ok) return []
    const json = await res.json()
    return json.data ?? []
  } catch { return [] }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const store = await getStoreInfo()
  const alternates = buildAlternates('/blog', locale)
  return {
    title: 'Blog',
    description: `Tips, guides and insights from ${store?.name ?? 'our store'}.`,
    alternates,
    openGraph: { url: alternates.canonical, type: 'website' },
  }
}

export default async function BlogListPage() {
  const posts = await getPosts()

  return (
    <div data-theme-section="blog-list" className="theme-blog-list max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-gray-900">Blog</h1>
        <p className="text-gray-500 mt-2">Tips, guides and product insights</p>
      </div>

      {posts.length === 0 ? (
        <p className="text-gray-400 text-center py-24">No posts published yet.</p>
      ) : (
        <div className="space-y-8">
          {posts.map((post) => (
            <Link key={post.id} href={`/blog/${post.slug}`} className="group block">
              <article className="grid grid-cols-1 sm:grid-cols-[1fr_220px] gap-6 pb-8 border-b border-gray-100">
                <div className="flex flex-col justify-between">
                  <div>
                    {post.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {post.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">
                            <Tag size={10} /> {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <h2 className="text-xl font-bold text-gray-900 group-hover:text-primary transition-colors mb-2">
                      {post.title}
                    </h2>
                    {post.excerpt && (
                      <p className="text-gray-500 text-sm leading-relaxed line-clamp-2">{post.excerpt}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-4 text-xs text-gray-400">
                    {post.publishedAt && (
                      <time dateTime={post.publishedAt}>
                        {new Date(post.publishedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                      </time>
                    )}
                    <span className="flex items-center gap-1"><Clock size={11} /> {post.readingTime} min read</span>
                  </div>
                </div>

                {post.coverImage && (
                  <div className="order-first sm:order-last">
                    <img
                      src={post.coverImage}
                      alt={post.title}
                      className="w-full h-44 sm:h-36 object-cover rounded-xl group-hover:opacity-90 transition-opacity"
                    />
                  </div>
                )}
              </article>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
