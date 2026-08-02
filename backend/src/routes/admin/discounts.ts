import { Router, Response, NextFunction } from 'express'
import { prisma } from '../../config/database'
import { requireAdmin, AdminRequest } from '../../middleware/auth'
import { createError } from '../../middleware/errorHandler'
import { z } from 'zod'

const router = Router()
router.use(requireAdmin)

const discountSchema = z.object({
  code: z.string().min(1).toUpperCase(),
  type: z.enum(['PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING']),
  value: z.number().min(0),
  minOrderAmount: z.number().optional().nullable(),
  maxUses: z.number().int().optional().nullable(),
  isActive: z.boolean().default(true),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
})

// Shared by the REST route and the setup-assistant tool dispatcher.
export async function createDiscount(storeId: string | undefined, input: unknown) {
  const data = discountSchema.parse(input)
  const exists = await prisma.discount.findFirst({ where: { code: data.code, storeId } })
  if (exists) throw createError('Coupon code already exists', 400, 'DUPLICATE_CODE')
  return prisma.discount.create({ data: { ...data, storeId } as any })
}

export async function updateDiscount(storeId: string | undefined, discountId: string, input: unknown) {
  const data = discountSchema.partial().parse(input)
  const result = await prisma.discount.updateMany({ where: { id: discountId, storeId }, data: data as any })
  if (result.count === 0) throw createError('Discount not found', 404, 'NOT_FOUND')
  return prisma.discount.findUnique({ where: { id: discountId } })
}

router.get('/', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const discounts = await prisma.discount.findMany({
      where: { storeId: req.storeId },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ success: true, data: discounts })
  } catch (err) { next(err) }
})

router.post('/', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const discount = await createDiscount(req.storeId, req.body)
    res.status(201).json({ success: true, data: discount })
  } catch (err) { next(err) }
})

router.put('/:id', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const discount = await updateDiscount(req.storeId, req.params.id, req.body)
    res.json({ success: true, data: discount })
  } catch (err) { next(err) }
})

router.delete('/:id', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    await prisma.discount.deleteMany({ where: { id: req.params.id, storeId: req.storeId } })
    res.json({ success: true })
  } catch (err) { next(err) }
})

export default router
