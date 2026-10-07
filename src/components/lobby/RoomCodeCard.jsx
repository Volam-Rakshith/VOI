/** RoomCodeCard — cinematic room-code reveal with copy + native share. */

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '../ui/Button.jsx'
import { Badge } from '../ui/Layout.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { useSettings } from '../../context/SettingsContext.jsx'
import { playSfx } from '../../lib/sound.js'

export function RoomCodeCard({ code, compact = false }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef(null)
  const toast = useToast()
  const { motionOff } = useSettings()

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const shareText = `Join my IMPOSTER game on VR DEVELOPMENTS — room code ${code}`

  const copy = async (silent = false) => {
    const url = `${window.location.origin}${window.location.pathname}#/lobby?room=${code}`
    const payload = `${shareText}\n${url}`
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(payload)
      else {
        const area = document.createElement('textarea')
        area.value = payload
        area.setAttribute('readonly', '')
        area.style.position = 'absolute'
        area.style.left = '-9999px'
        document.body.appendChild(area)
        area.select()
        document.execCommand('copy')
        document.body.removeChild(area)
      }
      setCopied(true)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 2200)
      if (!silent) toast.success('Room link copied — send it to your crew.')
      return true
    } catch {
      toast.error('Could not copy automatically. Read the code out loud instead.')
      return false
    }
  }

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'IMPOSTER', text: shareText, url: `${window.location.origin}${window.location.pathname}#/lobby?room=${code}` })
        return
      } catch {
        /* user dismissed — fall through to copy */
      }
    }
    copy()
  }

  return (
    <div className={`glass clip-hud relative overflow-hidden ${compact ? 'px-4 py-4' : 'px-5 py-6'}`}>
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-neon/70 to-transparent" />
      <div className="flex flex-col items-center gap-3 text-center">
        <Badge tone="cyan">room code</Badge>
        {/* Six tiles have to fit a 320px phone without clipping, so the tiles
            tighten up once the code is longer than four characters. */}
        <div className={`flex items-center ${code.length > 4 ? 'gap-1' : 'gap-1.5'}`} aria-label={`Room code ${code}`}>
          {code.split('').map((char, index) => (
            <motion.span
              key={`${char}-${index}`}
              initial={motionOff ? {} : { opacity: 0, y: -18, rotateX: -70, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, rotateX: 0, filter: 'blur(0px)' }}
              transition={{ delay: motionOff ? 0 : index * 0.09, type: 'spring', stiffness: 320, damping: 22 }}
              className={`grid place-items-center rounded-xl border border-cyan-300/45 bg-black/45 font-display leading-none tracking-[.06em] text-white text-cyan-glow ${
                code.length > 4
                  ? 'min-w-[clamp(34px,11.5vw,52px)] px-1.5 py-2 text-[clamp(20px,7.6vw,32px)]'
                  : 'min-w-[clamp(46px,15vw,64px)] px-2 py-2.5 text-[clamp(28px,10vw,40px)]'
              }`}
            >
              {char}
            </motion.span>
          ))}
        </div>
        <p className="max-w-xs text-[12px] leading-relaxed text-violet-200/60">
          Share this code with your friends. They tap <span className="text-violet-100">ONLINE ROOM → JOIN</span> and enter it.
        </p>
        <div className="flex w-full flex-col gap-2 sm:flex-row">
          <Button
            size="sm"
            variant={copied ? 'primary' : 'default'}
            fullWidth
            onClick={() => {
              playSfx('confirm')
              copy()
            }}
          >
            {copied ? 'Copied' : 'Copy invite link'}
          </Button>
          <Button size="sm" variant="ghost" fullWidth onClick={share}>
            Share
          </Button>
        </div>
      </div>
    </div>
  )
}

export default RoomCodeCard
