import axios from 'axios'
import { env } from '../config/env'
import { prisma } from '../config/database'
import { CJAdapter } from '../suppliers/CJAdapter'

export async function registerCJWebhooks(): Promise<void> {
  if (!env.CJ_API_KEY) return

  const callbackUrl = `${env.BACKEND_URL}/api/webhooks/cj`

  // Don't register if backend URL is localhost (not reachable by CJ)
  if (callbackUrl.includes('localhost') || callbackUrl.includes('127.0.0.1')) {
    console.log('[CJ Webhooks] Skipped — backend URL is localhost (not reachable by CJ)')
    return
  }

  try {
    const cj = new CJAdapter()
    // Use the adapter's auth to get a token
    const authRes = await axios.post(`${env.CJ_API_BASE_URL}/v1/authentication/getAccessToken`, {
      apiKey: env.CJ_API_KEY,
    })
    if (authRes.data.code !== 200) {
      console.error('[CJ Webhooks] Auth failed:', authRes.data.message)
      return
    }
    const token = authRes.data.data.accessToken

    const res = await axios.post(
      `${env.CJ_API_BASE_URL}/v1/webhook/set`,
      {
        product: { type: 'ENABLE', callbackUrls: [callbackUrl] },
        stock: { type: 'ENABLE', callbackUrls: [callbackUrl] },
        order: { type: 'ENABLE', callbackUrls: [callbackUrl] },
        logistics: { type: 'ENABLE', callbackUrls: [callbackUrl] },
      },
      { headers: { 'CJ-Access-Token': token } }
    )

    if (res.data.code === 200 || res.data.success) {
      console.log('[CJ Webhooks] Registered successfully →', callbackUrl)
    } else {
      console.error('[CJ Webhooks] Registration failed:', res.data.message)
    }

    // Subscribe all CJ products for product/stock webhooks
    const cjProducts = await prisma.product.findMany({
      where: { cjProductId: { not: null }, status: { not: 'ARCHIVED' } },
      select: { cjProductId: true },
    })
    const productIds = cjProducts.map((p) => p.cjProductId!).filter(Boolean)

    if (productIds.length > 0) {
      // API accepts max 100 per call
      for (let i = 0; i < productIds.length; i += 100) {
        const batch = productIds.slice(i, i + 100)
        await axios.post(
          `${env.CJ_API_BASE_URL}/v1/webhook/product/subscribe`,
          { productIds: batch },
          { headers: { 'CJ-Access-Token': token } }
        ).catch((e: any) => console.error('[CJ Webhooks] Product subscribe error:', e.message))
      }
      console.log(`[CJ Webhooks] Subscribed ${productIds.length} products`)
    }
  } catch (err: any) {
    console.error('[CJ Webhooks] Registration error:', err.message)
  }
}
