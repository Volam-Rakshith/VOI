/**
 * OnlineSession — single mount point for the online hook.
 * Renders the setup panel when the player is not in a room, the lobby while
 * the room waits, and the in-game screens once play begins.
 */

import { useEffect, useState } from 'react'
import { useOnlineRoom } from '../../hooks/useOnlineRoom.js'
import { Modal } from '../ui/Modal.jsx'
import { BackendPanel } from './BackendPanel.jsx'
import { useWordBank } from '../../context/WordBankContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { LobbyView } from './LobbyView.jsx'
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

  const configureModal = (
    <Modal
      open={configureOpen}
      onClose={() => setConfigureOpen(false)}
      title="Connect a backend"
      subtitle="Online rooms run on your own free Supabase project. Paste the two public values once — stored on this device, applied instantly."
      size="lg"
    >
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
        {renderSetup({
          configured: online.configured,
          backend: online.backend,
          onConfigure: () => setConfigureOpen(true),
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
      {inLobby ? (
        <LobbyView online={online} onExit={onExit} />
      ) : (
        <OnlineGamePhases online={online} onExit={onExit} />
      )}
    </>
  )
}

export default OnlineSession
