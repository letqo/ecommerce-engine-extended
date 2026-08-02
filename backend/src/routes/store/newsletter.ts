import { Router, Request, Response, NextFunction } from 'express'
import { prisma } from '../../config/database'
import { z } from 'zod'

const router = Router()

export async function ensureSubscriber(email: string, storeId: string | undefined, source: string, firstName?: string) {
  const existing = await prisma.emailSubscriber.findFirst({ where: { email, storeId } })
  if (existing) {
    if (!existing.isActive) {
      await prisma.emailSubscriber.update({
        where: { id: existing.id },
        data: { isActive: true, firstName: firstName ?? existing.firstName ?? undefined },
      })
    }
    return existing
  }
  return prisma.emailSubscriber.create({
    data: { email, firstName, storeId, source },
  })
}

// POST /api/store/newsletter/subscribe
router.post('/subscribe', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = (req as any).storeId
    const { email, firstName } = z.object({
      email: z.string().email(),
      firstName: z.string().optional(),
    }).parse(req.body)

    await ensureSubscriber(email, storeId, 'website', firstName)

    import('../../services/email').then(({ sendWelcomeEmail }) =>
      sendWelcomeEmail(email, firstName, storeId ?? undefined).catch((e: Error) =>
        console.error('Welcome email error:', e.message)
      )
    )

    res.json({ success: true, message: 'subscribed' })
  } catch (err) { next(err) }
})

// GET /api/store/newsletter/unsubscribe
router.get('/unsubscribe', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.query.token as string
    if (!token) return res.status(400).json({ success: false, error: { message: 'Missing token' } })

    const subscriber = await prisma.emailSubscriber.findUnique({ where: { unsubscribeToken: token } })
    if (!subscriber) return res.status(404).json({ success: false, error: { message: 'Invalid token' } })

    await prisma.emailSubscriber.update({
      where: { id: subscriber.id },
      data: { isActive: false },
    })

    res.json({ success: true, message: 'unsubscribed' })
  } catch (err) { next(err) }
})

export default router
