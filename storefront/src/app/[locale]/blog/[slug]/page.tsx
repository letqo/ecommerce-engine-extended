import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Link } from '@/i18n/navigation'
import { getStoreInfo, buildAlternates, API_URL, STORE_ID } from '@/lib/seo'
import { ArrowLeft, Clock, Tag } from 'lucide-react'

interface Post {
  id: string
  title: string
  slug: string
  content: string
  excerpt?: string | null
  coverImage?: string | null
  publishedAt?: string | null
  tags: string[]
  readingTime: number
  seoTitle?: string | null
  seoDescription?: string | null
}

async function getPost(slug: string): Promise<Post | null> {
  try {
    const res = await fetch(`${API_URL}/store/blog/${slug}`, {
      headers: { 'X-Store-Id': STORE_ID },
      next: { revalidate: 300 },
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.data ?? null
  } catch { return null }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>
}): Promise<Metadata> {
  const { slug, locale } = await params
  const [post, store] = await Promise.all([getPost(slug), getStoreInfo()])
  if (!post) return { title: 'Post Not Found' }

  const title = post.seoTitle || post.title
  const description = post.seoDescription || post.excerpt || `Read "${post.title}" on the ${store?.name ?? ''} blog.`
  const alternates = buildAlternates(`/blog/${slug}`, locale)

  return {
    title,
    description,
    alternates,
    openGraph: {
      title,
      description,
      url: alternates.canonical,
      type: 'article',
      publishedTime: post.publishedAt ?? undefined,
      images: post.coverImage ? [{ url: post.coverImage, width: 1200, height: 630, alt: post.title }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: post.coverImage ? [post.coverImage] : undefined,
    },
  }
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const [post, store] = await Promise.all([getPost(slug), getStoreInfo()])
  if (!post) notFound()

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt ?? '',
    image: post.coverImage ? [post.coverImage] : undefined,
    datePublished: post.publishedAt,
    publisher: {
      '@type': 'Organization',
      name: store?.name ?? 'Store',
      logo: store?.logoUrl ? { '@type': 'ImageObject', url: store.logoUrl } : undefined,
    },
    keywords: post.tags.join(', '),
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div data-theme-section="blog-post" className="theme-blog-post max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Back */}
        <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 mb-8 transition-colors">
          <ArrowLeft size={15} /> Back to blog
        </Link>

        {/* Tags */}
        {post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {post.tags.map((tag) => (
              <span key={tag} className="flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">
                <Tag size={10} /> {tag}
              </span>
            ))}
          </div>
        )}

        {/* Title */}
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight mb-4">{post.title}</h1>

        {/* Meta */}
        <div className="flex items-center gap-4 text-sm text-gray-400 mb-8">
          {post.publishedAt && (
            <time dateTime={post.publishedAt}>
              {new Date(post.publishedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </time>
          )}
          <span className="flex items-center gap-1"><Clock size={13} /> {post.readingTime} min read</span>
        </div>

        {/* Cover image */}
        {post.coverImage && (
          <img
            src={post.coverImage}
            alt={post.title}
            className="w-full h-64 sm:h-80 object-cover rounded-2xl mb-10"
          />
        )}

        {/* Content */}
        <div
          className="prose prose-gray max-w-none prose-headings:font-bold prose-a:text-primary prose-img:rounded-xl"
          dangerouslySetInnerHTML={{ __html: post.content }}
        />
      </div>
    </>
  )
}
