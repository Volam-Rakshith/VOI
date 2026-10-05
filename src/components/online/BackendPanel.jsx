/**
 * BackendPanel — connect the app to a Supabase project without rebuilding.
 *
 * Used in two places:
 *   • the Online Room screen, behind a "Configure backend" button
 *   • BLACK BOX → BACKEND, for admins who want diagnostics
 *
 * Values are public by design (project URL + anon key). Whatever is saved here
 * is stored on this device only and takes effect immediately.
 */

import { useEffect, useMemo, useState } from 'react'
import { Button } from '../ui/Button.jsx'
import { Field } from '../ui/Controls.jsx'
import { Badge } from '../ui/Layout.jsx'
import { InlineNotice } from '../ui/Feedback.jsx'
import {
  clearStoredBackend,
  describeBackend,
  getActiveBackend,
  hasStoredBackend,
  readStoredBackend,
  validateBackendConfig,
  SOURCE_LABELS,
} from '../../lib/runtimeConfig.js'
import { testBackendConfig } from '../../lib/onlineService.js'

const EMPTY = { url: '', anonKey: '' }

export function BackendPanel({ onChanged = null, compact = false }) {
  const [status, setStatus] = useState(() => describeBackend())
  const [draft, setDraft] = useState(() => {
    const stored = readStoredBackend()
    const active = getActiveBackend()
    return { url: stored?.url || active.url || '', anonKey: stored?.anonKey || active.anonKey || '' }
  })
  const [errors, setErrors] = useState({})
  const [showKey, setShowKey] = useState(false)
  const [busy, setBusy] = useState(null)
  const [notice, setNotice] = useState(null)

  const refresh = (next = null) => {
    setStatus(next || describeBackend())
  }

  useEffect(() => {
    // Another part of the app may change configuration while this panel is open.
    if (notice?.tone === 'success') refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice])

  const dirty = useMemo(() => {
    const active = readStoredBackend() || getActiveBackend()
    return draft.url.trim() !== (active.url || '') || draft.anonKey.trim() !== (active.anonKey || '')
  }, [draft])

  const setField = (key, value) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined, general: undefined }))
    setNotice(null)
  }

  const handleTest = async () => {
    const validation = validateBackendConfig(draft)
    if (!validation.ok) {
      setErrors({ [validation.field || 'general']: validation.error })
      return
    }
    setBusy('test')
    setNotice(null)
    setErrors({})
    const result = await testBackendConfig(validation.value)
    setBusy(null)
    if (result.ok) setNotice({ tone: 'success', title: 'Connection works', message: result.detail })
    else setNotice({ tone: 'error', title: 'That did not connect', message: result.error })
  }

  const handleSave = async () => {
    const validation = validateBackendConfig(draft)
    if (!validation.ok) {
      setErrors({ [validation.field || 'general']: validation.error })
      return
    }
    setBusy('save')
    setErrors({})
    const result = await onChanged?.({ action: 'save', value: validation.value })
    setBusy(null)
    if (result && result.ok === false) {
      setNotice({ tone: 'error', title: 'Not saved', message: result.error })
      return
    }
    setNotice({
      tone: 'success',
      title: 'Backend connected',
      message: 'Saved on this device and applied immediately — no rebuild, no redeploy.',
    })
    refresh()
  }

  const handleClear = async () => {
    setBusy('clear')
    const result = await onChanged?.({ action: 'clear' })
    setBusy(null)
    setNotice({
      tone: 'info',
      title: 'Device values cleared',
      message:
        result && result.ok === false
          ? result.error
          : 'Falling back to runtime-config.json or the values baked into this build.',
    })
    setDraft({ url: getActiveBackend().url || '', anonKey: getActiveBackend().anonKey || '' })
    refresh()
  }

  return (
    <div className={compact ? 'space-y-4' : 'space-y-5'}>
      {/* Current status ---------------------------------------------------- */}
      <div className="rounded-2xl border border-violet-400/20 bg-violet-500/[0.07] p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={status.configured ? 'cyan' : 'magenta'}>
            {status.configured ? 'CONNECTED' : 'NOT CONNECTED'}
          </Badge>
          <span className="text-[11.5px] uppercase tracking-[0.18em] text-violet-100/60">
            source: {SOURCE_LABELS[status.source] || status.source}
          </span>
        </div>
        <dl className="mt-2.5 space-y-1 text-[12px] text-violet-100/75">
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-violet-200/45">Project</dt>
            <dd className="min-w-0 break-all font-mono text-[11.5px]">{status.url || '—'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-violet-200/45">Anon key</dt>
            <dd className="min-w-0 break-all font-mono text-[11.5px]">{status.keyHint || '—'}</dd>
          </div>
        </dl>
        {!status.storedOnDevice && status.fromBuild ? (
          <p className="mt-2.5 text-[11.5px] leading-relaxed text-violet-100/55">
            These came from the build. Pasting your own values below overrides them on this device —
            handy when you want to point at a different project without touching a config file.
          </p>
        ) : null}
      </div>

      {status.fileError ? (
        <InlineNotice tone="error">
          <strong className="font-bold">Config file ignored.</strong> {status.fileError} Fix it there, or save
          working values below — anything you save here takes priority.
        </InlineNotice>
      ) : null}

      {/* Form -------------------------------------------------------------- */}
      <div className="space-y-3.5">
        <Field
          label="Supabase project URL"
          placeholder="https://abcdefghijklm.supabase.co"
          value={draft.url}
          error={errors.url}
          autoComplete="off"
          spellCheck={false}
          inputMode="url"
          data-autofocus
          onChange={(event) => setField('url', event.target.value)}
          hint="Supabase → Project Settings → API → Project URL. A bare project ref also works."
        />

        <div className="relative">
          <Field
            label="Anon / publishable key"
            placeholder="eyJhbGciOiJIUzI1NiIs…"
            type={showKey ? 'text' : 'password'}
            value={draft.anonKey}
            error={errors.anonKey}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setField('anonKey', event.target.value)}
            hint="The public anon key — never the service-role key."
          />
          <button
            type="button"
            onClick={() => setShowKey((current) => !current)}
            className="absolute right-2.5 top-[30px] rounded-lg px-2 py-1 text-[11px] uppercase tracking-wider text-violet-200/70 hover:text-cyan-neon focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-neon"
            aria-pressed={showKey}
          >
            {showKey ? 'hide' : 'show'}
          </button>
        </div>

        {errors.general ? <p role="alert" className="text-[12px] font-semibold text-magenta-neon">{errors.general}</p> : null}

        {notice ? (
          <InlineNotice tone={notice.tone === 'error' ? 'error' : notice.tone === 'success' ? 'success' : 'info'}>
            <strong className="font-bold">{notice.title}.</strong> {notice.message}
          </InlineNotice>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={handleSave} disabled={busy === 'save' || !dirty}>
            {busy === 'save' ? 'Saving…' : 'Save & use'}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleTest} disabled={busy === 'test'}>
            {busy === 'test' ? 'Testing…' : 'Test connection'}
          </Button>
          {status.storedOnDevice ? (
            <Button variant="ghost" size="sm" onClick={handleClear} disabled={busy === 'clear'}>
              {busy === 'clear' ? 'Clearing…' : 'Forget device values'}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Help -------------------------------------------------------------- */}
      <div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.05] p-3.5 text-[11.5px] leading-relaxed text-violet-100/70">
        <p className="mb-1.5 font-bold uppercase tracking-[0.18em] text-cyan-200/90">Three ways to configure</p>
        <ol className="ml-4 list-decimal space-y-1">
          <li>
            <strong className="text-violet-50">Here</strong> — paste once on each device; stored locally, applied
            instantly.
          </li>
          <li>
            <strong className="text-violet-50">runtime-config.json</strong> — edit the file published beside{' '}
            <code className="font-mono text-[11px]">index.html</code>; every visitor picks it up with no rebuild.
          </li>
          <li>
            <strong className="text-violet-50">Build variables</strong> — <code className="font-mono text-[11px]">VITE_SUPABASE_URL</code> and{' '}
            <code className="font-mono text-[11px]">VITE_SUPABASE_ANON_KEY</code> for a baked-in default.
          </li>
        </ol>
        <p className="mt-2.5">
          Either way, run <code className="font-mono text-[11px]">supabase/schema.sql</code> once in your project, and
          make sure you copy the <strong>anon</strong> key — the service-role key is rejected here on purpose.
        </p>
      </div>
    </div>
  )
}

export { EMPTY as EMPTY_BACKEND }
export default BackendPanel
