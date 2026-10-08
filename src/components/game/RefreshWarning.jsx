/**
 * RefreshWarning — the giant "you just refreshed" alarm.
 *
 * A browser cannot show a page's own dialog at the moment of a reload, so this
 * fires on the way BACK: the tab remembers it was refreshed mid-game (see
 * lib/refreshGuard.js), the table is picked back up from its per-tab snapshot,
 * and this screen asks the only two questions that matter —
 *
 *     CONTINUE GAME   → carry on exactly where the table left off
 *     LEAVE [REFRESH] → end it: leave the room / drop the table, back to the menu
 *
 * While a game is running it also registers the browser's own "Leave site?"
 * prompt, so on most desktops and Android phones the refresh is caught BEFORE
 * it happens at all.
 *
 * It also fires the warning when the refresh destroyed a game that could not be
 * recovered (storage blocked, private mode): there is no table to continue, so
 * it says so plainly instead of pretending.
 */

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Button } from '../ui/Button.jsx'
import { useSettings } from '../../context/SettingsContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { clearRefreshGuard, reloadHappened, watchUnloads } from '../../lib/refreshGuard.js'

const COPY = {
  local: {
    kind: 'pass & play table',
    continueHint: 'Your table is saved — pick the phone back up and carry on from the round you were in.',
    leaveHint: 'Leave and the game ends now. Nothing is saved.',
  },
  online: {
    kind: 'online room',
    continueHint: 'Your seat is saved — you are back in the room, exactly where you left it.',
    leaveHint: 'Leave and you quit the room for everyone at the table.',
  },
}

export function RefreshWarning({ active = false, mode = 'local', onLeave = null }) {
  const { motionOff } = useSettings()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [recovered, setRecovered] = useState(true)
  const panelRef = useRef(null)

  /* Was this page refreshed while a game was running? */
  useEffect(() => {
    const marker = reloadHappened()
    if (!marker || marker.mode !== mode) return
    if (active) {
      setRecovered(true)
      setOpen(true)
      return
    }
    /*
     * Nothing left to continue — the refresh really did end a game. Say so once
     * and let the marker go, rather than leaving a lie on screen.
     */
    clearRefreshGuard()
    toast.info('That refresh ended your last game — it was not running any more.')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, active])

  /* Catch the NEXT refresh before it happens, wherever the browser allows it. */
  useEffect(() => watchUnloads(active, mode), [active, mode])

  /* Escape continues the game — the safe choice is never to lose the table. */
  useEffect(() => {
    if (!open) return () => {}
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        clearRefreshGuard()
      }
    }
    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusTimer = setTimeout(() => {
      panelRef.current?.querySelector('[data-autofocus]')?.focus?.()
    }, 60)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      clearTimeout(focusTimer)
    }
  }, [open])

  const keepPlaying = () => {
    clearRefreshGuard()
    setOpen(false)
  }

  const leave = () => {
    clearRefreshGuard()
    setOpen(false)
    onLeave?.()
  }

  const copy = COPY[mode] || COPY.local

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[320] flex items-center justify-center p-3 sm:p-6">
          <motion.div
            className="absolute inset-0 bg-black/85 backdrop-blur-lg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: motionOff ? 0 : 0.24 }}
          />

          <motion.div
            ref={panelRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="refresh-warning-title"
            aria-describedby="refresh-warning-body"
            tabIndex={-1}
            initial={motionOff ? { opacity: 1 } : { opacity: 0, scale: 0.9, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: motionOff ? 1 : 0.96 }}
            transition={motionOff ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 24 }}
            className={`relative w-full max-w-lg overflow-hidden rounded-3xl border-2 border-amber-300/70 bg-[#150019] ${recovered ? '' : ''}`}
            style={{
              boxShadow:
                '0 0 0 1px rgba(255,255,255,.06) inset, 0 0 60px rgba(255,180,0,.28), 0 30px 90px rgba(0,0,0,.75)',
            }}
          >
            {/* hazard tape header */}
            <div
              className={`relative h-3 w-full ${motionOff ? '' : 'animate-pulse'}`}
              style={{
                backgroundImage:
                  'repeating-linear-gradient(45deg, #ffb400 0 14px, #160019 14px 28px)',
              }}
            />

            <div className="relative px-5 pb-6 pt-5 text-center sm:px-8">
              {/* glow behind the glyph */}
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute left-1/2 top-6 h-40 w-40 -translate-x-1/2 rounded-full ${
                  motionOff ? '' : 'animate-pulse-glow'
                }`}
                style={{ background: 'radial-gradient(circle, rgba(255,180,0,.45), transparent 70%)', filter: 'blur(18px)' }}
              />

              <motion.div
                aria-hidden="true"
                className="relative mx-auto grid h-16 w-16 place-items-center rounded-2xl border-2 border-amber-300 bg-amber-400/15"
                initial={motionOff ? false : { rotate: 0, scale: 0.7 }}
                animate={motionOff ? { scale: 1 } : { scale: [0.7, 1.12, 1], rotate: [0, -6, 0] }}
                transition={{ duration: 0.55, ease: 'easeOut' }}
              >
                <span className="font-display text-[34px] leading-none text-amber-200">!</span>
              </motion.div>

              <p
                className={`mt-4 font-display text-[clamp(15px,5.2vw,20px)] tracking-[.3em] text-amber-200 ${
                  motionOff ? '' : 'animate-flicker'
                }`}
              >
                !! HUGE WARNING !!
              </p>

              <h2
                id="refresh-warning-title"
                className="mt-2 font-display text-[clamp(23px,8.4vw,34px)] leading-[1.05] tracking-[.06em] text-white"
                style={{ textShadow: '0 0 18px rgba(255,180,0,.55), 0 0 40px rgba(255,43,209,.35)' }}
              >
                REFRESHING RESETS
                <br />
                CURRENT GAME
              </h2>

              <p id="refresh-warning-body" className="mt-3 text-[12.5px] leading-relaxed text-violet-100/80">
                This {copy.kind} was reloaded mid-game.{' '}
                {recovered ? copy.continueHint : 'It could not be recovered — there is nothing to continue.'}
              </p>

              {/* the two ways out */}
              <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
                <Button
                  variant="primary"
                  size="lg"
                  data-autofocus
                  className={motionOff ? '' : 'animate-pulse'}
                  onClick={keepPlaying}
                  disabled={!recovered}
                >
                  CONTINUE GAME
                </Button>
                <Button variant="danger" size="lg" onClick={leave}>
                  LEAVE [REFRESH]
                </Button>
              </div>

              <p className="mt-3.5 text-[11px] leading-relaxed text-violet-200/55">
                {recovered ? copy.leaveHint : 'Refreshing again will start you back at the main menu.'}
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

export default RefreshWarning
