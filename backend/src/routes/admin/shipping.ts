import { Router, Response, NextFunction } from 'express'
import { prisma } from '../../config/database'
import { requireAdmin, AdminRequest } from '../../middleware/auth'
import { createError } from '../../middleware/errorHandler'
import { z } from 'zod'

const router = Router()

const zoneSchema = z.object({ name: z.string(), countries: z.array(z.string()) })
const rateSchema = z.object({
  name: z.string(),
  price: z.number().min(0),
  minOrderAmount: z.number().optional().nullable(),
  maxOrderAmount: z.number().optional().nullable(),
  isFree: z.boolean().default(false),
  estimatedDays: z.string().optional(),
})

// Shared by the REST routes and the setup-assistant tool dispatcher.
export async function createShippingZone(storeId: string | undefined, input: unknown) {
  const data = zoneSchema.parse(input)
  return prisma.shippingZone.create({ data: { ...data, storeId } })
}

export async function createShippingRate(storeId: string | undefined, zoneId: string, input: unknown) {
  const zone = await prisma.shippingZone.findFirst({ where: { id: zoneId, storeId } })
  if (!zone) throw createError('Shipping zone not found', 404, 'NOT_FOUND')
  const data = rateSchema.parse(input)
  return prisma.shippingRate.create({ data: { ...data, zoneId } })
}

router.use(requireAdmin)

router.get('/zones', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const zones = await prisma.shippingZone.findMany({
      where: { storeId: req.storeId },
      include: { rates: true },
    })
    res.json({ success: true, data: zones })
  } catch (err) { next(err) }
})

router.post('/zones', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const zone = await createShippingZone(req.storeId, req.body)
    res.status(201).json({ success: true, data: zone })
  } catch (err) { next(err) }
})

router.post('/zones/:zoneId/rates', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const rate = await createShippingRate(req.storeId, req.params.zoneId, req.body)
    res.status(201).json({ success: true, data: rate })
  } catch (err) { next(err) }
})

router.delete('/rates/:id', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    await prisma.shippingRate.delete({ where: { id: req.params.id } })
    res.json({ success: true })
  } catch (err) { next(err) }
})

export default router
