import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { StoreProvider } from '@/stores/storeContext'
import Login from '@/pages/Login'
import AdminLayout from '@/layouts/AdminLayout'
import Dashboard from '@/pages/Dashboard'
import ProductList from '@/pages/products/ProductList'
import ProductForm from '@/pages/products/ProductForm'
import OrderList from '@/pages/orders/OrderList'
import OrderDetail from '@/pages/orders/OrderDetail'
import CustomerList from '@/pages/customers/CustomerList'
import CustomerDetail from '@/pages/customers/CustomerDetail'
import DiscountList from '@/pages/discounts/DiscountList'
import Settings from '@/pages/settings/Settings'
import Themes from '@/pages/themes/Themes'
import ThemeTranslations from '@/pages/themes/ThemeTranslations'
import ImportProducts from '@/pages/supplier/ImportProducts'
import Stores from '@/pages/stores/Stores'
import BlogList from '@/pages/blog/BlogList'
import BlogEditor from '@/pages/blog/BlogEditor'
import ReviewList from '@/pages/reviews/ReviewList'
import CategoryList from '@/pages/categories/CategoryList'
import SubscriberList from '@/pages/subscribers/SubscriberList'
import SyncAlerts from '@/pages/sync/SyncAlerts'
import SetupAssistant from '@/pages/setup-assistant/SetupAssistant'
import StoreHealth from '@/pages/store-health/StoreHealth'
import ClaimsList from '@/pages/claims/ClaimsList'
import ClaimDetail from '@/pages/claims/ClaimDetail'
import FulfillmentQueue from '@/pages/fulfillment/FulfillmentQueue'
import Integrations from '@/pages/integrations/Integrations'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token, admin, fetchMe } = useAuthStore()

  useEffect(() => {
    if (token && !admin) fetchMe()
  }, [token, admin, fetchMe])

  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <StoreProvider>
                <AdminLayout />
              </StoreProvider>
            </RequireAuth>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="setup-assistant" element={<SetupAssistant />} />
          <Route path="store-health" element={<StoreHealth />} />
          <Route path="products" element={<ProductList />} />
          <Route path="products/:id" element={<ProductForm />} />
          <Route path="orders" element={<OrderList />} />
          <Route path="orders/:id" element={<OrderDetail />} />
          <Route path="fulfillment-queue" element={<FulfillmentQueue />} />
          <Route path="claims" element={<ClaimsList />} />
          <Route path="claims/:id" element={<ClaimDetail />} />
          <Route path="customers" element={<CustomerList />} />
          <Route path="customers/:id" element={<CustomerDetail />} />
          <Route path="discounts" element={<DiscountList />} />
          <Route path="themes" element={<Themes />} />
          <Route path="themes/:slug/translations" element={<ThemeTranslations />} />
          <Route path="supplier/import" element={<ImportProducts />} />
          <Route path="integrations" element={<Integrations />} />
          <Route path="settings" element={<Settings />} />
          <Route path="stores" element={<Stores />} />
          <Route path="blog" element={<BlogList />} />
          <Route path="blog/:id" element={<BlogEditor />} />
          <Route path="reviews" element={<ReviewList />} />
          <Route path="categories" element={<CategoryList />} />
          <Route path="subscribers" element={<SubscriberList />} />
          <Route path="sync" element={<SyncAlerts />} />
          <Route path="*" element={<div className="p-6 text-muted-foreground">Coming soon…</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
