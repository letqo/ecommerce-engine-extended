import { Router, Response, NextFunction } from 'express'
import { requireAdmin, AdminRequest } from '../../middleware/auth'
import { getStoreHealth } from '../../services/storeHealth'

const router = Router()
router.use(requireAdmin)

// GET /api/admin/store-health
router.get('/', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.storeId) return res.status(400).json({ success: false, error: { message: 'No store resolved' } })
    const data = await getStoreHealth(req.storeId)
    res.json({ success: true, data })
  } catch (err) { next(err) }
})

export default router
