import { useStoreContext } from '@/stores/storeContext'
import { Store, ChevronDown, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

export default function StoreSwitcher() {
  const { stores, activeStore, switchStore } = useStoreContext()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (!activeStore) return null

  return (
    <div ref={ref} className="relative px-3 pb-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors text-left"
      >
        <div className="w-6 h-6 bg-indigo-100 rounded flex items-center justify-center shrink-0">
          <Store className="w-3.5 h-3.5 text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate">{activeStore.name}</p>
          <p className="text-[10px] text-muted-foreground">{activeStore.currency} · {activeStore.shipToCountry}</p>
        </div>
        <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform shrink-0', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-3 right-3 top-full mt-1 bg-white border rounded-lg shadow-lg z-50 overflow-hidden">
          {stores.map((s) => (
            <button
              key={s.id}
              onClick={() => { switchStore(s.id); setOpen(false) }}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 transition-colors',
                s.id === activeStore.id && 'bg-indigo-50 text-indigo-700 font-medium'
              )}
            >
              <Store className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1 truncate">{s.name}</span>
              <span className="text-xs text-muted-foreground">{s.currency}</span>
            </button>
          ))}
          <div className="border-t">
            <button
              onClick={() => { navigate('/stores'); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-muted-foreground hover:bg-gray-50 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Manage stores
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
