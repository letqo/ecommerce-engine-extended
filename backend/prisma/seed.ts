import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding Neon database...')

  await prisma.store.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      name: 'New Store',
      currency: 'USD',
      currencySymbol: '$',
      announcementText: 'Free shipping on orders over $50',
      announcementActive: true,
    },
  })

  const adminEmail = process.env.SEED_ADMIN_EMAIL
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url')
  if (!adminEmail) throw new Error('Set SEED_ADMIN_EMAIL before seeding (SEED_ADMIN_PASSWORD optional — a random one is generated and printed if omitted).')

  const hash = await bcrypt.hash(adminPassword, 12)
  await prisma.admin.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: hash,
      firstName: 'Admin',
      lastName: 'User',
      role: 'OWNER',
    },
  })
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log(`Generated admin password (save this now, it is not stored anywhere else): ${adminPassword}`)
  }

  for (const name of ['All Products', 'New Arrivals', 'Best Sellers', 'Sale']) {
    const slug = name.toLowerCase().replace(/\s+/g, '-')
    await prisma.category.upsert({
      where: { storeId_slug: { storeId: 'default', slug } },
      update: {},
      create: { name, slug, isVisible: true, storeId: 'default' },
    })
  }

  const zone = await prisma.shippingZone.create({
    data: { name: 'United States', countries: ['US'], storeId: 'default' },
  })
  await prisma.shippingRate.createMany({
    data: [
      { zoneId: zone.id, name: 'Standard', price: 4.99, estimatedDays: '7-15 days' },
      { zoneId: zone.id, name: 'Express', price: 14.99, estimatedDays: '3-7 days' },
      { zoneId: zone.id, name: 'Free Shipping', price: 0, minOrderAmount: 50, isFree: true, estimatedDays: '7-15 days' },
    ],
  })

  console.log('Seed complete.')
  console.log(`Admin login: ${adminEmail}`)
  console.log('Data is live in Neon — check neon.tech Tables tab')
}

main().catch(console.error).finally(() => prisma.$disconnect())
