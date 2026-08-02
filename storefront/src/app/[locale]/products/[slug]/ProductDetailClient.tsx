'use client'
import { Suspense, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { useRouter } from '@/i18n/navigation'
import Image from 'next/image'
import { useTranslations, useLocale } from 'next-intl'
import { api } from '@/lib/api'
import { formatPrice } from '@/lib/utils'
import { useCurrency } from '@/lib/currency'
import { useCartStore } from '@/stores/cartStore'
import { ShoppingBag, Heart, Play, Truck } from 'lucide-react'
import ReviewSection from '@/components/ReviewSection'
import RelatedProducts from '@/components/RelatedProducts'
import RecentlyViewed from '@/components/RecentlyViewed'
import ShareButtons from '@/components/ShareButtons'
import Breadcrumbs from '@/components/Breadcrumbs'
import { useWishlistStore } from '@/stores/wishlistStore'
import { useRecentlyViewedStore } from '@/stores/recentlyViewedStore'

interface Variant {
  id: string
  title: string
  sku?: string | null
  price: number
  compareAtPrice?: number | null
  inventoryQty: number
  trackInventory: boolean
  allowBackorder: boolean
  isDefault: boolean
  options: Record<string, string>
  imageUrl?: string | null
}

interface Product {
  id: string
  title: string
  slug: string
  description?: string | null
  videoUrl?: string | null
  images: { url: string; altText?: string | null }[]
  variants: Variant[]
  listVariantsIndividually?: boolean
  deliveryMinDays?: number | null
  deliveryMaxDays?: number | null
  category?: { name: string; slug: string } | null
}

type DetailLayout = 'side-by-side' | 'stacked' | 'gallery-sticky'

function ProductDetailInner() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug ?? ''
  const searchParams = useSearchParams()
  const pinnedVariantId = searchParams?.get('variant') ?? null
  const router = useRouter()
  const t = useTranslations('product')
  const locale = useLocale()
  const currency = useCurrency()
  const addItem = useCartStore((s) => s.addItem)
  const wishlist = useWishlistStore()
  const addRecentlyViewed = useRecentlyViewedStore((s) => s.add)

  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedImage, setSelectedImage] = useState(0)
  const [variantImageUrl, setVariantImageUrl] = useState<string | null>(null)
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null)
  const [mounted, setMounted] = useState(false)
  const [showVideo, setShowVideo] = useState(false)
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)
  const [layout, setLayout] = useState<DetailLayout>('side-by-side')

  useEffect(() => {
    setMounted(true)
    const bodyLayout = document.body.dataset.productDetail as DetailLayout | undefined
    if (bodyLayout && ['side-by-side', 'stacked', 'gallery-sticky'].includes(bodyLayout)) {
      setLayout(bodyLayout)
    }
  }, [])

  useEffect(() => {
    api
      .get<{ success: boolean; data: Product }>(`/store/products/${slug}`, locale)
      .then((res) => {
        const p = res.data
        setProduct(p)
        const pinned = pinnedVariantId ? p.variants?.find((v) => v.id === pinnedVariantId) : null
        const def = pinned ?? p.variants?.find((v) => v.isDefault) ?? p.variants?.[0]
        if (def) setSelectedVariant(def)
        addRecentlyViewed({
          productId: p.id,
          slug: p.slug,
          title: p.title,
          image: p.images[0]?.url ?? '',
          price: def?.price ?? p.variants[0]?.price ?? 0,
          compareAtPrice: def?.compareAtPrice ?? p.variants[0]?.compareAtPrice,
        })
      })
      .catch(() => router.push('/products'))
      .finally(() => setLoading(false))
  }, [slug])

  const isStacked = layout === 'stacked'
  const isGallery = layout === 'gallery-sticky'

  if (loading) {
    return (
      <div className={`max-w-7xl mx-auto px-4 py-16 ${
        isStacked ? 'flex flex-col items-center gap-8' : 'grid grid-cols-1 md:grid-cols-2 gap-12'
      }`}>
        <div className={`bg-gray-100 rounded-2xl animate-pulse ${
          isStacked ? 'w-full max-w-2xl aspect-[4/3]' : 'aspect-square'
        }`} />
        <div className={`space-y-4 pt-4 ${isStacked ? 'w-full max-w-xl text-center' : ''}`}>
          <div className="h-8 bg-gray-100 rounded animate-pulse w-3/4" />
          <div className="h-6 bg-gray-100 rounded animate-pulse w-1/4" />
          <div className="h-32 bg-gray-100 rounded animate-pulse" />
        </div>
      </div>
    )
  }

  if (!product) return null

  const price = selectedVariant?.price ?? 0
  const compareAt = selectedVariant?.compareAtPrice
  const tracksInventory = selectedVariant?.trackInventory ?? true
  const inStock = !tracksInventory || (selectedVariant?.inventoryQty ?? 0) > 0 || selectedVariant?.allowBackorder

  const variantLabel = (v: Variant) => Object.values(v.options).join(' / ') || v.title

  const handleAddToCart = () => {
    if (!selectedVariant || !product) return
    addItem({
      variantId: selectedVariant.id,
      productId: product.id,
      name: product.title,
      image: product.images[0]?.url ?? '',
      price,
      quantity: qty,
      variant: Object.entries(selectedVariant.options).map(([k, v]) => `${k}: ${v}`).join(', ') || selectedVariant.title,
      deliveryMinDays: product.deliveryMinDays ?? undefined,
      deliveryMaxDays: product.deliveryMaxDays ?? undefined,
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  const imageSection = isGallery ? (
    <div className="space-y-4">
      {product.images.map((img, i) => (
        <div key={i} className="rounded-2xl overflow-hidden bg-gray-100">
          <Image
            src={img.url}
            alt={img.altText ?? product.title}
            width={600}
            height={600}
            className="w-full h-auto object-cover"
          />
        </div>
      ))}
      {product.videoUrl && (
        <div className="rounded-2xl overflow-hidden bg-black">
          <video src={product.videoUrl} controls className="w-full" />
        </div>
      )}
    </div>
  ) : (
    <div>
      <div className={`rounded-2xl overflow-hidden bg-gray-100 mb-4 relative ${
        isStacked ? 'w-full max-w-2xl aspect-[4/3]' : 'aspect-square'
      }`}>
        {showVideo && product.videoUrl ? (
          <video
            src={product.videoUrl}
            controls
            autoPlay
            className="w-full h-full object-contain bg-black"
          />
        ) : (
          <Image
            src={variantImageUrl ?? product.images[selectedImage]?.url ?? '/placeholder.jpg'}
            alt={product.images[selectedImage]?.altText ?? product.title}
            width={600}
            height={600}
            className="w-full h-full object-cover"
          />
        )}
      </div>
      {(product.images.length > 1 || product.videoUrl) && (
        <div className={`flex gap-3 overflow-x-auto pb-2 ${isStacked ? 'justify-center' : ''}`}>
          {product.videoUrl && (
            <button
              onClick={() => setShowVideo(true)}
              className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-colors flex items-center justify-center bg-gray-900 ${showVideo ? 'border-black' : 'border-transparent'}`}
            >
              <Play size={28} className="text-white" />
            </button>
          )}
          {product.images.map((img, i) => (
            <button
              key={i}
              onClick={() => { setSelectedImage(i); setShowVideo(false) }}
              className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-colors ${!showVideo && selectedImage === i ? 'border-black' : 'border-transparent'}`}
            >
              <Image src={img.url} alt="" width={80} height={80} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )

  const infoSection = (
    <div className={`flex flex-col ${isGallery ? 'md:sticky md:top-24 md:self-start' : ''} ${isStacked ? 'w-full max-w-xl text-center items-center' : ''}`}>
      <h1 className="text-3xl font-bold mb-3">{product.title}</h1>
      <div className={`flex items-baseline gap-3 mb-4 ${isStacked ? 'justify-center' : ''}`}>
        <span className="text-2xl font-bold">{formatPrice(price, currency)}</span>
        {compareAt != null && compareAt > 0 && compareAt > price && (
          <span className="text-lg text-gray-400 line-through">{formatPrice(compareAt, currency)}</span>
        )}
      </div>

      {tracksInventory && (
        (selectedVariant?.inventoryQty ?? 0) === 0
          ? <p className="text-red-500 text-sm font-medium mb-4">{t('outOfStock')}</p>
          : (selectedVariant?.inventoryQty ?? 0) <= 9
            ? <p className="text-orange-500 text-sm font-medium mb-4">{t('onlyLeft', { count: selectedVariant!.inventoryQty })}</p>
            : null
      )}

      {product.description && (
        <div
          className="text-gray-600 leading-relaxed mb-8 prose prose-sm max-w-none [&_img]:hidden"
          dangerouslySetInnerHTML={{ __html: product.description }}
        />
      )}

      {product.variants.length > 1 && !(product.listVariantsIndividually && pinnedVariantId) && (
        <div className="mb-6">
          <p className="text-sm font-medium mb-3">{t('options')}</p>
          <div className={`flex flex-wrap gap-2 ${isStacked ? 'justify-center' : ''}`}>
            {product.variants.map((v) => (
              <button
                key={v.id}
                onClick={() => {
                  setSelectedVariant(v)
                  setQty(1)
                  if (v.imageUrl) {
                    const idx = product.images.findIndex((img) => img.url === v.imageUrl)
                    if (idx !== -1) { setSelectedImage(idx); setVariantImageUrl(null) }
                    else setVariantImageUrl(v.imageUrl)
                  } else {
                    setVariantImageUrl(null)
                  }
                }}
                className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${selectedVariant?.id === v.id ? 'border-black bg-primary text-primary-text' : 'border-gray-300 hover:border-gray-500'}`}
              >
                {variantLabel(v)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={`flex items-center gap-4 mb-6 ${isStacked ? 'justify-center' : ''}`}>
        <div className="flex items-center border border-gray-300 rounded-lg">
          <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-10 h-10 flex items-center justify-center text-lg hover:bg-gray-50">−</button>
          <span className="w-12 text-center font-medium">{qty}</span>
          <button onClick={() => setQty((q) => q + 1)} className="w-10 h-10 flex items-center justify-center text-lg hover:bg-gray-50">+</button>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleAddToCart}
          disabled={!inStock}
          className="flex-1 bg-primary text-primary-text py-4 rounded-btn font-semibold text-lg flex items-center justify-center gap-2 hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ShoppingBag size={20} />
          {added ? t('added') : inStock ? t('addToCart') : t('outOfStock')}
        </button>
        <button
          onClick={() => {
            if (!product) return
            const inW = wishlist.has(product.id)
            if (inW) { wishlist.remove(product.id) } else {
              wishlist.add({
                productId: product.id,
                slug: product.slug,
                title: product.title,
                image: product.images[0]?.url ?? '',
                price,
                compareAtPrice: compareAt,
              })
            }
          }}
          className="w-14 flex items-center justify-center border border-gray-300 rounded-btn hover:border-gray-400 transition-colors"
          title={t('wishlist')}
        >
          <Heart
            size={22}
            className={mounted && product && wishlist.has(product.id) ? 'fill-red-500 text-red-500' : 'text-gray-600'}
          />
        </button>
      </div>
      <ShareButtons title={product.title} />

      {product.deliveryMinDays != null && product.deliveryMinDays > 0 && (() => {
        const now = new Date()
        const minDate = new Date(now.getTime() + product.deliveryMinDays! * 86400000)
        const maxDate = new Date(now.getTime() + (product.deliveryMaxDays ?? product.deliveryMinDays!) * 86400000)
        const fmt = (d: Date) => d.toLocaleDateString(locale, { month: 'long', day: 'numeric' })
        return (
          <div className={isStacked ? 'text-center' : ''}>
            <div className={`flex items-center gap-2 mt-5 text-sm text-gray-600 ${isStacked ? 'justify-center' : ''}`}>
              <Truck size={18} className="text-gray-400 flex-shrink-0" />
              <span>
                {t('delivery')}: <strong>{fmt(minDate)} – {fmt(maxDate)}</strong>
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">{t('deliveryEstimateNote')}</p>
          </div>
        )
      })()}
    </div>
  )

  return (
    <div data-theme-section="product-detail" data-variant={layout} className="theme-product-detail max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Breadcrumbs items={[
        { label: t('allProducts'), href: '/products' },
        ...(product.category ? [{ label: product.category.name, href: `/products?category=${product.category.slug}` }] : []),
        { label: product.title },
      ]} />

      <div className={
        isStacked
          ? 'flex flex-col items-center gap-8'
          : 'grid grid-cols-1 md:grid-cols-2 gap-12'
      }>
        {imageSection}
        {infoSection}
      </div>

      <ReviewSection productId={product.id} />
      <RelatedProducts slug={product.slug} />
      <RecentlyViewed excludeId={product.id} />
    </div>
  )
}

export default function ProductDetailClient() {
  return (
    <Suspense>
      <ProductDetailInner />
    </Suspense>
  )
}
