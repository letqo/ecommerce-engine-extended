import { useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { X, Wand2, Sparkles, Loader2 } from 'lucide-react'

interface ImageStudioProps {
  imageUrl: string
  onSave: (newUrl: string) => void
  onClose: () => void
}

const QUICK_ACTIONS = [
  { label: 'Lifestyle shots', prompt: 'Person using/wearing this product in 3 different lifestyle scenes, professional photography', mode: 'create' as const, count: 3 },
  { label: 'Different angles', prompt: 'Show this product from 3 different angles — front, side, and detail close-up. Clean professional product photography', mode: 'create' as const, count: 3 },
  { label: 'Clean on white', prompt: 'This product on a clean white background, professional studio lighting, centered', mode: 'create' as const, count: 1 },
  { label: 'Collage', prompt: 'One single image showing this product in 3 different lifestyle scenes side by side, professional product photography', mode: 'collage' as const, count: 1 },
  { label: 'Extract views', prompt: 'This image contains multiple views of a product. Identify every distinct angle or view shown. For each one, generate a separate clean standalone professional product photo — no text, no circles, no annotations, just the product from that angle on a clean background.', mode: 'extract' as const, count: 6 },
]

export default function ImageStudio({ imageUrl, onSave, onClose }: ImageStudioProps) {
  const [currentUrl, setCurrentUrl] = useState(imageUrl)
  const [processing, setProcessing] = useState(false)
  const [step, setStep] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [customPrompt, setCustomPrompt] = useState('')
  const [history, setHistory] = useState<string[]>([imageUrl])
  const [generatedImages, setGeneratedImages] = useState<string[]>([])
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)

  const pushImage = (url: string) => {
    setCurrentUrl(url)
    setHistory((h) => [...h, url])
  }

  const undo = () => {
    if (history.length <= 1) return
    const prev = history[history.length - 2]
    setCurrentUrl(prev)
    setHistory((h) => h.slice(0, -1))
  }

  const handleRemoveBg = async () => {
    setProcessing(true)
    setStep('Removing background…')
    setError('')
    try {
      const res = await api.post('/api/admin/image-studio/remove-bg', { imageUrl: currentUrl })
      pushImage(res.data.data.url)
    } catch (e: any) {
      setError(e.response?.data?.error?.message ?? 'Background removal failed')
    } finally {
      setProcessing(false)
      setStep(null)
    }
  }

  const handlePolish = async () => {
    setProcessing(true)
    setStep('Polishing image…')
    setError('')
    try {
      const res = await api.post('/api/admin/image-studio/polish', { imageUrl: currentUrl })
      pushImage(res.data.data.url)
    } catch (e: any) {
      setError(e.response?.data?.error?.message ?? 'Polish failed')
    } finally {
      setProcessing(false)
      setStep(null)
    }
  }

  const handleGenerate = async (prompt: string, mode: 'create' | 'extract' | 'collage' = 'create', count: number = 3) => {
    if (!prompt.trim()) return
    setProcessing(true)
    setStep('Generating… (this can take 15-30s)')
    setError('')
    setGeneratedImages([])
    setPreviewIndex(null)
    try {
      const res = await api.post('/api/admin/image-studio/generate-scene', { imageUrl: currentUrl, prompt: prompt.trim(), count, mode }, { timeout: 120000 })
      const urls: string[] = res.data.data.urls
      setGeneratedImages(urls)
      setPreviewIndex(0)
    } catch (e: any) {
      setError(e.response?.data?.error?.message ?? 'Generation failed')
    } finally {
      setProcessing(false)
      setStep(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <Wand2 className="w-5 h-5" />
            <h2 className="text-lg font-bold">Image Studio</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={processing}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-6">
            {/* Left: image preview */}
            <div className="space-y-3">
              <div className="aspect-square rounded-xl overflow-hidden bg-[repeating-conic-gradient(#f3f4f6_0%_25%,white_0%_50%)_0_0/20px_20px] border">
                <img src={previewIndex !== null && generatedImages[previewIndex] ? generatedImages[previewIndex] : currentUrl} alt="Working image" className="w-full h-full object-contain" />
              </div>

              {/* Progress / error */}
              {step && (
                <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {step}
                </div>
              )}
              {error && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              {/* Generated results */}
              {generatedImages.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {generatedImages.length} result{generatedImages.length > 1 ? 's' : ''} — click to preview
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {generatedImages.map((url, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setPreviewIndex(i)}
                        className={`aspect-square rounded-lg overflow-hidden border-2 transition-colors ${
                          previewIndex === i ? 'border-black ring-1 ring-black' : 'border-transparent hover:border-gray-400'
                        }`}
                      >
                        <img src={url} alt={`Result ${i + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    {previewIndex !== null && (
                      <Button size="sm" onClick={() => onSave(generatedImages[previewIndex])} disabled={processing}>
                        Save this one
                      </Button>
                    )}
                    {generatedImages.length > 1 && (
                      <Button size="sm" variant="outline" onClick={() => generatedImages.forEach(url => onSave(url))} disabled={processing}>
                        Save all
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => { setGeneratedImages([]); setPreviewIndex(null) }} disabled={processing}>
                      Dismiss
                    </Button>
                  </div>
                </div>
              )}

              {/* History / undo */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{history.length - 1} edit(s)</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={undo} disabled={processing || history.length <= 1}>
                    Undo
                  </Button>
                  <Button size="sm" onClick={() => onSave(currentUrl)} disabled={processing || currentUrl === imageUrl}>
                    Save to product
                  </Button>
                </div>
              </div>
            </div>

            {/* Right: tools */}
            <div className="space-y-5">
              {/* Remove BG + Polish */}
              <div className="border rounded-xl p-4 space-y-3">
                <h3 className="font-semibold text-sm">Quick tools</h3>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant="outline" onClick={handleRemoveBg} disabled={processing}>
                    <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                    Remove BG
                  </Button>
                  <Button size="sm" variant="outline" onClick={handlePolish} disabled={processing}>
                    Polish image
                  </Button>
                </div>
              </div>

              {/* AI Generate */}
              <div className="border rounded-xl p-4 space-y-3">
                <h3 className="font-semibold text-sm">AI Generate</h3>

                {/* Quick action buttons */}
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_ACTIONS.map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      onClick={() => handleGenerate(action.prompt, action.mode, action.count)}
                      disabled={processing}
                      className="px-2.5 py-1.5 text-xs rounded-lg border hover:bg-gray-100 disabled:opacity-50 transition-colors"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>

                {/* Optional prompt */}
                <div className="space-y-2">
                  <Textarea
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="Optional: describe what you want — e.g. &quot;woman wearing the bag at a beach&quot;, &quot;show front and back side by side&quot;, &quot;clean white background&quot;..."
                    rows={3}
                    className="text-sm"
                    disabled={processing}
                  />
                  <p className="text-[10px] text-muted-foreground">Leave empty and use a quick action above, or type your own instructions.</p>
                  <Button
                    size="sm"
                    onClick={() => handleGenerate(customPrompt, 'create', 3)}
                    disabled={processing || !customPrompt.trim()}
                    className="w-full"
                  >
                    Generate
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
