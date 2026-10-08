/**
 * AdBreak — the fifteen-second sponsor wall between "I want my own room code"
 * and the code itself.
 *
 * The organiser drops .mp4 files into public/ads/ and lists them in
 * public/ads/playlist.json; one is picked at random per viewing. Everything
 * about the wall is deliberately old-TV honest:
 *
 *  • the ad plays muted with sound off by default (autoplay rules and, at a
 *    party, nobody needs audio from a phone for a code)
 *  • the SKIP button arms after AD_SKIP_AFTER_S seconds of actual watching —
 *    it is disabled and counts down until then
 *  • an ad shorter than the clock holds its last frame until the clock is up
 *  • no playlist, no files, offline playlist fetch — the plate shows the
 *    animated "AD SPACE" placeholder and runs the same clock, so the feature
 *    is never blocked on media being installed
 *
 * Closing with ✕ walks away without unlocking anything.
 */

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '../ui/Button.jsx'
import { useSettings } from '../../context/SettingsContext.jsx'
import { AD_PLAYLIST_PATH, AD_SKIP_AFTER_S, adSkipState } from '../../lib/adGate.js'

const BASE = typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL ? import.meta.env.BASE_URL : '/'

async function loadPlaylist() {
  try {
    const response = await fetch(`${BASE}${AD_PLAYLIST_PATH}`, { cache: 'no-store' })
    if (!response.ok) return []
    const data = await response.json()
    if (!Array.isArray(data)) return []
    return data.map((entry) => (typeof entry === 'string' ? entry : entry?.file)).filter((file) => typeof file === 'string' && /\.mp4$/i.test(file))
  } catch {
    return []
  }
}

export function AdBreak({ onDone, onClose }) {
  const { motionOff } = useSettings()
  const [playlist, setPlaylist] = useState(null) // null = still deciding
  const [file, setFile] = useState(null)
  const [mediaFailed, setMediaFailed] = useState(false)
  const [watched, setWatched] = useState(0)
  const startedAt = useRef(Date.now())
  const videoRef = useRef(null)
  const finished = useRef(false)

  useEffect(() => {
    let cancelled = false
    loadPlaylist().then((list) => {
      if (cancelled) return
      setPlaylist(list)
      if (list.length) setFile(list[Math.floor(Math.random() * list.length)])
      else setMediaFailed(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  /* The clock runs on wall time, so a throttled tab that fell behind cannot
     "fast-forward" through the break by hiding the app. */
  useEffect(() => {
    const id = setInterval(() => setWatched((Date.now() - startedAt.current) / 1000), 400)
    return () => clearInterval(id)
  }, [])

  const state = adSkipState(watched)

  const finish = () => {
    if (finished.current) return
    finished.current = true
    onDone?.()
  }

  const showVideo = file && !mediaFailed

  return (
    <motion.div className="fixed inset-0 z-[120] flex flex-col items-center justify-center gap-4 bg-black/90 px-4 py-6 backdrop-blur-sm" initial={motionOff ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={motionOff ? undefined : { opacity: 0 }} role="dialog" aria-modal="true" aria-label="Sponsor break">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-violet-400/30 bg-[#0B001A]">
        {showVideo ? (
          <video
            ref={videoRef}
            src={`${BASE}ads/${file}`}
            className="block max-h-[56vh] w-full bg-black"
            autoPlay
            muted
            playsInline
            controls={false}
            onError={() => setMediaFailed(true)}
            onEnded={() => {
              if (state.complete) finish()
              else {
                /* Short clip: hold, replay, let the clock decide. */
                const node = videoRef.current
                if (node) {
                  try {
                    node.currentTime = 0
                    node.play()?.catch?.(() => setMediaFailed(true))
                  } catch {
                    setMediaFailed(true)
                  }
                }
              }
            }}
          />
        ) : (
          /* The plate the ad space wears while there is nothing to play. */
          <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden">
            <div
              className={`absolute inset-[-30%] ${motionOff ? '' : 'animate-spin-slow'}`}
              style={{
                background: 'conic-gradient(from 0deg, rgba(34,211,238,.16), transparent 22%, rgba(168,85,247,.18) 45%, transparent 68%, rgba(255,43,209,.16) 84%, transparent 96%)',
                filter: 'blur(30px)',
              }}
            />
            {!motionOff && <motion.span aria-hidden="true" className="absolute inset-y-0 w-1/4 bg-gradient-to-r from-transparent via-white/10 to-transparent" animate={{ x: ['-120%', '520%'] }} transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }} />}
            <div className="relative px-6 text-center">
              <p className="font-display text-[clamp(20px,6.5vw,30px)] tracking-[.3em] text-violet-100/90">AD SPACE</p>
              <p className="mx-auto mt-2 max-w-[34ch] text-[11.5px] leading-relaxed text-violet-200/60">{playlist === null ? 'Rolling the reel…' : 'No clips installed yet. Drop the .mp4 files into public/ads/ and list them in ads/playlist.json — the break plays them from then on.'}</p>
            </div>
          </div>
        )}

        {/* network-bar chrome so it reads as a broadcast, not a spinner */}
        <div className="flex items-center justify-between gap-3 border-t border-violet-400/20 bg-black/50 px-3.5 py-2.5">
          <p className="label shrink-0 text-[9px] text-cyan-200/70">sponsor break · {AD_SECONDS_LABEL}</p>
          <div className="h-[3px] min-w-16 flex-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-violet-400 to-fuchsia-400 transition-[width] duration-300" style={{ width: `${Math.min(100, ((AD_SKIP_AFTER_S - state.secondsLeft) / AD_SKIP_AFTER_S) * 100)}%` }} />
          </div>
          <span className="shrink-0 font-mono text-[10.5px] tabular text-violet-100/75">{state.skipEnabled ? 'ready' : `${state.secondsLeft}s`}</span>
        </div>
      </div>

      <div className="flex w-full max-w-lg items-center justify-between gap-3">
        <button type="button" onClick={onClose} className="font-display text-[10.5px] uppercase tracking-[.24em] text-violet-200/45 transition hover:text-violet-100">
          ✕ not now
        </button>
        {state.skipEnabled ? (
          <Button variant="primary" size="sm" onClick={finish}>
            Skip ad — unlock my code
          </Button>
        ) : (
          <Button variant="ghost" size="sm" disabled>
            Skip in {state.secondsLeft}s
          </Button>
        )}
      </div>
    </motion.div>
  )
}

const AD_SECONDS_LABEL = `${AD_SKIP_AFTER_S}s`

export default AdBreak
