import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { createError } from './errorHandler'

export interface AdminRequest extends Request {
  admin?: { adminId: string; email: string; role: string }
  storeId?: string
}
export interface CustomerRequest extends Request {
  customer?: { customerId: string; email: string }
  storeId?: string
}

export const requireAdmin = (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) throw createError('Unauthorized', 401, 'UNAUTHORIZED')
    const decoded = jwt.verify(token, env.JWT_SECRET) as any
    req.admin = decoded
    next()
  } catch {
    next(createError('Invalid token', 401, 'UNAUTHORIZED'))
  }
}

export const requireCustomer = (req: CustomerRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) throw createError('Unauthorized', 401, 'UNAUTHORIZED')
    const decoded = jwt.verify(token, env.JWT_CUSTOMER_SECRET) as any
    req.customer = decoded
    next()
  } catch {
    next(createError('Invalid token', 401, 'UNAUTHORIZED'))
  }
}

export const optionalCustomer = (req: CustomerRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]
    if (token) {
      const decoded = jwt.verify(token, env.JWT_CUSTOMER_SECRET) as any
      req.customer = decoded
    }
  } catch {}
  next()
}
