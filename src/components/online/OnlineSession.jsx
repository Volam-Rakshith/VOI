/**
 * OnlineSession — single mount point for the online hook.
 * Renders the setup panel when the player is not in a room, the lobby while
 * the room waits, and the in-game screens once play begins.
 */

import { useEffect, useState } from 'react'
import { useOnlineRoom } from '../../hooks/useOnlineRoom.js'
import { Modal } from '../ui/Modal.jsx'
import { InlineNotice } from '../ui/Feedback.jsx'
import { BackendPanel } from './BackendPanel.jsx'
import { useWordBank } from '../../context/WordBankContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { LobbyView } from './LobbyView.jsx'
import { RefreshWarning } from '../game/RefreshWarning.jsx'
import { OnlineGamePhases } from './OnlineGamePhases.jsx'
import { ROOM_STATUS, STORAGE_KEYS } from '../../data/constants.js'
import { readJSON } from '../../utils/storage.js'

export function OnlineSession({ renderSetup, onExit }) {
  const bank = useWordBank()
  const toast = useToast()
  const online = useOnlineRoom(bank)
  const lastSession = readJSON(STORAGE_KEYS.session, null)
  const [configureOpen, setConfigureOpen] = useState(false)

  /* Surface connection problems as toasts too — banners can be missed. */
  useEffect(() => {
    if (online.connection.state === 'error' && online.connection.error) toast.error(online.connection.error)
  }, [online.connection.state, online.connection.error, toast])

  /*
   * A phone refresh mid-round used to drop the seat without warning. The room
   * and the player's seat are both restored, and this asks whether to carry on
   * or leave the table.
   */
  const refreshWarning = (
    <RefreshWarning
      active={Boolean(online.isInRoom && online.room?.game)}
      mode="online"
      onLeave={async () => {
        await online.actions.leave?.()
        onExit?.()
      }}
    />
  )

  /*
   * Room-level announcements that belong to nobody's chat: "you are the new
   * host", "X was removed", "the host removed you". Floating, dismissible, and
   * it never blocks a tap on the screens below.
   */
  const sessionNotice = online.notice ? (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[95] flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-md">
        <InlineNotice tone={online.notice.tone || 'info'} className="border-cyan-300/50 bg-black/85 text-[12.5px] shadow-[0_10px_40px_rgba(0,0,0,.6)]">
          <div className="flex items-start justify-between gap-3">
            <span>{online.notice.text}</span>
            <button type="button" aria-label="Dismiss notice" onClick={online.dismissNotice} className="shrink-0 font-display text-[10px] uppercase tracking-[.2em] text-white/55 hover:text-white">
              ✕
            </button>
          </div>
        </InlineNotice>
      </div>
    </div>
  ) : null

  const configureModal = (
    <Modal open={configureOpen} onClose={() => setConfigureOpen(false)} title="Connect a backend" subtitle="Online rooms run on your own free Supabase project. Connect once, then publish the one-file config — every player then joins with nothing to paste." size="lg">
      <BackendPanel
        onChanged={async (payload) => {
          const result = await online.actions.configureBackend(payload)
          if (result?.ok && payload.action === 'save') toast.success('Backend connected')
          if (result?.ok && payload.action === 'clear') toast.info('Backend values cleared')
          if (result?.ok === false) toast.error(result.error || 'Those values were rejected')
          return result
        }}
      />
    </Modal>
  )

  if (!online.isInRoom) {
    return (
      <>
        {refreshWarning}
        {sessionNotice}
        {renderSetup({
          configured: online.configured,
          backend: online.backend,
          onConfigure: () => setConfigureOpen(true),
          onCheckConfig: online.actions.checkPublishedConfig,
          busy: online.busy,
          lastSession,
          createRoom: (name, config) => online.actions.createRoom(name, config),
          joinRoom: (name, code) => online.actions.joinRoom(name, code),
          rejoin: async (session) => {
            const result = await online.actions.joinRoom(session.name, session.code)
            return result
          },
          connection: online.connection,
        })}
        {configureModal}
      </>
    )
  }

  const inLobby = !online.room?.game && online.room?.status === ROOM_STATUS.LOBBY

  return (
    <>
      {refreshWarning}
      {inLobby ? <LobbyView online={online} onExit={onExit} /> : <OnlineGamePhases online={online} onExit={onExit} />}
      {sessionNotice}
    </>
  )
}

export default OnlineSession
