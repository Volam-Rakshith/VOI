/** SystemStatus — live build/runtime diagnostics for the BLACK BOX dashboard. */

import { useEffect, useState } from 'react'
import { Badge, StatBlock } from '../ui/Layout.jsx'
import { Panel, PanelBody, PanelHeader } from '../ui/Panel.jsx'
import { BRAND } from '../../data/constants.js'
import { bankStats } from '../../lib/wordBank.js'
import { readAudit } from '../../lib/blackbox.js'
import { hasStrongRandom } from '../../utils/random.js'
import { storageAvailable } from '../../utils/storage.js'
import { backendStatus, isConfigured } from '../../lib/onlineService.js'
import { getSupabaseError } from '../../lib/supabase.js'

const timeAgo = (ts) => {
  const seconds = Math.round((Date.now() - ts) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`
  return `${Math.round(seconds / 3600)}h ago`
}

export function SystemStatus({ bank }) {
  const stats = bankStats(bank)
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  const [audit, setAudit] = useState(() => readAudit())

  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine)
      setAudit(readAudit())
    }
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    const id = setInterval(() => setAudit(readAudit()), 5000)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
      clearInterval(id)
    }
  }, [])

  const checks = [
    { label: 'Local storage', ok: storageAvailable(), detail: storageAvailable() ? 'read / write' : 'memory fallback' },
    { label: 'Strong RNG', ok: hasStrongRandom, detail: hasStrongRandom ? 'crypto.getRandomValues' : 'Math.random fallback' },
    { label: 'Network', ok: online, detail: online ? 'online' : 'offline' },
    {
      label: 'Supabase rooms',
      ok: isConfigured(),
      detail: (() => {
        const status = backendStatus()
        if (!status.configured) return 'not configured — see BACKEND'
        if (getSupabaseError()) return `client unavailable: ${getSupabaseError().slice(0, 60)}`
        return `${status.host} (${status.sourceLabel})`
      })(),
    },
  ]

  return (
    <div className="space-y-4">
      <Panel annotated>
        <PanelHeader title="SYSTEM STATUS" subtitle="Everything the client can verify about itself" right={<Badge tone={checks.every((c) => c.ok) ? 'emerald' : 'amber'}>{checks.every((c) => c.ok) ? 'nominal' : 'degraded'}</Badge>} />
        <PanelBody>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <StatBlock label="words" value={stats.words} />
            <StatBlock label="categories" value={stats.categories} tone="violet" />
            <StatBlock label="build" value={`v${BRAND.version}`} tone="magenta" />
            <StatBlock label="runtime" value={typeof window !== 'undefined' && window.innerWidth < 480 ? 'mobile' : 'desktop'} tone="violet" />
          </div>

          <ul className="mt-3 space-y-2">
            {checks.map((check) => (
              <li key={check.label} className="flex items-center justify-between gap-3 rounded-lg border border-violet-500/20 bg-black/25 px-3 py-2">
                <span className="flex items-center gap-2 text-[12px] text-violet-100/85">
                  <span className={`h-1.5 w-1.5 rounded-full ${check.ok ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  {check.label}
                </span>
                <span className="font-mono text-[10.5px] text-violet-200/55">{check.detail}</span>
              </li>
            ))}
          </ul>

          <div className="mt-4 grid grid-cols-3 gap-2.5">
            <StatBlock label="casual" value={stats.byDifficulty.easy || 0} />
            <StatBlock label="sharp" value={stats.byDifficulty.medium || 0} tone="violet" />
            <StatBlock label="vicious" value={stats.byDifficulty.hard || 0} tone="magenta" />
          </div>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="ACTIVITY LOG" subtitle="Local audit trail — the last 40 admin events" />
        <PanelBody>
          {audit.length ? (
            <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1 font-mono text-[10.5px]">
              {audit.map((entry, index) => (
                <li key={`${entry.ts}-${index}`} className="flex items-start gap-2 rounded border border-violet-500/15 bg-black/25 px-2.5 py-1.5">
                  <span className={entry.action.includes('failed') ? 'text-fuchsia-300' : 'text-emerald-300'}>
                    {entry.action.includes('failed') ? '✕' : '›'}
                  </span>
                  <span className="flex-1 text-violet-100/75">{entry.detail || entry.action}</span>
                  <span className="shrink-0 text-violet-200/40">{timeAgo(entry.ts)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-center font-mono text-[11px] text-violet-200/45">no events recorded yet</p>
          )}
        </PanelBody>
      </Panel>
    </div>
  )
}

export default SystemStatus
