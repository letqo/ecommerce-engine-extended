import { Router, Request, Response, NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../../config/database'
import { env } from '../../config/env'
import { requireAdmin, AdminRequest } from '../../middleware/auth'
import { createError } from '../../middleware/errorHandler'
import { z } from 'zod'

const router = Router()

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

// POST /api/admin/auth/login
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = loginSchema.parse(req.body)

    const admin = await prisma.admin.findUnique({ where: { email } })
    if (!admin) throw createError('Invalid credentials', 401, 'INVALID_CREDENTIALS')

    const valid = await bcrypt.compare(password, admin.passwordHash)
    if (!valid) throw createError('Invalid credentials', 401, 'INVALID_CREDENTIALS')

    await prisma.admin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    })

    const token = jwt.sign(
      { adminId: admin.id, email: admin.email, role: admin.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN as any }
    )

    res.json({
      success: true,
      data: {
        token,
        admin: {
          id: admin.id,
          email: admin.email,
          firstName: admin.firstName,
          lastName: admin.lastName,
          role: admin.role,
        },
      },
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/admin/auth/me
router.get('/me', requireAdmin, async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const admin = await prisma.admin.findUnique({
      where: { id: req.admin!.adminId },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, lastLoginAt: true },
    })
    if (!admin) throw createError('Admin not found', 404, 'NOT_FOUND')
    res.json({ success: true, data: admin })
  } catch (err) {
    next(err)
  }
})

// PUT /api/admin/auth/password
router.put('/password', requireAdmin, async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8),
    }).parse(req.body)

    const admin = await prisma.admin.findUnique({ where: { id: req.admin!.adminId } })
    if (!admin) throw createError('Admin not found', 404, 'NOT_FOUND')

    const valid = await bcrypt.compare(currentPassword, admin.passwordHash)
    if (!valid) throw createError('Current password is incorrect', 400, 'INVALID_PASSWORD')

    const passwordHash = await bcrypt.hash(newPassword, 12)
    await prisma.admin.update({ where: { id: admin.id }, data: { passwordHash } })

    res.json({ success: true, message: 'Password updated' })
  } catch (err) {
    next(err)
  }
})

export default router
