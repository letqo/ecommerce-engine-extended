import { Router, Request, Response, NextFunction } from 'express'
import { prisma } from '../../config/database'

const router = Router()

// GET /api/store/blog — list published posts
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = (req as any).storeId
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 12
    const tag = req.query.tag as string | undefined

    const where: any = { storeId, status: 'PUBLISHED' }
    if (tag) where.tags = { has: tag }

    const [total, posts] = await Promise.all([
      prisma.blogPost.count({ where }),
      prisma.blogPost.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, title: true, slug: true, excerpt: true,
          coverImage: true, publishedAt: true, tags: true, readingTime: true,
        },
      }),
    ])

    res.json({ success: true, data: posts, meta: { total, page, limit, pages: Math.ceil(total / limit) } })
  } catch (err) { next(err) }
})

// GET /api/store/blog/:slug — single published post
router.get('/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = (req as any).storeId
    const post = await prisma.blogPost.findFirst({
      where: { slug: req.params.slug, storeId, status: 'PUBLISHED' },
    })
    if (!post) {
      res.status(404).json({ success: false, error: 'Post not found' })
      return
    }
    res.json({ success: true, data: post })
  } catch (err) { next(err) }
})

export default router
