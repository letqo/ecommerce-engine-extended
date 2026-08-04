import { Router, Request, Response } from 'express'
import { prisma } from '../../config/database'
import { PrintfulAdapter } from '../../suppliers/PrintfulAdapter'
import { SupplierSettings } from '../../suppliers/configurableTypes'
import { updateSupplierOrderWithTracking } from '../../services/trackingSync'
import { findSupplierOrderForWebhook } from './lookupSupplierOrder'

// Printful does not sign webhook deliveries — the only protection is this callback URL being
// unguessable, via the store's own (uuid) id in the path. See PrintfulAdapter's webhook comment
// and SUPPLIER_FULFILLMENT.md. Mounted at /api/webhooks/printful/:storeId in app.ts, ahead of
// the global JSON body parser, with its own express.json() so req.body is a parsed object here.
// mergeParams is required — a Router doesn't inherit :storeId from its app.use() mount path
// otherwise, and req.params.storeId below would silently be undefined.
const router = Router({ mergeParams: true })

router.post('/', async (req: Request, res: Response) => {
  const storeId = req.params.storeId

  try {
    const storeSupplier = await prisma.storeSupplier.findUnique({
      where: { storeId_supplierKey: { storeId, supplierKey: 'PRINTFUL' } },
    })
    // Don't distinguish "unknown store" from "Printful not enabled" in the response — nothing
    // useful to a caller who isn't Printful, and no reason to confirm a store id is live.
    if (!storeSupplier?.enabled) return res.status(404).json({ error: 'Not found' })

    const adapter = new PrintfulAdapter((storeSupplier.settings ?? {}) as SupplierSettings)
    const parsed = adapter.parseWebhookEvent(req.body)
    if (!parsed) return res.json({ received: true })

    console.log(`[Printful Webhook] store ${storeId}: ${parsed.type}`)

    if (parsed.tracking?.trackingNumber) {
      const so = await findSupplierOrderForWebhook(storeId, 'PRINTFUL', parsed.externalOrderId, parsed.ourOrderRef)
      if (so) {
        await updateSupplierOrderWithTracking(so.id, {
          trackingNumber: parsed.tracking.trackingNumber,
          trackingUrl: parsed.tracking.trackingUrl,
          carrier: parsed.tracking.carrier,
          externalStatus: parsed.type,
        })
      } else {
        console.error(`[Printful Webhook] store ${storeId}: no matching SupplierOrder for ${parsed.externalOrderId ?? parsed.ourOrderRef}`)
      }
    }

    res.json({ received: true })
  } catch (err: any) {
    console.error('[Printful Webhook] error:', err.message)
    // Ack anyway — a 4xx/5xx here just makes Printful retry a delivery we already failed to
    // process once, and CJ's route follows the same "log, don't retry-storm" convention.
    res.json({ received: true })
  }
})

export default router
