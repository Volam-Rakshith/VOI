/** RoomManager — live room oversight with a guarded terminate action. */

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Button } from '../ui/Button.jsx'
import { Badge } from '../ui/Layout.jsx'
import { Panel, PanelBody, PanelHeader } from '../ui/Panel.jsx'
import { EmptyState, InlineNotice, LoadingScreen, Skeleton } from '../ui/Feedback.jsx'
import { ConfirmDialog } from '../ui/ConfirmDialog.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { audit } from '../../lib/blackbox.js'
import { isConfigured, listActiveRooms, sweepExpiredRooms, terminateRoom } from '../../lib/onlineService.js'

const REFRESH_MS = 12000

const statusTone = (status) =>
  status === 'lobby' ? 'cyan' : status === 'playing' ? 'emerald' : status === 'ended' ? 'violet' : 'magenta'

export function RoomManager() {
  const toast = useToast()
  const [rooms, setRooms] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [target, setTarget] = useState(null)
  const [working, setWorking] = useState(false)

  const configured = isConfigured()

  const load = useCallback(
    async (silent = false) => {
      if (!configured) return
      if (!silent) setLoading(true)
      try {
        const data = await listActiveRooms()
        setRooms(data)
        setError('')
      } catch (err) {
        setError(
          err?.code === 'SCHEMA_MISSING'
            ? 'The room table is missing. Run supabase/schema.sql in your project.'
            : err?.code === 'NETWORK'
              ? 'CONNECTION LOST — retrying automatically.'
              : 'Could not read the rooms list.',
        )
      } finally {
        setLoading(false)
      }
    },
    [configured],
  )

  useEffect(() => {
    if (!configured) return () => {}
    load()
    const id = setInterval(() => load(true), REFRESH_MS)
    return () => clearInterval(id)
  }, [configured, load])

  if (!configured) {
    return (
      <Panel annotated>
        <PanelHeader title="ROOM MANAGEMENT" subtitle="Requires a Supabase project" right={<Badge tone="amber">offline</Badge>} />
        <PanelBody>
          <InlineNotice tone="info">
            Room management reads the shared room table, so it switches on together with online play. Add
            <span className="font-mono"> VITE_SUPABASE_URL </span> and
            <span className="font-mono"> VITE_SUPABASE_ANON_KEY</span>, run <span className="font-mono">supabase/schema.sql</span>, and this
            panel becomes live.
          </InlineNotice>
        </PanelBody>
      </Panel>
    )
  }

  const terminate = async () => {
    if (!target) return
    setWorking(true)
    try {
      await terminateRoom(target.code)
      audit('room-terminate', target.code)
      toast.success(`Room ${target.code} terminated`)
      setTarget(null)
      await load(true)
    } catch {
      toast.error('Could not terminate that room. Try again.')
    } finally {
      setWorking(false)
    }
  }

  const sweep = async () => {
    setWorking(true)
    try {
      await sweepExpiredRooms()
      audit('room-sweep', 'Expired rooms closed')
      toast.success('Expired rooms closed')
      await load(true)
    } catch {
      toast.error('Sweep failed — check your Supabase policies.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="space-y-4">
      <Panel annotated>
        <PanelHeader
          title="ACTIVE ROOMS"
          subtitle={`${rooms?.length ?? 0} live · auto-refresh every ${REFRESH_MS / 1000}s`}
          right={
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => load()} disabled={loading}>
                {loading ? '…' : 'Refresh'}
              </Button>
              <Button size="sm" variant="quiet" onClick={sweep} disabled={working}>
                Sweep
              </Button>
            </div>
          }
        />
        <PanelBody>
          {error && <InlineNotice tone={error.includes('CONNECTION') ? 'warn' : 'error'}>{error}</InlineNotice>}

          {rooms === null && !error && (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          )}

          {rooms && rooms.length === 0 && !error && (
            <EmptyState title="No active rooms" message="Rooms appear here the moment someone creates one in Online Room." />
          )}

          <AnimatePresence initial={false}>
            <ul className="mt-1 space-y-2">
              {(rooms || []).map((room) => (
                <motion.li
                  key={room.code}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -14 }}
                  className="flex flex-col gap-2.5 rounded-xl border border-violet-500/22 bg-black/30 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-[15px] tracking-[.18em] text-cyan-100">{room.code}</span>
                      <Badge tone={statusTone(room.status)}>{room.status}</Badge>
                    </div>
                    <p className="mt-1 truncate text-[11.5px] text-violet-200/60">
                      host {room.hostName} · {room.playerCount} player{room.playerCount === 1 ? '' : 's'}
                      {room.round ? ` · round ${room.round}` : ''}
                      {room.phase ? ` · ${room.phase}` : ''}
                    </p>
                  </div>
                  <Button size="sm" variant="danger" onClick={() => setTarget(room)} className="shrink-0">
                    Terminate
                  </Button>
                </motion.li>
              ))}
            </ul>
          </AnimatePresence>
        </PanelBody>
      </Panel>

      <InlineNotice tone="info">
        Terminating closes the room for everyone instantly. Room documents also expire automatically after their TTL.
      </InlineNotice>

      <ConfirmDialog
        open={Boolean(target)}
        busy={working}
        title={target ? `Terminate room ${target.code}?` : ''}
        message={target ? `${target.playerCount} player${target.playerCount === 1 ? '' : 's'} will be disconnected immediately.` : ''}
        confirmLabel="Terminate room"
        onCancel={() => setTarget(null)}
        onConfirm={terminate}
      />
    </div>
  )
}

export default RoomManager
