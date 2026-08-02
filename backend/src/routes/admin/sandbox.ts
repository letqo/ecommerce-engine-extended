import { Router, Response, NextFunction } from 'express'
import { prisma } from '../../config/database'
import { requireAdmin, AdminRequest } from '../../middleware/auth'
import { createError } from '../../middleware/errorHandler'
import { CJAdapter } from '../../suppliers/CJAdapter'

const router = Router()
router.use(requireAdmin)

// POST /api/admin/sandbox/cj/create — create a sandbox test order
router.post('/cj/create', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const { productId } = req.body
    if (!productId) throw createError('productId required', 400, 'MISSING_FIELD')

    const product = await prisma.product.findFirst({
      where: { id: productId, cjProductId: { not: null } },
      include: { variants: { take: 1 } },
    })
    if (!product) throw createError('CJ product not found', 404, 'NOT_FOUND')

    const variant = product.variants[0]
    if (!variant?.cjVariantId) throw createError('No CJ variant found', 400, 'NO_VARIANT')

    const cj = new CJAdapter()
    const testOrderNumber = `SANDBOX-${Date.now()}`

    const result = await cj.placeOrder({
      ourOrderId: testOrderNumber,
      items: [{ variantSupplierId: variant.cjVariantId, quantity: 1 }],
      shippingAddress: {
        firstName: 'Test',
        lastName: 'Order',
        address1: '123 Test Street',
        city: 'New York',
        province: 'NY',
        postalCode: '10001',
        countryCode: 'US',
        phone: '5551234567',
      },
      remark: 'Sandbox test order',
    }, true)

    res.json({
      success: true,
      data: {
        cjOrderId: result.supplierOrderId,
        status: result.status,
        testOrderNumber,
        product: product.title,
        variant: variant.title,
      },
    })
  } catch (err) { next(err) }
})

// POST /api/admin/sandbox/cj/simulate-pay — simulate payment on a sandbox order
router.post('/cj/simulate-pay', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const { cjOrderId } = req.body
    if (!cjOrderId) throw createError('cjOrderId required', 400, 'MISSING_FIELD')

    const cj = new CJAdapter()
    await cj.sandboxSimulatePay(cjOrderId)

    res.json({ success: true, message: 'Payment simulated' })
  } catch (err) { next(err) }
})

// POST /api/admin/sandbox/cj/update-status — advance sandbox order status
router.post('/cj/update-status', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const { cjOrderId, targetStatus } = req.body
    if (!cjOrderId) throw createError('cjOrderId required', 400, 'MISSING_FIELD')

    const validStatuses: Record<number, string> = {
      400: 'UNSHIPPED',
      500: 'SHIPPED',
      600: 'COMPLETED',
      700: 'CLOSED',
    }
    const status = Number(targetStatus)
    if (!validStatuses[status]) throw createError('targetStatus must be 400, 500, 600, or 700', 400, 'INVALID_STATUS')

    const cj = new CJAdapter()
    await cj.sandboxUpdateStatus(cjOrderId, status)

    res.json({ success: true, message: `Status updated to ${validStatuses[status]}` })
  } catch (err) { next(err) }
})

// GET /api/admin/sandbox/cj/check-tracking — check tracking for a CJ order
router.get('/cj/check-tracking', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const cjOrderId = req.query.cjOrderId as string
    if (!cjOrderId) throw createError('cjOrderId required', 400, 'MISSING_FIELD')

    const cj = new CJAdapter()
    const info = await cj.getOrderStatus(cjOrderId)

    res.json({ success: true, data: info })
  } catch (err) { next(err) }
})

export default router
