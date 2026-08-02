import { Router, Response, NextFunction } from 'express'
import { prisma } from '../../config/database'
import { requireAdmin, AdminRequest } from '../../middleware/auth'

const router = Router()
router.use(requireAdmin)

// GET /api/admin/analytics/overview
router.get('/overview', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const sid = req.storeId
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)

    const [
      totalRevenue, monthRevenue, lastMonthRevenue,
      totalOrders, monthOrders, pendingOrders,
      totalCustomers, monthCustomers,
      totalProducts, activeProducts,
    ] = await Promise.all([
      prisma.order.aggregate({ where: { storeId: sid, paymentStatus: 'PAID' }, _sum: { total: true } }),
      prisma.order.aggregate({ where: { storeId: sid, paymentStatus: 'PAID', createdAt: { gte: startOfMonth } }, _sum: { total: true } }),
      prisma.order.aggregate({ where: { storeId: sid, paymentStatus: 'PAID', createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } }, _sum: { total: true } }),
      prisma.order.count({ where: { storeId: sid } }),
      prisma.order.count({ where: { storeId: sid, createdAt: { gte: startOfMonth } } }),
      prisma.order.count({ where: { storeId: sid, status: { in: ['PENDING', 'CONFIRMED', 'PROCESSING'] } } }),
      prisma.customer.count({ where: { storeId: sid } }),
      prisma.customer.count({ where: { storeId: sid, createdAt: { gte: startOfMonth } } }),
      prisma.product.count({ where: { storeId: sid } }),
      prisma.product.count({ where: { storeId: sid, status: 'ACTIVE' } }),
    ])

    const monthRev = monthRevenue._sum.total || 0
    const lastRev = lastMonthRevenue._sum.total || 0
    const revenueGrowth = lastRev > 0 ? Math.round(((monthRev - lastRev) / lastRev) * 100) : null

    res.json({
      success: true,
      data: {
        revenue: { total: totalRevenue._sum.total || 0, thisMonth: monthRev, lastMonth: lastRev, growth: revenueGrowth },
        orders: { total: totalOrders, thisMonth: monthOrders, pending: pendingOrders },
        customers: { total: totalCustomers, thisMonth: monthCustomers },
        products: { total: totalProducts, active: activeProducts },
      },
    })
  } catch (err) { next(err) }
})

// GET /api/admin/analytics/revenue-chart
router.get('/revenue-chart', async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    const sid = req.storeId
    const days = parseInt(req.query.days as string) || 30
    const start = new Date(Date.now() - days * 86400000)

    const orders = await prisma.order.findMany({
      where: { storeId: sid, paymentStatus: 'PAID', createdAt: { gte: start } },
      select: { total: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })

    const byDay: Record<string, number> = {}
    for (let i = 0; i < days; i++) {
      const d = new Date(Date.now() - (days - 1 - i) * 86400000)
      byDay[d.toISOString().split('T')[0]] = 0
    }
    for (const o of orders) {
      const key = o.createdAt.toISOString().split('T')[0]
      if (byDay[key] !== undefined) byDay[key] += o.total
    }

    const chart = Object.entries(byDay).map(([date, revenue]) => ({ date, revenue: Math.round(revenue * 100) / 100 }))
    res.json({ success: true, data: chart })
  } catch (err) { next(err) }
})

export default router
