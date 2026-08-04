import { Router, Request, Response } from 'express'
import { prisma } from '../../config/database'
import { WooBridgeAdapter } from '../../suppliers/WooBridgeAdapter'
import { SupplierSettings } from '../../suppliers/configurableTypes'
import { updateSupplierOrderWithTracking } from '../../services/trackingSync'
import { findSupplierOrderForWebhook } from './lookupSupplierOrder'

// WooCommerce signs deliveries with X-WC-Webhook-Signature = base64(HMAC-SHA256(rawBody,
// webhookSecret)) — see WooBridgeAdapter's verifyWebhookSignature. That needs the exact raw
// bytes, so this route is mounted (app.ts) with express.raw({ type: 'application/json' })
// instead of the global JSON parser; req.body here is a Buffer, parsed by hand after verifying.
// mergeParams is required — a Router doesn't inherit :storeId from its app.use() mount path
// otherwise, and req.params.storeId below would silently be undefined.
const router = Router({ mergeParams: true })

router.post('/', async (req: Request, res: Response) => {
  const storeId = req.params.storeId
  const signature = req.headers['x-wc-webhook-signature'] as string | undefined
  const rawBody = req.body as Buffer

  try {
    const storeSupplier = await prisma.storeSupplier.findUnique({
      where: { storeId_supplierKey: { storeId, supplierKey: 'WOO_BRIDGE' } },
    })
    if (!storeSupplier?.enabled) return res.status(404).json({ error: 'Not found' })

    const adapter = new WooBridgeAdapter((storeSupplier.settings ?? {}) as SupplierSettings)
    if (!adapter.verifyWebhookSignature(rawBody, signature)) {
      console.error(`[Woo Webhook] store ${storeId}: invalid signature`)
      return res.status(401).json({ error: 'Invalid signature' })
    }

    let payload: any
    try {
      payload = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody))
    } catch {
      // WooCommerce sends an empty-bodied "ping" delivery when a webhook is first created —
      // nothing to parse, just acknowledge it so the supplier's admin shows it as delivered.
      return res.json({ received: true })
    }

    const parsed = adapter.parseWebhookEvent(payload)
    if (!parsed) return res.json({ received: true })

    console.log(`[Woo Webhook] store ${storeId}: order ${parsed.externalOrderId} → ${parsed.status}`)

    const so = await findSupplierOrderForWebhook(storeId, 'WOO_BRIDGE', parsed.externalOrderId, parsed.ourOrderRef)
    if (!so) {
      console.error(`[Woo Webhook] store ${storeId}: no matching SupplierOrder for ${parsed.externalOrderId}`)
      return res.json({ received: true })
    }

    if (parsed.tracking?.trackingNumber) {
      await updateSupplierOrderWithTracking(so.id, {
        trackingNumber: parsed.tracking.trackingNumber,
        trackingUrl: parsed.tracking.trackingUrl,
        carrier: parsed.tracking.carrier,
        externalStatus: parsed.status,
      })
    } else if (so.externalStatus !== parsed.status) {
      await prisma.supplierOrder.update({ where: { id: so.id }, data: { externalStatus: parsed.status } })
    }

    res.json({ received: true })
  } catch (err: any) {
    console.error('[Woo Webhook] error:', err.message)
    res.json({ received: true })
  }
})

export default router
