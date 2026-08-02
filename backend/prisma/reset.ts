import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../.env') })

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const TABLES = [
  'Store', 'Theme', 'Admin', 'Category', 'Product', 'ProductImage',
  'ProductOption', 'ProductOptionValue', 'ProductVariant', 'Customer',
  'CustomerAddress', 'Cart', 'CartItem', 'Discount', 'Order', 'OrderItem',
  'OrderTimeline', 'Refund', 'ShippingZone', 'ShippingRate',
  'EmailSubscriber', 'AbandonedCart', 'AnalyticsEvent', 'Page', 'Asset',
  'Review', 'BlogPost',
]

async function main() {
  const quoted = TABLES.map((t) => `"${t}"`).join(', ')
  console.log('Truncating all tables:', TABLES.join(', '))
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE;`)
  console.log('Database wiped clean.')
}

main().catch(console.error).finally(() => prisma.$disconnect())
