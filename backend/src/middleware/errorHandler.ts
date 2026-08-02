import { Request, Response, NextFunction } from 'express'

export interface AppError extends Error {
  statusCode?: number
  code?: string
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const statusCode = err.statusCode || 500
  console.error(`[ERROR] ${statusCode}: ${err.message}`)
  res.status(statusCode).json({
    success: false,
    error: { code: err.code || 'ERROR', message: err.message },
  })
}

export const createError = (message: string, statusCode = 500, code = 'ERROR'): AppError => {
  const e: AppError = new Error(message)
  e.statusCode = statusCode
  e.code = code
  return e
}
