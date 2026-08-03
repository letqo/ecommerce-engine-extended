import { Router, Response, NextFunction } from 'express'
import { requireAdmin, AdminRequest } from '../../middleware/auth'
import { listComplianceProfiles } from '../../lib/complianceProfiles'

const router = Router()
router.use(requireAdmin)

// GET /api/admin/compliance-profiles
// The whole profile registry, so the admin product editor can render its compliance form
// dynamically instead of keeping a second copy of the field list in the frontend. Static data
// — no store scoping needed.
router.get('/', async (_req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    res.json({
      success: true,
      data: listComplianceProfiles().map((p) => ({
        key: p.key,
        label: p.label,
        description: p.description,
        fields: p.fields,
      })),
    })
  } catch (err) { next(err) }
})

export default router
