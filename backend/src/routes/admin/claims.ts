import { Router, Response, NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { requireAdmin, AdminRequest } from '../../middleware/auth'
import { createError } from '../../middleware/errorHandler'
import { issueRefund } from './orders'
import { sendClaimApprovedEmail, sendClaimDeniedEmail } from '../../services/email'

const router = Router()
router.use(requireAdmin)

// GET /api/admin/claims/needs-review/count — badge count
router.get('/needs-review/count', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const count = await prisma.damageClaim.count({
      where: { status: 'NEEDS_REVIEW', order: { storeId: req.storeId } },
    })
    res.json({ success: true, data: { count } })
  } catch (err) { next(err) }
})

// GET /api/admin/claims
router.get('/', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as string | undefined
    const claims = await prisma.damageClaim.findMany({
      where: { order: { storeId: req.storeId }, ...(status ? { status: status as any } : {}) },
      include: { order: { select: { orderNumber: true, total: true, currency: true, guestEmail: true, customer: { select: { email: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    res.json({ success: true, data: claims })
  } catch (err) { next(err) }
})

// GET /api/admin/claims/:id
router.get('/:id', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const claim = await prisma.damageClaim.findFirst({
      where: { id: req.params.id, order: { storeId: req.storeId } },
      include: {
        order: {
          select: {
            orderNumber: true, total: true, currency: true, guestEmail: true, shippedAt: true,
            supplierOrders: { select: { supplierKey: true, supplierName: true, externalOrderId: true } },
            customer: { select: { email: true } },
            items: {
              select: {
                title: true, variantTitle: true, quantity: true, price: true, imageUrl: true,
                variant: {
                  select: {
                    costPerItem: true, cjVariantId: true, aliexpressSkuId: true,
                    product: { select: { cjProductId: true, aliexpressProductId: true } },
                  },
                },
              },
            },
          },
        },
      },
    })
    if (!claim) throw createError('Claim not found', 404, 'NOT_FOUND')
    res.json({ success: true, data: claim })
  } catch (err) { next(err) }
})

// POST /api/admin/claims/:id/supplier-status — tracks whether the store owner has
// pursued reimbursement from the supplier (CJ/AliExpress have no dispute API, so
// this is just a manual-follow-up tracker, separate from the customer resolution).
router.post('/:id/supplier-status', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const { status } = z.object({ status: z.enum(['filed', 'reimbursed', 'not_pursuing']).nullable() }).parse(req.body)
    const claim = await prisma.damageClaim.findFirst({ where: { id: req.params.id, order: { storeId: req.storeId } } })
    if (!claim) throw createError('Claim not found', 404, 'NOT_FOUND')

    await prisma.damageClaim.update({ where: { id: claim.id }, data: { supplierClaimStatus: status } })
    res.json({ success: true })
  } catch (err) { next(err) }
})

// POST /api/admin/claims/:id/approve
router.post('/:id/approve', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const { resolution } = z.object({ resolution: z.enum(['refund', 'replacement']) }).parse(req.body)
    const claim = await prisma.damageClaim.findFirst({
      where: { id: req.params.id, order: { storeId: req.storeId } },
      include: { order: { select: { id: true, storeId: true, total: true, currency: true } } },
    })
    if (!claim) throw createError('Claim not found', 404, 'NOT_FOUND')
    if (claim.status === 'APPROVED' || claim.status === 'DENIED') {
      throw createError('This claim has already been resolved', 400, 'ALREADY_RESOLVED')
    }

    let refundId: string | undefined
    if (resolution === 'refund') {
      const refund = await issueRefund(claim.order.storeId ?? undefined, claim.order.id, claim.order.total, `Damage claim ${claim.id}`, req.admin!.email)
      refundId = refund.id
    }

    await prisma.damageClaim.update({
      where: { id: claim.id },
      data: { status: 'APPROVED', resolution, refundId, resolvedAt: new Date(), resolvedBy: req.admin!.email },
    })

    sendClaimApprovedEmail(claim.order.id, resolution, resolution === 'refund' ? claim.order.total : undefined, claim.order.currency)
      .catch((e: Error) => console.error('Claim approved email error:', e.message))

    res.json({ success: true })
  } catch (err) { next(err) }
})

// POST /api/admin/claims/:id/deny
router.post('/:id/deny', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const { reason } = z.object({ reason: z.string().min(1) }).parse(req.body)
    const claim = await prisma.damageClaim.findFirst({
      where: { id: req.params.id, order: { storeId: req.storeId } },
      include: { order: { select: { id: true } } },
    })
    if (!claim) throw createError('Claim not found', 404, 'NOT_FOUND')
    if (claim.status === 'APPROVED' || claim.status === 'DENIED') {
      throw createError('This claim has already been resolved', 400, 'ALREADY_RESOLVED')
    }

    await prisma.damageClaim.update({
      where: { id: claim.id },
      data: { status: 'DENIED', resolvedAt: new Date(), resolvedBy: req.admin!.email },
    })

    sendClaimDeniedEmail(claim.order.id, reason).catch((e: Error) => console.error('Claim denied email error:', e.message))

    res.json({ success: true })
  } catch (err) { next(err) }
})

export default router
