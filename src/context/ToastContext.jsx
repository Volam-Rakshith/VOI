/**
 * Toasts — short, non-blocking feedback for saves, errors and sync events.
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useSettings } from './SettingsContext.jsx'

const ToastContext = createContext(null)

const TONE = {
  info: { ring: 'rgba(34,211,238,.55)', glow: 'rgba(34,211,238,.35)', glyph: 'i' },
  success: { ring: 'rgba(52,211,153,.6)', glow: 'rgba(52,211,153,.3)', glyph: '✓' },
  error: { ring: 'rgba(255,43,209,.65)', glow: 'rgba(255,43,209,.35)', glyph: '!' },
  warn: { ring: 'rgba(250,204,21,.6)', glow: 'rgba(250,204,21,.3)', glyph: '!' },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())
  const { vibrate } = useSettings()

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const push = useCallback(
    (message, { tone = 'info', duration = 3200, id } = {}) => {
      const toastId = id || `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      setToasts((list) => {
        const next = [...list.filter((t) => t.message !== message), { id: toastId, message, tone }]
        return next.slice(-3)
      })
      if (tone === 'error') vibrate?.([14, 40, 14])
      const timer = setTimeout(() => dismiss(toastId), duration)
      timers.current.set(toastId, timer)
      return toastId
    },
    [dismiss, vibrate],
  )

  const api = useMemo(
    () => ({
      push,
      dismiss,
      success: (msg, opts) => push(msg, { ...opts, tone: 'success' }),
      error: (msg, opts) => push(msg, { ...opts, tone: 'error', duration: 4600 }),
      warn: (msg, opts) => push(msg, { ...opts, tone: 'warn' }),
      info: (msg, opts) => push(msg, { ...opts, tone: 'info' }),
    }),
    [push, dismiss],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[120] flex flex-col items-center gap-2 px-3 pt-[calc(env(safe-area-inset-top)+10px)]"
        role="status"
        aria-live="polite"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const tone = TONE[toast.tone] || TONE.info
            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: -18, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border px-3.5 py-2.5 text-sm backdrop-blur-xl"
                style={{
                  borderColor: tone.ring,
                  background: 'linear-gradient(150deg, rgba(30,6,60,.94), rgba(10,0,26,.94))',
                  boxShadow: `0 18px 40px -20px ${tone.glow}, inset 0 1px 0 rgba(255,255,255,.06)`,
                }}
                onClick={() => dismiss(toast.id)}
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full font-display text-[11px]"
                  style={{ background: tone.glow, border: `1px solid ${tone.ring}` }}
                >
                  {tone.glyph}
                </span>
                <p className="flex-1 font-medium leading-snug text-violet-50">{toast.message}</p>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
