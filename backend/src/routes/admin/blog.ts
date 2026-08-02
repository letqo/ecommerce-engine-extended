import { Router, Response, NextFunction } from 'express'
import { prisma } from '../../config/database'
import { requireAdmin, AdminRequest } from '../../middleware/auth'
import { createError } from '../../middleware/errorHandler'
import { z } from 'zod'

const router = Router()
router.use(requireAdmin)

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function calcReadingTime(html: string): number {
  const words = html.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(words / 200))
}

const postSchema = z.object({
  title: z.string().min(1),
  slug: z.string().optional(),
  content: z.string().default(''),
  excerpt: z.string().optional(),
  coverImage: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  tags: z.array(z.string()).default([]),
})

// Shared by the REST routes and the setup-assistant tool dispatcher.
export async function createBlogPost(storeId: string | undefined, input: unknown) {
  const data = postSchema.parse(input)
  const slug = data.slug ? slugify(data.slug) : slugify(data.title)

  const existing = await prisma.blogPost.findFirst({ where: { slug, storeId } })
  if (existing) throw createError('A post with this slug already exists', 400, 'SLUG_TAKEN')

  return prisma.blogPost.create({
    data: {
      storeId,
      title: data.title,
      slug,
      content: data.content,
      excerpt: data.excerpt,
      coverImage: data.coverImage,
      seoTitle: data.seoTitle,
      seoDescription: data.seoDescription,
      tags: data.tags,
      readingTime: calcReadingTime(data.content),
    },
  })
}

export async function updateBlogPost(storeId: string | undefined, postId: string, input: unknown) {
  const data = postSchema.parse(input)
  const slug = data.slug ? slugify(data.slug) : slugify(data.title)

  const existing = await prisma.blogPost.findFirst({ where: { slug, storeId, NOT: { id: postId } } })
  if (existing) throw createError('A post with this slug already exists', 400, 'SLUG_TAKEN')

  const result = await prisma.blogPost.updateMany({
    where: { id: postId, storeId },
    data: {
      title: data.title,
      slug,
      content: data.content,
      excerpt: data.excerpt,
      coverImage: data.coverImage,
      seoTitle: data.seoTitle,
      seoDescription: data.seoDescription,
      tags: data.tags,
      readingTime: calcReadingTime(data.content),
    },
  })
  if (result.count === 0) throw createError('Post not found', 404, 'NOT_FOUND')
  return prisma.blogPost.findUnique({ where: { id: postId } })
}

export async function setBlogPostPublished(storeId: string | undefined, postId: string, published: boolean) {
  const result = await prisma.blogPost.updateMany({
    where: { id: postId, storeId },
    data: published ? { status: 'PUBLISHED', publishedAt: new Date() } : { status: 'DRAFT', publishedAt: null },
  })
  if (result.count === 0) throw createError('Post not found', 404, 'NOT_FOUND')
  return prisma.blogPost.findUnique({ where: { id: postId } })
}

// GET /api/admin/blog
router.get('/', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 20
    const status = req.query.status as string | undefined
    const where: any = { storeId: req.storeId }
    if (status) where.status = status

    const [total, posts] = await Promise.all([
      prisma.blogPost.count({ where }),
      prisma.blogPost.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, title: true, slug: true, excerpt: true,
          coverImage: true, status: true, publishedAt: true,
          tags: true, readingTime: true, createdAt: true, updatedAt: true,
        },
      }),
    ])

    res.json({ success: true, data: posts, meta: { total, page, limit, pages: Math.ceil(total / limit) } })
  } catch (err) { next(err) }
})

// GET /api/admin/blog/:id
router.get('/:id', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const post = await prisma.blogPost.findFirst({ where: { id: req.params.id, storeId: req.storeId } })
    if (!post) throw createError('Post not found', 404, 'NOT_FOUND')
    res.json({ success: true, data: post })
  } catch (err) { next(err) }
})

// POST /api/admin/blog
router.post('/', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const post = await createBlogPost(req.storeId, req.body)
    res.status(201).json({ success: true, data: post })
  } catch (err) { next(err) }
})

// PUT /api/admin/blog/:id
router.put('/:id', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const post = await updateBlogPost(req.storeId, req.params.id, req.body)
    res.json({ success: true, data: post })
  } catch (err) { next(err) }
})

// PATCH /api/admin/blog/:id/publish
router.patch('/:id/publish', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const post = await setBlogPostPublished(req.storeId, req.params.id, true)
    res.json({ success: true, data: post })
  } catch (err) { next(err) }
})

// PATCH /api/admin/blog/:id/unpublish
router.patch('/:id/unpublish', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const post = await setBlogPostPublished(req.storeId, req.params.id, false)
    res.json({ success: true, data: post })
  } catch (err) { next(err) }
})

// DELETE /api/admin/blog/:id
router.delete('/:id', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    await prisma.blogPost.deleteMany({ where: { id: req.params.id, storeId: req.storeId } })
    res.json({ success: true })
  } catch (err) { next(err) }
})

export default router
