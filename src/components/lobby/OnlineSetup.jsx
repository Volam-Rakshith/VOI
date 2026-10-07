/**
 * OnlineSetup — create / join panel for online rooms, including the
 * "not configured yet" state that explains exactly what to set up.
 *
 * The parent owns the network call: this component only validates input and
 * emits `onSubmit({ mode, name, code?, config? })`.
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '../ui/Button.jsx'
import { Field, SegmentedControl, Stepper } from '../ui/Controls.jsx'
import { Badge, Glyph } from '../ui/Layout.jsx'
import { ErrorState, InlineNotice } from '../ui/Feedback.jsx'
import { LIMITS } from '../../data/constants.js'
import { normalizeName, validatePlayerName, validateRoomCode } from '../../utils/validate.js'
import { categoryOptions } from '../../lib/wordBank.js'
import { useWordBank } from '../../context/WordBankContext.jsx'
import { sanitizeConfig } from '../../data/defaults.js'

const ONLINE_LIMITS = { MIN_PLAYERS: 3, MAX_PLAYERS: 20, MAX_IMPOSTERS: 4 }

export function OnlineSetup({
  configured,
  backend = null,
  onConfigure = null,
  busy = null,
  onSubmit,
  onQuickJoin = null,
  lastSession = null,
  defaultName = '',
}) {
  const { bank } = useWordBank()
  const categories = categoryOptions(bank)
  const [tab, setTab] = useState(lastSession?.code ? 'join' : 'create')
  const [name, setName] = useState(defaultName || lastSession?.name || '')
  const [code, setCode] = useState(lastSession?.code || '')
  const [errors, setErrors] = useState({})
  const [config, setConfig] = useState(() =>
    sanitizeConfig({
      imposterCount: 1,
      turnSeconds: 30,
      rounds: 2,
      categoryId: 'random',
      difficulty: 'mixed',
      winRule: 'classic',
    }),
  )
  const [categoryId, setCategoryId] = useState('random')
  const chaos = config.mode === 'chaos'

  if (!configured) {
    return (
      <div className="space-y-4">
        <ErrorState
          title="Connect a backend to play online"
          message="Online rooms need a free Supabase project for sync. Paste two public values once — no rebuild, no redeploy, and nothing to edit in code. Pass & play works right now, with nothing to configure."
          tone="info"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" size="sm" onClick={onConfigure}>
                Connect a backend
              </Button>
              <Badge tone="cyan">takes ~2 minutes</Badge>
            </div>
          }
        />
        <InlineNotice tone="info">
          You will need your <strong className="font-bold">Project URL</strong> and{' '}
          <strong className="font-bold">anon key</strong> from Supabase → Project Settings → API, plus{' '}
          <code className="font-mono text-[11.5px]">supabase/schema.sql</code> run once in the SQL editor. Alternatively,
          edit <code className="font-mono text-[11.5px]">runtime-config.json</code> next to index.html, or set the two
          build variables — every path is documented in the README.
        </InlineNotice>
      </div>
    )
  }

  const backendRow = onConfigure ? (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-violet-400/15 bg-violet-500/[0.05] px-3.5 py-2.5">
      <div className="min-w-0">
        <p className="text-[10.5px] uppercase tracking-[0.22em] text-violet-200/50">Backend</p>
        <p className="truncate font-mono text-[12px] text-violet-50/90">{backend?.host || 'configured'}</p>
      </div>
      <div className="flex items-center gap-2">
        {backend?.sourceLabel ? <Badge tone="cyan">{backend.sourceLabel}</Badge> : null}
        <Button variant="quiet" size="sm" onClick={onConfigure}>
          Change
        </Button>
      </div>
    </div>
  ) : null

  const validateName = () => {
    const result = validatePlayerName(name)
    if (!result.ok) {
      setErrors((current) => ({ ...current, name: result.error }))
      return null
    }
    return result.value
  }

  const submitJoin = () => {
    setErrors({})
    const cleanName = validateName()
    const cleanCode = validateRoomCode(code)
    if (!cleanName) return
    if (!cleanCode.ok) {
      setErrors({ code: cleanCode.error })
      return
    }
    onSubmit?.({ mode: 'join', name: cleanName, code: cleanCode.value })
  }

  const submitCreate = () => {
    setErrors({})
    const cleanName = validateName()
    if (!cleanName) return
    const category = categories.find((c) => c.id === categoryId)
    onSubmit?.({
      mode: 'create',
      name: cleanName,
      config: {
        ...config,
        categoryIds: [categoryId],
        categoryLabel: category?.name || 'Random',
        minPlayers: ONLINE_LIMITS.MIN_PLAYERS,
        maxPlayers: ONLINE_LIMITS.MAX_PLAYERS,
      },
    })
  }

  const nearestTurn = (value) => [15, 30, 45, 60, 90].reduce((a, b) => (Math.abs(b - value) < Math.abs(a - value) ? b : a))

  return (
    <div className="space-y-4">
      {backendRow}

      <SegmentedControl
        options={[
          { value: 'join', label: 'Join room' },
          { value: 'create', label: 'Create room' },
        ]}
        value={tab}
        onChange={(value) => {
          setTab(value)
          setErrors({})
        }}
      />

      {tab === 'join' ? (
        <motion.div key="join" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3.5">
          <Field
            label="your name"
            placeholder="e.g. RAKSHITH"
            value={name}
            maxLength={LIMITS.NAME_MAX}
            autoComplete="nickname"
            error={errors.name}
            onChange={(event) => setName(normalizeName(event.target.value))}
          />
          <Field
            label="room code"
            placeholder="A7KQ"
            value={code}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            error={errors.code}
            hint={`${LIMITS.ROOM_CODE_LENGTH} characters · case-insensitive`}
            onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, LIMITS.ROOM_CODE_LENGTH))}
          />
          {errors.form && <InlineNotice tone="error">{errors.form}</InlineNotice>}
          <Button variant="primary" fullWidth onClick={submitJoin} disabled={busy === 'joining'}>
            {busy === 'joining' ? 'Connecting…' : 'Join room'}
          </Button>
          {lastSession?.code && (
            <button
              type="button"
              onClick={() => onQuickJoin?.(lastSession)}
              className="w-full rounded-xl border border-violet-500/30 bg-black/30 px-3.5 py-2.5 text-left transition hover:border-cyan-300/45"
            >
              <span className="block text-[10.5px] uppercase tracking-[.22em] text-violet-200/55">rejoin my last room</span>
              <span className="mt-0.5 block font-display text-[12.5px] tracking-[.12em] text-cyan-100">
                {lastSession.code} · {lastSession.name}
              </span>
            </button>
          )}
        </motion.div>
      ) : (
        <motion.div key="create" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3.5">
          <Field
            label="your name"
            placeholder="e.g. RAKSHITH"
            value={name}
            maxLength={LIMITS.NAME_MAX}
            autoComplete="nickname"
            error={errors.name}
            onChange={(event) => setName(normalizeName(event.target.value))}
          />

          <div className="glass clip-hud-sm space-y-1 px-3.5 py-2.5">
            <Stepper
              label="Imposters"
              hint={chaos ? 'Chaos re-rolls this every round' : 'Always a strict minority'}
              value={chaos ? 1 : config.imposterCount}
              min={1}
              max={ONLINE_LIMITS.MAX_IMPOSTERS}
              disabled={chaos}
              onChange={(value) => setConfig((c) => ({ ...c, imposterCount: value }))}
            />
            <Stepper
              label="Turn length"
              value={config.turnSeconds}
              min={15}
              max={90}
              suffix="s"
              onChange={(value) => setConfig((c) => ({ ...c, turnSeconds: nearestTurn(value) }))}
            />
          </div>

          <div className="glass clip-hud-sm space-y-3 px-3.5 py-3">
            <div>
              <label htmlFor="online-category" className="label mb-2 block">
                category
              </label>
              <select id="online-category" className="field" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name} ({category.count} words)
                  </option>
                ))}
              </select>
            </div>
            <SegmentedControl
              size="sm"
              label="difficulty"
              value={config.difficulty}
              onChange={(value) => setConfig((c) => ({ ...c, difficulty: value }))}
              options={[
                { value: 'easy', label: 'Casual' },
                { value: 'medium', label: 'Sharp' },
                { value: 'hard', label: 'Vicious' },
                { value: 'mixed', label: 'Mixed' },
              ]}
            />
            <SegmentedControl
              size="sm"
              label="game mode"
              value={config.mode}
              onChange={(value) => setConfig((c) => ({ ...c, mode: value }))}
              options={[
                { value: 'normal', label: 'Normal', hint: 'fixed imposters' },
                { value: 'chaos', label: 'Chaos', hint: 'anyone could be one' },
              ]}
            />
            {/* One win rule: the game ends when a side runs out of players. */}
            <div className="rounded-xl border border-violet-400/25 bg-black/30 px-3 py-2.5">
              <span className="label text-[9px]">how the game ends</span>
              <p className="mt-1 text-[11.5px] leading-relaxed text-violet-200/60">
                Until one side has nobody left. A caught imposter gets one guess at the word first — name it and the imposters take the
                game. A split vote removes nobody.
              </p>
            </div>
            {chaos && (
              <p className="text-[11.5px] leading-relaxed text-cyan-200/75">
                Chaos re-rolls the imposters every round — one, several, many, or the whole table.
              </p>
            )}
          </div>

          {errors.form && <InlineNotice tone="error">{errors.form}</InlineNotice>}
          <Button variant="primary" fullWidth onClick={submitCreate} disabled={busy === 'creating'}>
            {busy === 'creating' ? 'Creating room…' : 'Create room'}
          </Button>
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-violet-200/45">
            <Glyph name="users" size={12} /> 3–20 players · every player needs their own device
          </p>
        </motion.div>
      )}
    </div>
  )
}

export default OnlineSetup
