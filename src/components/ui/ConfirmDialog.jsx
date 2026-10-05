/** ConfirmDialog — destructive actions always require an explicit confirm. */

import { Modal } from './Modal.jsx'
import { Button } from './Button.jsx'

export function ConfirmDialog({
  open,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      subtitle={message}
      size="sm"
      dismissible={!busy}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} size="sm" onClick={onConfirm} disabled={busy} data-autofocus>
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="h-2" />
    </Modal>
  )
}

export default ConfirmDialog
