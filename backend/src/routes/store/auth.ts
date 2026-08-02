import { Router, Request, Response, NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../../config/database'
import { env } from '../../config/env'
import { requireCustomer, CustomerRequest } from '../../middleware/auth'
import { createError } from '../../middleware/errorHandler'
import { z } from 'zod'
import { ensureSubscriber } from './newsletter'

const router = Router()

// POST /api/store/auth/register
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = (req as any).storeId
    const { email, password, firstName, lastName, acceptsMarketing } = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      acceptsMarketing: z.boolean().default(false),
    }).parse(req.body)

    const existing = await prisma.customer.findFirst({ where: { email, storeId } })
    if (existing) throw createError('Email already registered', 400, 'EMAIL_TAKEN')

    const passwordHash = await bcrypt.hash(password, 12)
    const customer = await prisma.customer.create({
      data: { email, passwordHash, firstName, lastName, acceptsMarketing, isVerified: true, storeId },
    })

    const token = jwt.sign({ customerId: customer.id, email: customer.email }, env.JWT_CUSTOMER_SECRET, { expiresIn: env.JWT_CUSTOMER_EXPIRES_IN as any })

    ensureSubscriber(email, storeId, 'registration', firstName).catch(() => {})

    res.status(201).json({ success: true, data: { token, customer: { id: customer.id, email: customer.email, firstName: customer.firstName, lastName: customer.lastName } } })
  } catch (err) { next(err) }
})

// POST /api/store/auth/login
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = (req as any).storeId
    const { email, password } = z.object({ email: z.string().email(), password: z.string() }).parse(req.body)
    const customer = await prisma.customer.findFirst({ where: { email, storeId } })
    if (!customer || !customer.passwordHash) throw createError('Invalid credentials', 401, 'INVALID_CREDENTIALS')
    const valid = await bcrypt.compare(password, customer.passwordHash)
    if (!valid) throw createError('Invalid credentials', 401, 'INVALID_CREDENTIALS')
    const token = jwt.sign({ customerId: customer.id, email: customer.email }, env.JWT_CUSTOMER_SECRET, { expiresIn: env.JWT_CUSTOMER_EXPIRES_IN as any })
    res.json({ success: true, data: { token, customer: { id: customer.id, email: customer.email, firstName: customer.firstName, lastName: customer.lastName } } })
  } catch (err) { next(err) }
})

// GET /api/store/auth/me
router.get('/me', requireCustomer, async (req: CustomerRequest, res: Response, next: NextFunction) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.customer!.customerId },
      select: { id: true, email: true, firstName: true, lastName: true, phone: true, acceptsMarketing: true, addresses: true },
    })
    if (!customer) throw createError('Not found', 404, 'NOT_FOUND')
    res.json({ success: true, data: customer })
  } catch (err) { next(err) }
})

export default router
