'use client'
import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import { Upload, X, CheckCircle2, TriangleAlert } from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'
const STORE_ID = process.env.NEXT_PUBLIC_STORE_ID ?? ''

const REASONS = [
  { value: 'damaged', label: 'Item arrived damaged' },
  { value: 'missing_parts', label: 'Missing parts' },
  { value: 'wrong_item', label: 'Wrong item received' },
  { value: 'never_arrived', label: 'Never arrived' },
]

export default function ReportIssuePage() {
  const params = useSearchParams()
  const [orderNumber, setOrderNumber] = useState(params?.get('order') ?? '')
  const [email, setEmail] = useState(params?.get('email') ?? '')
  const [reason, setReason] = useState('damaged')
  const [description, setDescription] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setError('')
    setUploading(true)
    try {
      const formData = new FormData()
      Array.from(files).slice(0, 6 - photos.length).forEach((f) => formData.append('files', f))
      const res = await fetch(`${API_URL}/store/claims/photos`, {
        method: 'POST',
        headers: STORE_ID ? { 'X-Store-Id': STORE_ID } : undefined,
        body: formData,
      })
      if (!res.ok) throw new Error('Upload failed — try a different photo')
      const json = await res.json()
      setPhotos((prev) => [...prev, ...json.data.urls].slice(0, 6))
    } catch (err: any) {
      setError(err.message ?? 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orderNumber.trim() || !email.trim() || !description.trim() || photos.length === 0) {
      setError('Please fill in every field and add at least one photo.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await api.post('/store/claims', {
        orderNumber: Number(orderNumber),
        email: email.trim(),
        reason,
        description: description.trim(),
        photos,
      })
      setDone(true)
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-16 text-center">
        <CheckCircle2 size={40} className="text-green-600 mx-auto mb-4" />
        <h1 className="text-xl font-bold mb-2">We've got your report</h1>
        <p className="text-gray-500 text-sm">
          We're reviewing it now and will email you shortly. No need to send the item back.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-2xl font-bold mb-2">Report a problem</h1>
      <p className="text-gray-500 mb-8 text-sm">
        Let us know what went wrong and add a few photos. No need to ship the item back — we'll follow up by email with next steps.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Order number</label>
            <input
              type="text" inputMode="numeric" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)}
              className="w-full h-11 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Email</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full h-11 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">What happened?</label>
          <select
            value={reason} onChange={(e) => setReason(e.target.value)}
            className="w-full h-11 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
          >
            {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Tell us more</label>
          <textarea
            value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
            placeholder="What's damaged or missing?"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Photos (up to 6)</label>
          <div className="flex flex-wrap gap-2">
            {photos.map((url, i) => (
              <div key={i} className="relative w-20 h-20">
                <img src={url} className="w-full h-full object-cover rounded-lg border border-gray-200" />
                <button
                  type="button"
                  onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute -top-1.5 -right-1.5 bg-gray-900 text-white rounded-full w-5 h-5 flex items-center justify-center"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            {photos.length < 6 && (
              <label className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 cursor-pointer hover:border-gray-400 text-xs gap-1">
                {uploading ? 'Uploading…' : <><Upload size={16} />Add</>}
                <input type="file" accept="image/*" multiple className="hidden" disabled={uploading} onChange={(e) => handleFiles(e.target.files)} />
              </label>
            )}
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || uploading}
          className="w-full h-11 bg-primary text-primary-text rounded-lg font-semibold text-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'Submit report'}
        </button>
      </form>
    </div>
  )
}
