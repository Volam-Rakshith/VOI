/**
 * Modal — accessible dialog: Escape to close, backdrop click, focus move,
 * body scroll lock and a spring entrance. Used by confirmations, the Black Box
 * gate and any blocking decision.
 */

import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useSettings } from '../../context/SettingsContext.jsx'

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer = null,
  size = 'md',
  dismissible = true,
  labelledBy = 'modal-title',
}) {
  const { motionOff } = useSettings()
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return () => {}
    const onKey = (event) => {
      if (event.key === 'Escape' && dismissible) onClose?.()
      if (event.key === 'Tab') {
        const node = panelRef.current
        if (!node) return
        const focusables = node.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
        if (!focusables.length) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusTimer = setTimeout(() => {
      const node = panelRef.current?.querySelector('[data-autofocus]') || panelRef.current
      node?.focus?.()
    }, 60)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      clearTimeout(focusTimer)
    }
  }, [open, onClose, dismissible])

  const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-3xl' }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[150] flex items-end justify-center p-3 sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-black/72 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: motionOff ? 0 : 0.22 }}
            onClick={() => dismissible && onClose?.()}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? labelledBy : undefined}
            tabIndex={-1}
            initial={{ opacity: 0, y: motionOff ? 0 : 32, scale: motionOff ? 1 : 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: motionOff ? 0 : 18, scale: motionOff ? 1 : 0.98 }}
            transition={motionOff ? { duration: 0 } : { type: 'spring', stiffness: 340, damping: 30 }}
            className={`glass-strong clip-hud relative w-full ${widths[size] || widths.md} overflow-hidden`}
          >
            <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-neon/70 to-transparent" />
            {(title || subtitle) && (
              <div className="px-5 pb-3 pt-5">
                {title && (
                  <h2 id={labelledBy} className="font-display text-[15px] tracking-[.16em] text-violet-50">
                    {title}
                  </h2>
                )}
                {subtitle && <p className="mt-1 text-[12.5px] leading-relaxed text-violet-200/60">{subtitle}</p>}
              </div>
            )}
            <div className="px-5 pb-2">{children}</div>
            {footer && <div className="flex flex-col-reverse gap-2 px-5 pb-5 pt-3 sm:flex-row sm:justify-end">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

export default Modal
