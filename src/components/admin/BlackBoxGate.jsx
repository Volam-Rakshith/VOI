/**
 * BlackBoxGate — the passphrase prompt for the hidden admin layer.
 * Terminal styling, throttled attempts and no hint of the credential anywhere.
 */

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Modal } from '../ui/Modal.jsx'
import { Button } from '../ui/Button.jsx'
import { guardConfig, guardStatus, verifyAdminPassword } from '../../lib/blackbox.js'
import { playSfx } from '../../lib/sound.js'

export function BlackBoxGate({ open, onCancel, onUnlocked }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const [guard, setGuard] = useState(() => guardStatus())
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) {
      setValue('')
      setError('')
      return () => {}
    }
    setGuard(guardStatus())
    const timer = setTimeout(() => inputRef.current?.focus(), 220)
    return () => clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!guard.locked) return () => {}
    const id = setInterval(() => setGuard(guardStatus()), 1000)
    return () => clearInterval(id)
  }, [guard.locked])

  const submit = async () => {
    if (checking) return
    setChecking(true)
    const result = await verifyAdminPassword(value)
    setChecking(false)
    if (result.ok) {
      playSfx('confirm')
      setValue('')
      onUnlocked?.()
      return
    }
    playSfx('error')
    setError(result.error)
    setGuard(guardStatus())
    setValue('')
    inputRef.current?.focus()
  }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="BLACK BOX"
      subtitle="Restricted control layer. Access phrase required."
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={submit} disabled={checking || guard.locked} data-autofocus>
            {checking ? 'Verifying…' : 'Unlock'}
          </Button>
        </>
      }
    >
      <div className="space-y-3 pt-1">
        <div className="rounded-xl border border-cyan-400/30 bg-black/60 px-3.5 py-3 font-mono text-[11.5px] leading-relaxed text-cyan-200/85">
          <p className="flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            blackbox@vrdev:~$ authenticate --phrase
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-fuchsia-300">›</span>
            <input
              ref={inputRef}
              type="password"
              value={value}
              autoComplete="off"
              spellCheck={false}
              aria-label="Access phrase"
              placeholder="••••••••••••"
              className="w-full border-b border-cyan-400/35 bg-transparent pb-1 font-mono text-[13px] tracking-[.2em] text-cyan-100 placeholder:text-cyan-200/25 focus:border-cyan-300 focus:outline-none"
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submit()
              }}
            />
          </div>
        </div>

        {error && (
          <motion.p
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            className="font-mono text-[11.5px] text-fuchsia-300"
            role="alert"
          >
            ✕ {error}
          </motion.p>
        )}

        {!error && (
          <p className="font-mono text-[10.5px] leading-relaxed text-violet-200/45">
            {guard.locked
              ? `locked · ${Math.ceil(guard.lockedFor / 1000)}s remaining`
              : `${guard.remaining} of ${guardConfig.MAX_ATTEMPTS} attempts remaining today`}
          </p>
        )}

        <p className="rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-[10.5px] leading-relaxed text-amber-100/85">
          Static site reminder: this gate hides the panel, it does not secure it. Keep genuinely sensitive
          operations behind Supabase policies.
        </p>
      </div>
    </Modal>
  )
}

export default BlackBoxGate
