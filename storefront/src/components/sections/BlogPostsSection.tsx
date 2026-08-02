import Image from 'next/image'
import Link from 'next/link'

export default function BlogPostsSection({ posts, heading, variant = 'grid' }: { posts: any[]; heading?: string; variant?: string }) {
  if (posts.length === 0) return null

  return (
    <section data-theme-section="home-blog" data-variant={variant} className="theme-home-blog max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-bold">{heading ?? 'From the Blog'}</h2>
        <Link href="/blog" className="text-sm text-primary hover:underline font-medium">View all</Link>
      </div>
      <div className={variant === 'list'
        ? 'space-y-6'
        : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6'
      }>
        {posts.map((post: any) => (
          <Link key={post.id} href={`/blog/${post.slug}`} className={`group ${variant === 'list' ? 'flex gap-6 items-start' : ''}`}>
            {post.coverImage && (
              <div className={`overflow-hidden rounded-card bg-gray-100 ${variant === 'list' ? 'w-40 h-28 flex-shrink-0' : 'aspect-[16/10] mb-3'}`}>
                <Image src={post.coverImage} alt={post.title} width={400} height={250} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
              </div>
            )}
            <div>
              <h3 className="font-semibold text-sm group-hover:text-primary transition-colors line-clamp-2">{post.title}</h3>
              {post.excerpt && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{post.excerpt}</p>}
              {post.publishedAt && (
                <p className="text-xs text-gray-400 mt-2">{new Date(post.publishedAt).toLocaleDateString()}</p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
