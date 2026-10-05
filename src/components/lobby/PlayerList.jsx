/** PlayerList — live lobby roster with host / ready / connection state. */

import { AnimatePresence, motion } from 'framer-motion'
import { Badge } from '../ui/Layout.jsx'

const initials = (name) => (name || '?').trim().slice(0, 1).toUpperCase()

export function PlayerList({ players = [], hostId, myId = null, graceMs = 45000 }) {
  const now = Date.now()
  const online = (player) => player.online !== false && now - (player.lastSeen || 0) < graceMs

  return (
    <ul className="space-y-2">
      <AnimatePresence initial={false}>
        {players.map((player, index) => {
          const isHost = player.isHost || player.id === hostId
          const isMe = player.id === myId
          const connected = online(player)
          return (
            <motion.li
              key={player.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: connected ? 1 : 0.55, y: 0, scale: 1 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28, delay: Math.min(index * 0.02, 0.2) }}
              className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 ${
                isMe ? 'border-cyan-300/55 bg-cyan-500/10' : 'border-violet-500/22 bg-black/30'
              }`}
            >
              <span
                className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-lg border font-display text-[13px] ${
                  isHost ? 'border-fuchsia-400/55 bg-fuchsia-500/15 text-fuchsia-100' : 'border-cyan-400/35 bg-cyan-500/10 text-cyan-100'
                }`}
                aria-hidden="true"
              >
                {initials(player.name)}
                <span
                  className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-black/60 ${
                    connected ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-[12.5px] tracking-[.08em] text-violet-50">
                  {player.name}
                  {isMe && <span className="ml-2 text-[10px] tracking-widest text-cyan-200/70">(you)</span>}
                </span>
                <span className="mt-0.5 block text-[11px] text-violet-200/50">
                  {isHost ? 'Room host' : connected ? 'Connected' : 'Reconnecting…'}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                {isHost && <Badge tone="magenta">host</Badge>}
                {!isHost && player.ready && <Badge tone="emerald">ready</Badge>}
                {!isHost && !player.ready && <Badge tone="muted">waiting</Badge>}
              </span>
            </motion.li>
          )
        })}
      </AnimatePresence>
      {!players.length && (
        <li className="rounded-xl border border-dashed border-violet-400/25 px-4 py-6 text-center text-[12px] text-violet-200/50">
          Nobody here yet…
        </li>
      )}
    </ul>
  )
}

export default PlayerList
