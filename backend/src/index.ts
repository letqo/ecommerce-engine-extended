import app from './app'
import { env } from './config/env'
import { prisma } from './config/database'
import { seedBuiltInThemes } from './services/seedThemes'

// A bug in any single request handler (e.g. an unhandled promise rejection)
// must not take down the whole server for every other user.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason)
})
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err)
})

async function main() {
  try {
    await prisma.$connect()
    await prisma.$queryRaw`SELECT 1`
    console.log('✅ Connected to Neon (cloud PostgreSQL)')
  } catch (error) {
    console.error('❌ Neon connection failed:', error)
    console.error('Check DATABASE_URL in backend/.env')
    process.exit(1)
  }

  await seedBuiltInThemes()

  app.listen(Number(env.PORT), () => {
    console.log(`✅ Server: http://localhost:${env.PORT}`)
    console.log(`🗄️  Database: Neon cloud`)
    console.log(`🖼️  Storage: Cloudinary`)
    console.log(`📧 Email: Resend`)
  })

  // Register CJ webhooks (non-blocking)
  import('./services/cjWebhooks').then(({ registerCJWebhooks }) =>
    registerCJWebhooks().catch((e: Error) => console.error('CJ webhook registration error:', e.message))
  )

  // Abandoned cart recovery — runs every hour
  const ONE_HOUR = 60 * 60 * 1000
  setInterval(() => {
    import('./services/email').then(({ sendAbandonedCartEmails }) =>
      sendAbandonedCartEmails().catch((e: Error) => console.error('Abandoned cart job error:', e.message))
    )
  }, ONE_HOUR)

  // Supplier sync — daily safety fallback (CJ uses webhooks for real-time, this catches anything missed)
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000
  setInterval(() => {
    import('./services/supplierSync').then(({ runSupplierSync }) =>
      runSupplierSync().catch((e: Error) => console.error('Supplier sync job error:', e.message))
    )
  }, TWENTY_FOUR_HOURS)

  // Tracking sync — polls AliExpress for tracking (CJ uses webhooks), runs every 6 hours
  const SIX_HOURS = 6 * 60 * 60 * 1000
  setInterval(() => {
    import('./services/trackingSync').then(({ runTrackingSync }) =>
      runTrackingSync().catch((e: Error) => console.error('Tracking sync job error:', e.message))
    )
  }, SIX_HOURS)
}

main()
