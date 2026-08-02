import { Router, Response, NextFunction } from 'express'
import { prisma } from '../../config/database'
import { requireAdmin, AdminRequest } from '../../middleware/auth'
import { runAssistantTurn } from '../../services/setupAssistant'
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'

const router = Router()
router.use(requireAdmin)

async function getStoreId(req: AdminRequest): Promise<string> {
  if (req.storeId) return req.storeId
  const store = await prisma.store.findFirst({ select: { id: true } })
  if (!store) throw new Error('No store found')
  return store.id
}

async function getOrCreateSession(storeId: string) {
  const existing = await prisma.setupAssistantSession.findUnique({ where: { storeId } })
  if (existing) return existing
  return prisma.setupAssistantSession.create({ data: { storeId, messages: [] } })
}

// GET /api/admin/setup-assistant/session — resume the store's conversation
router.get('/session', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const storeId = await getStoreId(req)
    const session = await getOrCreateSession(storeId)
    res.json({ success: true, data: { messages: session.messages } })
  } catch (err) { next(err) }
})

// POST /api/admin/setup-assistant/message — send a message, run the assistant's turn
router.post('/message', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const { message } = req.body
    if (!message?.trim()) return res.status(400).json({ success: false, error: { message: 'message is required' } })

    const storeId = await getStoreId(req)
    const session = await getOrCreateSession(storeId)
    const history = (session.messages as unknown as MessageParam[]) ?? []

    const { reply, actions, messages } = await runAssistantTurn(storeId, history, message.trim())

    await prisma.setupAssistantSession.update({
      where: { storeId },
      data: { messages: messages as any },
    })

    res.json({ success: true, data: { reply, actions } })
  } catch (err) { next(err) }
})

// DELETE /api/admin/setup-assistant/session — start over
router.delete('/session', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const storeId = await getStoreId(req)
    await prisma.setupAssistantSession.upsert({
      where: { storeId },
      update: { messages: [] },
      create: { storeId, messages: [] },
    })
    res.json({ success: true })
  } catch (err) { next(err) }
})

export default router
