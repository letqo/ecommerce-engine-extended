import { Request, Response, NextFunction } from 'express'
import { isLocale } from '../lib/locales'

export const resolveLocale = (req: Request & { locale?: string }, _res: Response, next: NextFunction) => {
  const queryLocale = req.query.locale as string | undefined
  const headerLocale = req.headers['x-locale'] as string | undefined
  const candidate = queryLocale ?? headerLocale

  // No header/query = no translation lookup, base columns serve as the content — this is
  // intentional (unlike resolveStore's "first store" fallback), not a gap to "fix" later.
  if (isLocale(candidate)) req.locale = candidate

  next()
}
