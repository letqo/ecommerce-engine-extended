import { Request, Response, NextFunction } from 'express'
import { prisma } from '../config/database'

export const resolveStore = async (req: Request & { storeId?: string }, _res: Response, next: NextFunction) => {
  try {
    const headerStoreId = req.headers['x-store-id'] as string | undefined

    if (headerStoreId) {
      req.storeId = headerStoreId
    } else {
      // Fallback: use first store (single-store mode or when no header sent)
      const store = await prisma.store.findFirst({ select: { id: true } })
      req.storeId = store?.id
    }
    next()
  } catch {
    next()
  }
}
