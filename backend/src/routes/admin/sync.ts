import { Router, Response, NextFunction } from 'express'
import { prisma } from '../../config/database'
import { requireAdmin, AdminRequest } from '../../middleware/auth'
import { runSupplierSync, checkBeforeFulfillment } from '../../services/supplierSync'

const router = Router()
router.use(requireAdmin)

interface SyncState {
  running: boolean
  startedAt?: string
  finishedAt?: string
  lastResult?: Awaited<ReturnType<typeof runSupplierSync>>
  lastError?: string
}

let syncState: SyncState = { running: false }

// GET /api/admin/sync/alerts — products with sync alerts
router.get('/alerts', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const products = await prisma.product.findMany({
      where: {
        storeId: req.storeId,
        syncAlert: { not: null },
      },
      select: {
        id: true,
        title: true,
        status: true,
        syncAlert: true,
        lastSyncedAt: true,
        cjProductId: true,
        aliexpressProductId: true,
        images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
        variants: { select: { price: true, costPerItem: true, inventoryQty: true } },
      },
      orderBy: { lastSyncedAt: 'desc' },
    })

    res.json({ success: true, data: products })
  } catch (err) { next(err) }
})

// GET /api/admin/sync/alerts/count — badge count
router.get('/alerts/count', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const count = await prisma.product.count({
      where: { storeId: req.storeId, syncAlert: { not: null } },
    })
    res.json({ success: true, data: { count } })
  } catch (err) { next(err) }
})

// POST /api/admin/sync/dismiss/:id — dismiss alert for a product
router.post('/dismiss/:id', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    await prisma.product.updateMany({
      where: { id: req.params.id, storeId: req.storeId },
      data: { syncAlert: null },
    })
    res.json({ success: true })
  } catch (err) { next(err) }
})

// GET /api/admin/sync/status — poll progress of the background sync job
router.get('/status', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: syncState })
  } catch (err) { next(err) }
})

// POST /api/admin/sync/run — trigger manual sync (runs in the background; the
// full catalog can take long enough to sync that waiting on the response
// hits a network timeout, so we kick it off and let the client poll /status)
router.post('/run', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    if (!syncState.running) {
      syncState = { running: true, startedAt: new Date().toISOString() }
      runSupplierSync()
        .then((result) => {
          syncState = { running: false, startedAt: syncState.startedAt, finishedAt: new Date().toISOString(), lastResult: result }
        })
        .catch((err) => {
          console.error('[SupplierSync] Manual sync failed:', err)
          syncState = { running: false, startedAt: syncState.startedAt, finishedAt: new Date().toISOString(), lastError: err?.message || 'Sync failed' }
        })
    }
    res.json({ success: true, data: { started: true } })
  } catch (err) { next(err) }
})

// POST /api/admin/sync/check-order/:orderId — pre-fulfillment check
router.post('/check-order/:orderId', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const result = await checkBeforeFulfillment(req.params.orderId)
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
})

export default router
