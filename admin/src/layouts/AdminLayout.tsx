import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import {
  LayoutDashboard, Package, ShoppingCart, Users, Tag,
  Settings, LogOut, Store, ChevronRight, Palette, PackagePlus, PenLine, MessageSquare, FolderTree, Mail, RefreshCw, Sparkles, Gauge, AlertTriangle, Truck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import StoreSwitcher from '@/components/StoreSwitcher'
import { api } from '@/lib/api'

const nav: { to: string; icon: any; label: string; end?: boolean; badge?: boolean }[] = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/setup-assistant', icon: Sparkles, label: 'Setup Assistant' },
  { to: '/store-health', icon: Gauge, label: 'Store Health' },
  { to: '/products', icon: Package, label: 'Products' },
  { to: '/categories', icon: FolderTree, label: 'Categories' },
  { to: '/supplier/import', icon: PackagePlus, label: 'Import' },
  { to: '/sync', icon: RefreshCw, label: 'Sync', badge: true },
  { to: '/orders', icon: ShoppingCart, label: 'Orders' },
  { to: '/fulfillment-queue', icon: Truck, label: 'Fulfillment Queue', badge: true },
  { to: '/claims', icon: AlertTriangle, label: 'Claims', badge: true },
  { to: '/customers', icon: Users, label: 'Customers' },
  { to: '/discounts', icon: Tag, label: 'Discounts' },
  { to: '/reviews', icon: MessageSquare, label: 'Reviews' },
  { to: '/subscribers', icon: Mail, label: 'Subscribers' },
  { to: '/blog', icon: PenLine, label: 'Blog' },
  { to: '/themes', icon: Palette, label: 'Themes' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export default function AdminLayout() {
  const { admin, logout } = useAuthStore()
  const navigate = useNavigate()
  const [syncAlertCount, setSyncAlertCount] = useState(0)
  const [claimsCount, setClaimsCount] = useState(0)
  const [fulfillmentCount, setFulfillmentCount] = useState(0)

  useEffect(() => {
    const poll = () => {
      api.get('/api/admin/sync/alerts/count').then((res) => setSyncAlertCount(res.data.data.count)).catch(() => {})
      api.get('/api/admin/claims/needs-review/count').then((res) => setClaimsCount(res.data.data.count)).catch(() => {})
      api.get('/api/admin/fulfillment-queue/count').then((res) => setFulfillmentCount(res.data.data.count)).catch(() => {})
    }
    poll()
    const interval = setInterval(poll, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const badgeCount: Record<string, number> = { '/sync': syncAlertCount, '/claims': claimsCount, '/fulfillment-queue': fulfillmentCount }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-60 bg-white border-r flex flex-col">
        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-black rounded-lg flex items-center justify-center">
              <Store className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-sm">Store Admin</span>
          </div>
        </div>

        {/* Store switcher */}
        <div className="border-b pt-2">
          <StoreSwitcher />
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-0.5">
          {nav.map(({ to, icon: Icon, label, end, badge }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )
              }
            >
              <Icon className="w-4 h-4" />
              {label}
              {badge && badgeCount[to] > 0 && (
                <span className="ml-auto bg-amber-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {badgeCount[to] > 9 ? '9+' : badgeCount[to]}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Admin info + logout */}
        <div className="p-3 border-t">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg">
            <div className="w-7 h-7 bg-gray-200 rounded-full flex items-center justify-center text-xs font-semibold">
              {admin?.firstName?.[0] || 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{admin?.firstName} {admin?.lastName}</p>
              <p className="text-xs text-muted-foreground truncate">{admin?.role}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout} className="h-7 w-7 shrink-0">
              <LogOut className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
