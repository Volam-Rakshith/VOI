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
  const [copied, setCopied] = useState(false)

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

  /*
   * The "for everyone" path.
   *
   * A device that has never been configured cannot look anything up online —
   * it does not know which project to ask. The one place every visitor already
   * looks is `runtime-config.json` published next to index.html, so publishing
   * the values there is what stops each device being asked one by one. The
   * panel hands over the finished file so it is a copy-paste, not a manual edit.
   */
  const runtimeFile = useMemo(() => {
    const active = readStoredBackend() || getActiveBackend()
    const url = (draft.url.trim() || active.url || '').replace(/\/+$/, '')
    const key = draft.anonKey.trim() || active.anonKey || ''
    return `${JSON.stringify(
      {
        _comment:
          'Runtime backend configuration. Both values are public (project URL + anon key) and are read by every visitor. Empty values fall back to the build-time VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.',
        supabaseUrl: url,
        supabaseAnonKey: key,
      },
      null,
      2,
    )}\n`
  }, [draft])

  const copyRuntimeFile = async () => {
    try {
      await navigator.clipboard.writeText(runtimeFile)
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch {
      setNotice({ tone: 'error', title: 'Could not copy', message: 'Select the text and copy it by hand.' })
    }
  }

  const downloadRuntimeFile = () => {
    const blob = new Blob([runtimeFile], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'runtime-config.json'
    link.click()
    URL.revokeObjectURL(url)
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

      {/* Publish for everyone --------------------------------------------- */}
      <div className="rounded-2xl border border-fuchsia-400/20 bg-fuchsia-500/[0.06] p-3.5">
        <p className="mb-1.5 font-bold uppercase tracking-[0.18em] text-fuchsia-200/90">
          Let everyone in without asking them
        </p>
        <p className="text-[11.5px] leading-relaxed text-violet-100/70">
          Saving above configures <strong className="text-violet-50">this device only</strong>, so every new phone
          would have to be handed the same two values.{' '}
          <strong className="text-violet-50">Publish the file below once</strong> and every visitor — any device, any
          browser, forever — is configured automatically, with nothing to paste. It is the same two public values,
          sitting in one file beside <code className="font-mono text-[11px]">index.html</code>.
        </p>
        <pre className="mt-2.5 max-h-44 overflow-auto rounded-xl border border-violet-400/20 bg-black/50 p-3 font-mono text-[10.5px] leading-relaxed text-cyan-100/85">
          {runtimeFile}
        </pre>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={copyRuntimeFile}>
            {copied ? 'Copied ✓' : 'Copy runtime-config.json'}
          </Button>
          <Button variant="ghost" size="sm" onClick={downloadRuntimeFile}>
            Download the file
          </Button>
        </div>
        <ol className="ml-4 mt-2.5 list-decimal space-y-1 text-[11.5px] leading-relaxed text-violet-100/70">
          <li>
            Save it as <code className="font-mono text-[11px]">public/runtime-config.json</code> in the repository (or
            drop it straight into the deployed folder next to <code className="font-mono text-[11px]">index.html</code>).
          </li>
          <li>Commit and push once — no rebuild needed.</li>
          <li>
            Everybody who opens the link is connected already. The <em>Connect a backend</em> prompt only appears on a
            device when no published values can be found at all.
          </li>
        </ol>
      </div>

      {/* Help -------------------------------------------------------------- */}
      <div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.05] p-3.5 text-[11.5px] leading-relaxed text-violet-100/70">
        <p className="mb-1.5 font-bold uppercase tracking-[0.18em] text-cyan-200/90">Three ways to configure</p>
        <ol className="ml-4 list-decimal space-y-1">
          <li>
            <strong className="text-violet-50">Here</strong> — paste once on each device; stored locally, applied
            instantly, and it overrides everything else on that device.
          </li>
          <li>
            <strong className="text-violet-50">runtime-config.json</strong> — the published file beside{' '}
            <code className="font-mono text-[11px]">index.html</code>: <strong>the global one</strong>. Every visitor is
            configured with nothing to paste. Use the box above to produce it.
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
