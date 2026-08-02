import { Router, Response, NextFunction } from 'express'
import { prisma } from '../../config/database'
import { requireAdmin, AdminRequest } from '../../middleware/auth'
import { createError } from '../../middleware/errorHandler'
import { submitSupplierOrder, fulfillSupplierOrderManually } from '../../services/supplierOrderFulfillment'
import { z } from 'zod'

const router = Router()
router.use(requireAdmin)

// GET /api/admin/fulfillment-queue — every parcel across all orders that needs action right
// now: AWAITING_MANUAL (no ordering API — someone has to place it by hand) or ERROR (an
// API submission failed and either exhausted its automatic retries, or is still retrying).
// Oldest first, since that's the order a store owner should work through them in.
router.get('/', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const statusFilter = req.query.status as string | undefined // 'AWAITING_MANUAL' | 'ERROR' | undefined (both)
    const where: any = {
      storeId: req.storeId,
      status: statusFilter ? statusFilter : { in: ['AWAITING_MANUAL', 'ERROR'] },
    }

    const supplierOrders = await prisma.supplierOrder.findMany({
      where,
      include: {
        items: { select: { title: true, quantity: true } },
        order: { select: { id: true, orderNumber: true, createdAt: true, guestEmail: true, customer: { select: { email: true } } } },
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    })

    res.json({ success: true, data: supplierOrders })
  } catch (err) { next(err) }
})

// GET /api/admin/fulfillment-queue/count — nav badge count
router.get('/count', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const count = await prisma.supplierOrder.count({
      where: { storeId: req.storeId, status: { in: ['AWAITING_MANUAL', 'ERROR'] } },
    })
    res.json({ success: true, data: { count } })
  } catch (err) { next(err) }
})

// POST /api/admin/fulfillment-queue/:id/retry — resubmit a CJ/AliExpress parcel by hand
router.post('/:id/retry', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const so = await prisma.supplierOrder.findFirst({ where: { id: req.params.id, storeId: req.storeId } })
    if (!so) throw createError('Parcel not found', 404, 'NOT_FOUND')
    if (so.supplierKey === 'MANUAL') throw createError('Manual parcels have no API to retry — enter tracking instead.', 400, 'NOT_RETRYABLE')

    try {
      const updated = await submitSupplierOrder(so.id, { force: req.body.force })
      res.json({ success: true, data: updated })
    } catch (err: any) {
      if (err.code === 'SYNC_WARNING') return res.status(409).json({ success: false, code: 'SYNC_WARNING', warnings: err.warnings })
      throw err
    }
  } catch (err) { next(err) }
})

// PATCH /api/admin/fulfillment-queue/:id/fulfill — enter tracking for one parcel by hand,
// same underlying action as orders.ts's supplier-orders/:id/fulfill, exposed here too so
// the queue page doesn't need to navigate into the order first.
router.patch('/:id/fulfill', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const { trackingNumber, trackingUrl, carrier } = z.object({
      trackingNumber: z.string().min(1),
      trackingUrl: z.string().optional(),
      carrier: z.string().optional(),
    }).parse(req.body)

    const so = await prisma.supplierOrder.findFirst({ where: { id: req.params.id, storeId: req.storeId } })
    if (!so) throw createError('Parcel not found', 404, 'NOT_FOUND')

    const updated = await fulfillSupplierOrderManually(so.id, { trackingNumber, trackingUrl, carrier }, req.admin!.email)
    res.json({ success: true, data: updated })
  } catch (err) { next(err) }
})

export default router
