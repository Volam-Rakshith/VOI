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
import { Field, SegmentedControl, Select, Stepper } from '../ui/Controls.jsx'
import { Badge, Glyph } from '../ui/Layout.jsx'
import { ErrorState, InlineNotice } from '../ui/Feedback.jsx'
import { LIMITS } from '../../data/constants.js'
import { normalizeName, validatePlayerName, validateRoomCode } from '../../utils/validate.js'
import { categoryOptions } from '../../lib/wordBank.js'
import { useWordBank } from '../../context/WordBankContext.jsx'
import { sanitizeConfig } from '../../data/defaults.js'
import { AdBreak } from './AdBreak.jsx'
import { filterCustomCodeInput, validateCustomRoomCode } from '../../lib/adGate.js'

const ONLINE_LIMITS = { MIN_PLAYERS: 3, MAX_PLAYERS: 20, MAX_IMPOSTERS: 4 }

export function OnlineSetup({ configured, backend = null, onConfigure = null, onCheckConfig = null, busy = null, onSubmit, onQuickJoin = null, lastSession = null, defaultName = '' }) {
  const { bank } = useWordBank()
  const categories = categoryOptions(bank)
  const [tab, setTab] = useState(lastSession?.code ? 'join' : 'create')
  const [name, setName] = useState(defaultName || lastSession?.name || '')
  const [code, setCode] = useState(lastSession?.code || '')
  const [errors, setErrors] = useState({})
  const [checking, setChecking] = useState(false)
  const [checkFailed, setCheckFailed] = useState(false)
  /*
   * Config for the room being created.
   *
   * `sanitizeConfig` clamps the imposter count to `floor((players - 1) / 2)` of
   * the PLAYER COUNT — and at this point no room exists yet, so it assumed the
   * default six players (a ceiling of two) and quietly rewrote the value back
   * on every render. That is what made the Imposters stepper look broken while
   * creating a room. Here the count is deliberately NOT clamped: the room is
   * created capped at four imposters and the lobby re-checks it against the
   * real roster before the game starts.
   */
  /* Custom room code: typed only after the 15-second sponsor break unlocks it. */
  const [customCode, setCustomCode] = useState('')
  const [codeUnlocked, setCodeUnlocked] = useState(false)
  const [adOpen, setAdOpen] = useState(false)

  const [config, setConfig] = useState(() => ({
    ...sanitizeConfig({
      imposterCount: 1,
      turnSeconds: 30,
      categoryId: 'random',
      difficulty: 'mixed',
    }),
    playerCount: ONLINE_LIMITS.MAX_PLAYERS,
    imposterCount: 1,
  }))
  const [categoryId, setCategoryId] = useState('random')
  const chaos = config.mode === 'chaos'

  if (!configured) {
    /*
     * Players never paste keys.
     *
     * The room server is published ONCE by whoever runs the game, in a single
     * file next to index.html — every visitor picks it up automatically. A
     * player who arrives early (or before it has been published) waits and
     * re-checks; only the organiser is ever shown the connect form.
     */
    return (
      <div className="space-y-4">
        <ErrorState
          title="Waiting for the room server"
          message="The room server is published once by the organiser, for everyone — you never have to paste anything. If it is not ready yet, check again in a moment. Pass & play works right now, with nothing at all to configure."
          tone="info"
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                variant="primary"
                size="sm"
                disabled={checking || busy === 'connect'}
                onClick={async () => {
                  setChecking(true)
                  const ok = await Promise.resolve(onCheckConfig ? onCheckConfig() : false)
                  setChecking(false)
                  setCheckFailed(!ok)
                }}
              >
                {checking ? 'Checking…' : 'Check again'}
              </Button>
              <Button variant="quiet" size="sm" onClick={onConfigure}>
                I'm the organiser
              </Button>
            </div>
          }
        />
        {checkFailed ? (
          <InlineNotice tone="warn">
            Still not connected — the room server has not been published yet. Ask the organiser to finish the one-time setup, then tap <strong className="font-bold">Check again</strong>.
          </InlineNotice>
        ) : null}
        {onConfigure ? (
          <InlineNotice tone="info">
            <strong className="font-bold">Organiser?</strong> Connect once from this device — paste the <strong className="font-bold">Project URL</strong> and <strong className="font-bold">anon key</strong> (no rebuild, no redeploy) — then publish <code className="font-mono text-[11.5px]">runtime-config.json</code> next to <code className="font-mono text-[11.5px]">index.html</code> (the panel
            copies or downloads the finished file) so every player joins with nothing to paste. Also run <code className="font-mono text-[11.5px]">supabase/schema.sql</code> once in the Supabase SQL editor.
          </InlineNotice>
        ) : null}
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
    let code = null
    if (codeUnlocked && customCode) {
      const check = validateCustomRoomCode(customCode)
      if (!check.ok) return setErrors({ custom: check.error })
      code = check.value
    }
    const category = categories.find((c) => c.id === categoryId)
    onSubmit?.({
      mode: 'create',
      name: cleanName,
      customCode: code,
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
          <Field label="your name" placeholder="e.g. RAKSHITH" value={name} maxLength={LIMITS.NAME_MAX} autoComplete="nickname" error={errors.name} onChange={(event) => setName(normalizeName(event.target.value))} />
          <Field
            label="room code"
            placeholder="A7KQMN"
            value={code}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            error={errors.code}
            hint={`${LIMITS.ROOM_CODE_LENGTH} characters · case-insensitive`}
            onChange={(event) =>
              setCode(
                event.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, '')
                  .slice(0, LIMITS.ROOM_CODE_LENGTH),
              )
            }
          />
          {errors.form && <InlineNotice tone="error">{errors.form}</InlineNotice>}
          <Button variant="primary" fullWidth onClick={submitJoin} disabled={busy === 'joining'}>
            {busy === 'joining' ? 'Connecting…' : 'Join room'}
          </Button>
          {lastSession?.code && (
            <button type="button" onClick={() => onQuickJoin?.(lastSession)} className="w-full rounded-xl border border-violet-500/30 bg-black/30 px-3.5 py-2.5 text-left transition hover:border-cyan-300/45">
              <span className="block text-[10.5px] uppercase tracking-[.22em] text-violet-200/55">rejoin my last room</span>
              <span className="mt-0.5 block font-display text-[12.5px] tracking-[.12em] text-cyan-100">
                {lastSession.code} · {lastSession.name}
              </span>
            </button>
          )}
        </motion.div>
      ) : (
        <motion.div key="create" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3.5">
          <Field label="your name" placeholder="e.g. RAKSHITH" value={name} maxLength={LIMITS.NAME_MAX} autoComplete="nickname" error={errors.name} onChange={(event) => setName(normalizeName(event.target.value))} />

          <div className="glass clip-hud-sm space-y-1 px-3.5 py-2.5">
            <Stepper label="Imposters" hint={chaos ? 'Chaos re-rolls this every round' : 'Always a strict minority'} value={chaos ? 1 : config.imposterCount} min={1} max={ONLINE_LIMITS.MAX_IMPOSTERS} disabled={chaos} onChange={(value) => setConfig((c) => ({ ...c, imposterCount: value }))} />
            <Stepper label="Turn length" hint="How long each player gets for their clue" value={config.turnSeconds} min={15} max={90} step={15} values={[15, 30, 45, 60, 90]} suffix="s" onChange={(value) => setConfig((c) => ({ ...c, turnSeconds: nearestTurn(value) }))} />
          </div>

          <div className="glass clip-hud-sm space-y-3 px-3.5 py-3">
            <Select
              id="online-category"
              label="category"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              options={categories.map((category) => ({
                value: category.id,
                label: `${category.name} · ${category.count} words`,
              }))}
            />
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
            {/* One win rule: a side runs out of players, or the imposters reach parity. */}
            <div className="rounded-xl border border-violet-400/25 bg-black/30 px-3 py-2.5">
              <span className="label text-[9px]">how the game ends</span>
              <p className="mt-1 text-[11.5px] leading-relaxed text-violet-200/60">When one side has nobody left — or earlier, the moment the imposters match the crew, because no vote can remove them then. A caught imposter gets one guess at the word first. A split vote removes nobody.</p>
            </div>
            {chaos && <p className="text-[11.5px] leading-relaxed text-cyan-200/75">Chaos re-rolls the imposters every round — one, several, many, or the whole table.</p>}
          </div>

          <div className="glass clip-hud-sm space-y-2 rounded-xl px-3.5 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="label text-[9px]">custom room code</p>
                <p className="mt-0.5 text-[11px] leading-snug text-violet-200/55">{codeUnlocked ? 'Unlocked — type the six characters this room will answer to.' : 'Your own code, instead of a rolled one. Unlock it with a 15-second sponsor break.'}</p>
              </div>
              {!codeUnlocked && (
                <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setAdOpen(true)}>
                  ▶ Watch ad
                </Button>
              )}
              {codeUnlocked && <span className="shrink-0 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 font-display text-[9px] uppercase tracking-[.18em] text-emerald-200">unlocked</span>}
            </div>
            <input
              value={customCode}
              onChange={(event) => {
                setCustomCode(filterCustomCodeInput(event.target.value))
                setErrors((e) => ({ ...e, custom: null }))
              }}
              disabled={!codeUnlocked}
              placeholder={codeUnlocked ? 'e.g. PARK99' : 'locked — watch the break to type here'}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck="false"
              aria-label="custom room code"
              className={`field font-display tracking-[.3em] uppercase disabled:cursor-not-allowed disabled:opacity-45 ${errors.custom ? 'field-invalid' : ''}`}
            />
            {errors.custom && (
              <p role="alert" className="text-[11.5px] font-semibold text-magenta-neon">
                {errors.custom}
              </p>
            )}
          </div>

          {errors.form && <InlineNotice tone="error">{errors.form}</InlineNotice>}
          <Button variant="primary" fullWidth onClick={submitCreate} disabled={busy === 'creating'}>
            {busy === 'creating' ? 'Creating room…' : codeUnlocked && customCode ? `Create room · ${customCode}` : 'Create room'}
          </Button>

          {adOpen && (
            <AdBreak
              onDone={() => {
                setAdOpen(false)
                setCodeUnlocked(true)
              }}
              onClose={() => setAdOpen(false)}
            />
          )}
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-violet-200/45">
            <Glyph name="users" size={12} /> 3–20 players · every player needs their own device
          </p>
        </motion.div>
      )}
    </div>
  )
}

export default OnlineSetup
