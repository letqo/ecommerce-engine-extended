import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { PenLine, Plus, Trash2, Eye, EyeOff, Clock } from 'lucide-react'

interface BlogPost {
  id: string
  title: string
  slug: string
  excerpt?: string | null
  coverImage?: string | null
  status: string
  publishedAt?: string | null
  tags: string[]
  readingTime: number
  createdAt: string
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
      status === 'PUBLISHED' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
    }`}>
      {status === 'PUBLISHED' ? 'Published' : 'Draft'}
    </span>
  )
}

export default function BlogList() {
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)

  const load = async () => {
    try {
      const res = await api.get('/api/admin/blog?limit=50')
      setPosts(res.data.data)
      setTotal(res.data.meta.total)
    } catch { /* silent */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const togglePublish = async (post: BlogPost) => {
    const action = post.status === 'PUBLISHED' ? 'unpublish' : 'publish'
    await api.patch(`/api/admin/blog/${post.id}/${action}`)
    load()
  }

  const deletePost = async (post: BlogPost) => {
    if (!window.confirm(`Delete "${post.title}"? This cannot be undone.`)) return
    await api.delete(`/api/admin/blog/${post.id}`)
    load()
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Blog Posts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{total} post{total !== 1 ? 's' : ''} total</p>
        </div>
        <Link to="/blog/new">
          <Button className="gap-2">
            <Plus size={16} /> New post
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-24 text-muted-foreground">
          <PenLine size={40} className="mx-auto mb-4 opacity-30" />
          <p className="font-medium">No blog posts yet</p>
          <p className="text-sm mt-1">Create your first post to start driving SEO traffic</p>
          <Link to="/blog/new">
            <Button className="mt-4 gap-2"><Plus size={16} /> Write your first post</Button>
          </Link>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
                <th className="text-left px-4 py-3">Post</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Date</th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">Read time</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {posts.map((post) => (
                <tr key={post.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {post.coverImage ? (
                        <img src={post.coverImage} alt="" className="w-12 h-10 object-cover rounded-lg flex-shrink-0" />
                      ) : (
                        <div className="w-12 h-10 bg-gray-100 rounded-lg flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{post.title}</p>
                        {post.excerpt && (
                          <p className="text-xs text-muted-foreground truncate max-w-xs">{post.excerpt}</p>
                        )}
                        {post.tags.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {post.tags.slice(0, 3).map((tag) => (
                              <span key={tag} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={post.status} /></td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                    {post.publishedAt
                      ? new Date(post.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : new Date(post.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock size={12} /> {post.readingTime} min</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link to={`/blog/${post.id}`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit">
                          <PenLine size={14} />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8"
                        title={post.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
                        onClick={() => togglePublish(post)}
                      >
                        {post.status === 'PUBLISHED' ? <EyeOff size={14} /> : <Eye size={14} />}
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                        title="Delete" onClick={() => deletePost(post)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
