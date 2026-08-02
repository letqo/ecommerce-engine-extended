import { Resend } from 'resend'
import { prisma } from '../config/database'
import { env } from '../config/env'

const resend = new Resend(env.RESEND_API_KEY)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

function formatDate(d: Date) {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

type FromIdentity = { emailFromName?: string | null; emailFromAddress?: string | null }

async function send(to: string, subject: string, html: string, from?: FromIdentity | null) {
  if (!env.RESEND_API_KEY) {
    console.warn('[Email] RESEND_API_KEY not set — skipping email to', to)
    return
  }
  const fromName = from?.emailFromName ?? env.EMAIL_FROM_NAME
  const fromAddress = from?.emailFromAddress ?? env.EMAIL_FROM
  const { error } = await resend.emails.send({
    from: `${fromName} <${fromAddress}>`,
    to,
    subject,
    html,
  })
  if (error) throw new Error(`Resend error: ${error.message}`)
}

// ─── Base layout ──────────────────────────────────────────────────────────────

function layout(storeName: string, primaryColor: string, content: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${storeName}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr><td style="background:${primaryColor};border-radius:12px 12px 0 0;padding:28px 40px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">${storeName}</h1>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#ffffff;padding:40px;border-radius:0 0 12px 12px;">
          ${content}
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:24px 40px;text-align:center;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">
            © ${new Date().getFullYear()} ${storeName}. All rights reserved.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function itemsTable(items: { title: string; variantTitle: string; quantity: number; price: number; imageUrl?: string | null }[], currency: string) {
  const rows = items.map((item) => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;vertical-align:top;">
        ${item.imageUrl ? `<img src="${item.imageUrl}" width="48" height="48" style="border-radius:6px;object-fit:cover;display:block;" />` : ''}
      </td>
      <td style="padding:12px 0 12px 12px;border-bottom:1px solid #f3f4f6;vertical-align:top;">
        <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#111827;">${item.title}</p>
        ${item.variantTitle !== 'Default' ? `<p style="margin:0;font-size:13px;color:#6b7280;">${item.variantTitle}</p>` : ''}
        <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Qty: ${item.quantity}</p>
      </td>
      <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;vertical-align:top;text-align:right;font-size:14px;font-weight:600;color:#111827;white-space:nowrap;">
        ${fmt(item.price * item.quantity, currency)}
      </td>
    </tr>`).join('')

  return `<table width="100%" cellpadding="0" cellspacing="0">${rows}</table>`
}

function totalsBlock(subtotal: number, discountAmount: number, shippingAmount: number, total: number, currency: string) {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
      <tr>
        <td style="padding:4px 0;color:#6b7280;font-size:13px;">Subtotal</td>
        <td style="padding:4px 0;color:#374151;font-size:13px;text-align:right;">${fmt(subtotal, currency)}</td>
      </tr>
      ${discountAmount > 0 ? `
      <tr>
        <td style="padding:4px 0;color:#059669;font-size:13px;">Discount</td>
        <td style="padding:4px 0;color:#059669;font-size:13px;text-align:right;">−${fmt(discountAmount, currency)}</td>
      </tr>` : ''}
      <tr>
        <td style="padding:4px 0;color:#6b7280;font-size:13px;">Shipping</td>
        <td style="padding:4px 0;color:#374151;font-size:13px;text-align:right;">${shippingAmount === 0 ? 'Free' : fmt(shippingAmount, currency)}</td>
      </tr>
      <tr>
        <td style="padding:12px 0 0;color:#111827;font-size:15px;font-weight:700;border-top:2px solid #f3f4f6;">Total</td>
        <td style="padding:12px 0 0;color:#111827;font-size:15px;font-weight:700;text-align:right;border-top:2px solid #f3f4f6;">${fmt(total, currency)}</td>
      </tr>
    </table>`
}

function addressBlock(addr: any) {
  return `${addr.firstName} ${addr.lastName}<br/>
    ${addr.address1}${addr.address2 ? ', ' + addr.address2 : ''}<br/>
    ${addr.city}${addr.province ? ', ' + addr.province : ''} ${addr.postalCode}<br/>
    ${addr.country}`
}

// ─── Order confirmation ────────────────────────────────────────────────────────

export async function sendOrderConfirmationEmail(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      customer: { select: { email: true, firstName: true } },
      store: { select: { name: true, primaryColor: true, currency: true, emailFromName: true, emailFromAddress: true } },
    },
  })
  if (!order) return

  const to = order.customer?.email ?? order.guestEmail
  if (!to) return

  const storeName = order.store?.name ?? env.EMAIL_FROM_NAME
  const primaryColor = order.store?.primaryColor ?? '#111827'
  const currency = order.store?.currency ?? 'USD'
  const firstName = order.customer?.firstName ?? 'there'
  const addr = order.shippingAddress as any

  const content = `
    <h2 style="margin:0 0 6px;font-size:24px;font-weight:700;color:#111827;">Order confirmed!</h2>
    <p style="margin:0 0 28px;color:#6b7280;font-size:15px;">Hi ${firstName}, thank you for your order. We'll let you know when it ships.</p>

    <div style="background:#f9fafb;border-radius:8px;padding:16px 20px;margin-bottom:28px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="color:#6b7280;font-size:13px;">Order number</td>
          <td style="color:#111827;font-size:13px;font-weight:600;text-align:right;">#${order.orderNumber}</td>
        </tr>
        <tr>
          <td style="color:#6b7280;font-size:13px;padding-top:4px;">Date</td>
          <td style="color:#111827;font-size:13px;text-align:right;padding-top:4px;">${formatDate(order.createdAt)}</td>
        </tr>
      </table>
    </div>

    <h3 style="margin:0 0 16px;font-size:14px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:0.5px;">Items ordered</h3>
    ${itemsTable(order.items.map((i) => ({ ...i, imageUrl: i.imageUrl })), currency)}
    ${totalsBlock(order.subtotal, order.discountAmount, order.shippingAmount, order.total, currency)}

    <div style="margin-top:32px;padding-top:24px;border-top:1px solid #f3f4f6;">
      <h3 style="margin:0 0 8px;font-size:14px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:0.5px;">Shipping to</h3>
      <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">${addressBlock(addr)}</p>
    </div>`

  await send(to, `Order #${order.orderNumber} confirmed — ${storeName}`, layout(storeName, primaryColor, content), order.store)
}

// ─── Shipping notification ─────────────────────────────────────────────────────

// Takes a SupplierOrder id, not an Order id — an order can ship as more than one parcel now,
// each with its own tracking number, so this sends one email per parcel.
export async function sendShippingEmail(supplierOrderId: string) {
  const supplierOrder = await prisma.supplierOrder.findUnique({
    where: { id: supplierOrderId },
    include: {
      items: { select: { title: true, quantity: true } },
      order: {
        include: {
          customer: { select: { email: true, firstName: true } },
          store: { select: { name: true, primaryColor: true, currency: true, emailFromName: true, emailFromAddress: true } },
          supplierOrders: { select: { id: true } },
        },
      },
    },
  })
  if (!supplierOrder || !supplierOrder.trackingNumber) return
  const order = supplierOrder.order

  const to = order.customer?.email ?? order.guestEmail
  if (!to) return

  const storeName = order.store?.name ?? env.EMAIL_FROM_NAME
  const primaryColor = order.store?.primaryColor ?? '#111827'
  const firstName = order.customer?.firstName ?? 'there'

  const trackingBtn = supplierOrder.trackingUrl
    ? `<a href="${supplierOrder.trackingUrl}" style="display:inline-block;margin-top:20px;padding:12px 24px;background:${primaryColor};color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">Track my order</a>`
    : ''

  const multiParcelNote = order.supplierOrders.length > 1
    ? `<p style="margin:0 0 20px;color:#6b7280;font-size:14px;">This order is shipping in ${order.supplierOrders.length} separate parcels — this email covers the one below.</p>`
    : ''

  const itemsList = supplierOrder.items.map((i) => `${i.quantity}× ${i.title}`).join(', ')

  const content = `
    <h2 style="margin:0 0 6px;font-size:24px;font-weight:700;color:#111827;">Your order is on its way!</h2>
    <p style="margin:0 0 12px;color:#6b7280;font-size:15px;">Hi ${firstName}, great news — part of your order #${order.orderNumber} has been shipped: ${itemsList}.</p>
    ${multiParcelNote}

    <div style="background:#f9fafb;border-radius:8px;padding:20px;margin-bottom:28px;">
      <p style="margin:0 0 6px;font-size:13px;color:#6b7280;">Tracking number</p>
      <p style="margin:0;font-size:18px;font-weight:700;color:#111827;font-family:monospace;">${supplierOrder.trackingNumber}</p>
      ${trackingBtn}
    </div>

    <p style="margin:0;font-size:14px;color:#6b7280;">
      If you have any questions about your order, just reply to this email.
    </p>`

  await send(to, `Your order #${order.orderNumber} has shipped — ${storeName}`, layout(storeName, primaryColor, content), order.store)
}

// ─── Abandoned cart recovery ───────────────────────────────────────────────────

export async function sendAbandonedCartEmails() {
  const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000) // 3 hours ago
  const carts = await prisma.abandonedCart.findMany({
    where: { reminderSentAt: null, recoveredAt: null, createdAt: { lte: cutoff } },
  })

  for (const cart of carts) {
    try {
      const data = cart.cartData as any
      const primaryColor = '#111827'
      const items: { title: string; price: number; imageUrl?: string }[] = data.items ?? []

      if (items.length === 0) continue

      const store = cart.storeId
        ? await prisma.store.findUnique({ where: { id: cart.storeId }, select: { name: true, currency: true, emailFromName: true, emailFromAddress: true } })
        : await prisma.store.findFirst({ select: { name: true, currency: true, emailFromName: true, emailFromAddress: true } })
      const storeName = store?.name ?? env.EMAIL_FROM_NAME
      const currency = store?.currency ?? 'USD'

      const itemsHtml = items.map((item) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;">
            ${item.imageUrl ? `<img src="${item.imageUrl}" width="40" height="40" style="border-radius:4px;vertical-align:middle;margin-right:10px;" />` : ''}
            <span style="font-size:14px;color:#111827;">${item.title}</span>
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;text-align:right;font-size:14px;color:#111827;">${fmt(item.price, currency)}</td>
        </tr>`).join('')

      const recoveryUrl = data.recoveryUrl ?? env.STORE_URL

      const content = `
        <h2 style="margin:0 0 6px;font-size:24px;font-weight:700;color:#111827;">You left something behind</h2>
        <p style="margin:0 0 28px;color:#6b7280;font-size:15px;">You added items to your cart but didn't complete your purchase. They're still waiting for you!</p>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">${itemsHtml}</table>

        <a href="${recoveryUrl}" style="display:inline-block;padding:14px 28px;background:${primaryColor};color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">
          Complete my purchase
        </a>`

      await send(cart.email, `You left something in your cart — ${storeName}`, layout(storeName, primaryColor, content), store)
      await prisma.abandonedCart.update({ where: { id: cart.id }, data: { reminderSentAt: new Date() } })
    } catch (err: any) {
      console.error(`[Email] Abandoned cart ${cart.id} failed:`, err.message)
    }
  }
}

// ─── Review invitation ────────────────────────────────────────────────────────

// `itemIds`, when given, restricts the invitation to just those items — used when a single
// parcel ships so items from a sibling (not-yet-shipped) parcel that already picked up a
// review token earlier don't get re-invited on every subsequent parcel's shipment.
export async function sendReviewInvitationEmail(orderId: string, itemIds?: string[]) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { select: { id: true, title: true, imageUrl: true, reviewToken: true } },
      customer: { select: { email: true, firstName: true } },
      store: { select: { name: true, primaryColor: true, emailFromName: true, emailFromAddress: true } },
    },
  })
  if (!order) return

  const to = order.customer?.email ?? order.guestEmail
  if (!to) return

  const storeName = order.store?.name ?? env.EMAIL_FROM_NAME
  const primaryColor = order.store?.primaryColor ?? '#111827'
  const firstName = order.customer?.firstName ?? 'there'

  const scopedItems = itemIds ? order.items.filter((i) => itemIds.includes(i.id)) : order.items
  const itemsWithTokens = scopedItems.filter((i) => i.reviewToken)
  if (itemsWithTokens.length === 0) return

  const reviewLinks = itemsWithTokens.map((item) => {
    const reviewUrl = `${env.STORE_URL}/en/review/${item.reviewToken}`
    return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;vertical-align:middle;">
          ${item.imageUrl ? `<img src="${item.imageUrl}" width="48" height="48" style="border-radius:6px;object-fit:cover;display:block;" />` : ''}
        </td>
        <td style="padding:12px 0 12px 12px;border-bottom:1px solid #f3f4f6;vertical-align:middle;">
          <p style="margin:0;font-size:14px;font-weight:600;color:#111827;">${item.title}</p>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;vertical-align:middle;text-align:right;">
          <a href="${reviewUrl}" style="display:inline-block;padding:8px 16px;background:${primaryColor};color:#ffffff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;">
            Write review
          </a>
        </td>
      </tr>`
  }).join('')

  const content = `
    <h2 style="margin:0 0 6px;font-size:24px;font-weight:700;color:#111827;">How was your order?</h2>
    <p style="margin:0 0 28px;color:#6b7280;font-size:15px;">
      Hi ${firstName}, we hope you're enjoying your purchase from order #${order.orderNumber}! We'd love to hear what you think.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      ${reviewLinks}
    </table>

    <p style="margin:0;font-size:13px;color:#9ca3af;">
      Each link is unique to your order and can only be used once.
    </p>`

  await send(to, `Share your thoughts on your purchase — ${storeName}`, layout(storeName, primaryColor, content), order.store)
}

// ─── Welcome email ─────────────────────────────────────────────────────────────

export async function sendWelcomeEmail(email: string, firstName?: string, storeId?: string) {
  const store = storeId
    ? await prisma.store.findUnique({ where: { id: storeId }, select: { name: true, primaryColor: true, emailFromName: true, emailFromAddress: true } })
    : await prisma.store.findFirst({ select: { name: true, primaryColor: true, emailFromName: true, emailFromAddress: true } })

  const storeName = store?.name ?? env.EMAIL_FROM_NAME
  const primaryColor = store?.primaryColor ?? '#111827'
  const name = firstName ? firstName : 'there'

  const content = `
    <h2 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827;">You're in! 🎉</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:15px;">
      Hi ${name}, welcome to the ${storeName} community. Thanks for subscribing!
    </p>
    <p style="margin:0 0 28px;color:#6b7280;font-size:15px;">
      You'll be the first to hear about new arrivals, exclusive deals, and tips we share on our blog.
    </p>
    <a href="${env.STORE_URL}" style="display:inline-block;padding:12px 28px;background:${primaryColor};color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">
      Shop now
    </a>`

  await send(email, `Welcome to ${storeName}!`, layout(storeName, primaryColor, content), store)
}

// ─── Damage claims ──────────────────────────────────────────────────────────

async function getClaimContext(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: { select: { email: true, firstName: true } },
      store: { select: { name: true, primaryColor: true, contactEmail: true, emailFromName: true, emailFromAddress: true } },
    },
  })
  if (!order) return null
  const to = order.customer?.email ?? order.guestEmail
  if (!to) return null
  return {
    order,
    to,
    storeName: order.store?.name ?? env.EMAIL_FROM_NAME,
    primaryColor: order.store?.primaryColor ?? '#111827',
    firstName: order.customer?.firstName ?? 'there',
  }
}

export async function sendClaimReceivedEmail(orderId: string) {
  const ctx = await getClaimContext(orderId)
  if (!ctx) return
  const { order, to, storeName, primaryColor, firstName } = ctx

  const content = `
    <h2 style="margin:0 0 6px;font-size:24px;font-weight:700;color:#111827;">We've got your report</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:15px;">
      Hi ${firstName}, thanks for letting us know about order #${order.orderNumber}. We're reviewing it now and will follow up shortly.
    </p>
    <p style="margin:0;font-size:14px;color:#6b7280;">
      No need to send the item back — we'll be in touch about next steps.
    </p>`

  await send(to, `We've received your report — order #${order.orderNumber}`, layout(storeName, primaryColor, content), order.store)
}

export async function sendClaimApprovedEmail(orderId: string, resolution: 'refund' | 'replacement', refundAmount?: number, currency?: string) {
  const ctx = await getClaimContext(orderId)
  if (!ctx) return
  const { order, to, storeName, primaryColor, firstName } = ctx

  const body = resolution === 'refund'
    ? `We've issued a refund of ${refundAmount != null ? fmt(refundAmount, currency ?? 'USD') : 'the affected amount'} for order #${order.orderNumber}. It should appear on your original payment method within 5–10 business days.`
    : `We're sending a replacement for order #${order.orderNumber} — no action needed on your end.`

  const content = `
    <h2 style="margin:0 0 6px;font-size:24px;font-weight:700;color:#111827;">Your report has been resolved</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:15px;">Hi ${firstName}, ${body}</p>
    <p style="margin:0;font-size:14px;color:#6b7280;">
      Sorry for the trouble, and thanks for your patience. No need to return the original item.
    </p>`

  await send(to, `Your order #${order.orderNumber} — resolved`, layout(storeName, primaryColor, content), order.store)
}

export async function sendClaimDeniedEmail(orderId: string, reason: string) {
  const ctx = await getClaimContext(orderId)
  if (!ctx) return
  const { order, to, storeName, primaryColor, firstName } = ctx

  const content = `
    <h2 style="margin:0 0 6px;font-size:24px;font-weight:700;color:#111827;">Update on your report</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:15px;">
      Hi ${firstName}, we've reviewed your report for order #${order.orderNumber} and aren't able to approve a refund or replacement at this time.
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:#374151;">${reason}</p>
    <p style="margin:0;font-size:14px;color:#6b7280;">
      If you think this is a mistake, just reply to this email and we'll take another look.
    </p>`

  await send(to, `Update on your order #${order.orderNumber}`, layout(storeName, primaryColor, content), order.store)
}

// Notifies the store owner when a claim needs manual review (AI wasn't confident).
export async function sendClaimAdminAlertEmail(orderId: string, claimId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { store: { select: { name: true, primaryColor: true, contactEmail: true, emailFromName: true, emailFromAddress: true } } },
  })
  if (!order?.store?.contactEmail) return

  const storeName = order.store.name ?? env.EMAIL_FROM_NAME
  const primaryColor = order.store.primaryColor ?? '#111827'
  const adminUrl = `${env.ADMIN_URL}/claims/${claimId}`

  const content = `
    <h2 style="margin:0 0 6px;font-size:24px;font-weight:700;color:#111827;">A claim needs your review</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:15px;">
      Order #${order.orderNumber} has a damage report the AI assistant wasn't confident enough to resolve on its own.
    </p>
    <a href="${adminUrl}" style="display:inline-block;padding:12px 24px;background:${primaryColor};color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">
      Review claim
    </a>`

  await send(order.store.contactEmail, `Claim needs review — order #${order.orderNumber}`, layout(storeName, primaryColor, content), order.store)
}

// ─── Fulfillment failure alert ────────────────────────────────────────────────

// Notifies the store owner when a CJ/AliExpress parcel has exhausted every automatic
// retry attempt (see supplierOrderFulfillment.ts's backoff schedule) and needs a human
// to look at it — retry by hand, switch it to manual fulfillment, or contact the supplier.
export async function sendFulfillmentFailureAlertEmail(supplierOrderId: string) {
  const so = await prisma.supplierOrder.findUnique({
    where: { id: supplierOrderId },
    include: {
      order: { include: { store: { select: { name: true, primaryColor: true, contactEmail: true, emailFromName: true, emailFromAddress: true } } } },
    },
  })
  if (!so?.order.store?.contactEmail) return

  const storeName = so.order.store.name ?? env.EMAIL_FROM_NAME
  const primaryColor = so.order.store.primaryColor ?? '#111827'
  const adminUrl = `${env.ADMIN_URL}/fulfillment-queue`
  const supplierLabel = so.supplierKey === 'CJ' ? 'CJ Dropshipping' : 'AliExpress'

  const content = `
    <h2 style="margin:0 0 6px;font-size:24px;font-weight:700;color:#111827;">A parcel needs your attention</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:15px;">
      Order #${so.order.orderNumber}'s ${supplierLabel} parcel failed to submit after ${so.attempts} automatic attempts and has stopped retrying.
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:#374151;">Last error: ${so.lastError ?? 'unknown'}</p>
    <a href="${adminUrl}" style="display:inline-block;padding:12px 24px;background:${primaryColor};color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">
      Open Fulfillment Queue
    </a>`

  await send(so.order.store.contactEmail, `Action needed: parcel failed — order #${so.order.orderNumber}`, layout(storeName, primaryColor, content), so.order.store)
}
