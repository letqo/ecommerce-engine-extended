import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, CheckCircle2, XCircle, Info } from 'lucide-react'

type HealthSeverity = 'critical' | 'warning' | 'info'

interface HealthCheckResult {
  id: string
  category: string
  label: string
  severity: HealthSeverity
  status: 'pass' | 'fail'
  message: string
  affectedCount: number
  totalCount: number
  affectedItems?: { id: string; name: string }[]
}

interface HealthCategoryResult {
  category: string
  label: string
  score: number
  weight: number
  checks: HealthCheckResult[]
}

interface HealthAdvisory { id: string; message: string }

interface StoreHealthReport {
  storeId: string
  generatedAt: string
  overallScore: number
  blockers: HealthCheckResult[]
  categories: HealthCategoryResult[]
  advisories: HealthAdvisory[]
}

function scoreColor(score: number) {
  if (score >= 80) return 'text-green-600'
  if (score >= 50) return 'text-yellow-600'
  return 'text-red-600'
}

function scoreRingColor(score: number) {
  if (score >= 80) return '#16a34a'
  if (score >= 50) return '#ca8a04'
  return '#dc2626'
}

function ScoreRing({ score }: { score: number }) {
  const radius = 42
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  return (
    <div className="relative w-28 h-28 shrink-0">
      <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="8" />
        <circle
          cx="50" cy="50" r={radius} fill="none"
          stroke={scoreRingColor(score)} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
        />
      </svg>
      <div className={`absolute inset-0 flex items-center justify-center text-2xl font-bold ${scoreColor(score)}`}>
        {score}
      </div>
    </div>
  )
}

function CheckRow({ check }: { check: HealthCheckResult }) {
  const linkFor = (item: { id: string; name: string }) =>
    check.category === 'product_seo' ? `/products/${item.id}` : undefined

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          {check.status === 'pass' ? (
            <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
          )}
          <div>
            <p className="text-sm font-medium">{check.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{check.message}</p>
          </div>
        </div>
        <Badge variant={check.status === 'pass' ? 'success' : check.severity === 'critical' ? 'destructive' : 'warning'}>
          {check.severity}
        </Badge>
      </div>
      {check.status === 'fail' && check.affectedItems && check.affectedItems.length > 0 && (
        <div className="mt-2 ml-6 flex flex-wrap gap-1.5">
          {check.affectedItems.map((item) => {
            const href = linkFor(item)
            const content = <span className="text-xs px-2 py-0.5 rounded bg-muted hover:bg-muted/70">{item.name}</span>
            return href ? (
              <Link key={item.id} to={href}>{content}</Link>
            ) : (
              <span key={item.id}>{content}</span>
            )
          })}
          {check.affectedCount > check.affectedItems.length && (
            <span className="text-xs px-2 py-0.5 text-muted-foreground">
              +{check.affectedCount - check.affectedItems.length} more
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export default function StoreHealth() {
  const [report, setReport] = useState<StoreHealthReport | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/admin/store-health')
      .then((res) => setReport(res.data.data))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="p-6 space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-48" />)}
      </div>
    </div>
  )

  if (!report) return (
    <div className="p-6">
      <p className="text-sm text-muted-foreground">Couldn't load store health.</p>
    </div>
  )

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Store Health</h1>
        <p className="text-muted-foreground text-sm">Readiness and SEO checks — last checked {formatDate(report.generatedAt)}.</p>
      </div>

      <Card>
        <CardContent className="flex items-center gap-6 pt-6">
          <ScoreRing score={report.overallScore} />
          <div>
            <p className="text-sm text-muted-foreground">Overall readiness score</p>
            <p className={`text-lg font-semibold ${scoreColor(report.overallScore)}`}>
              {report.overallScore >= 80 ? 'Looking good' : report.overallScore >= 50 ? 'Needs attention' : 'Not ready'}
            </p>
          </div>
        </CardContent>
      </Card>

      {report.blockers.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-4 h-4" /> Blockers — fix these first
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {report.blockers.map((b) => (
              <p key={b.id} className="text-sm text-red-800">{b.message}</p>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {report.categories.map((cat) => (
          <Card key={cat.category}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">{cat.label}</CardTitle>
              <span className={`text-sm font-semibold ${scoreColor(cat.score)}`}>{cat.score}/100</span>
            </CardHeader>
            <CardContent className="divide-y">
              {cat.checks.map((c) => <CheckRow key={c.id} check={c} />)}
            </CardContent>
          </Card>
        ))}
      </div>

      {report.advisories.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Info className="w-4 h-4" /> Advisories
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {report.advisories.map((a) => (
              <p key={a.id} className="text-sm text-muted-foreground">{a.message}</p>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
