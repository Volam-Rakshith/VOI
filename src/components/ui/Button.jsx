/**
 * Button — the single interactive primitive.
 * Framer Motion supplies the press/release spring; a magnetic pull is applied
 * on pointer-fine devices for the "physical" desktop feel.
 */

import { forwardRef, useCallback, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useSettings } from '../../context/SettingsContext.jsx'

const VARIANTS = {
  default: 'btn',
  primary: 'btn btn-primary',
  ghost: 'btn btn-ghost',
  danger: 'btn btn-danger',
  quiet: 'btn btn-ghost border-transparent bg-transparent shadow-none',
}

const SIZES = {
  sm: 'btn-sm',
  md: '',
  lg: 'min-h-[58px] text-[14px]',
}

export const Button = forwardRef(function Button(
  {
    children,
    variant = 'default',
    size = 'md',
    magnetic = true,
    className = '',
    fullWidth = false,
    onClick,
    ...rest
  },
  ref,
) {
  const { motionOff, vibrate } = useSettings()
  const [pulled, setPulled] = useState({ x: 0, y: 0 })
  const localRef = useRef(null)
  const hoverFine = useRef(
    typeof window !== 'undefined' ? window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? false : false,
  )

  const handleMove = useCallback(
    (event) => {
      if (motionOff || !magnetic || !hoverFine.current || rest.disabled) return
      const node = localRef.current
      if (!node) return
      const rect = node.getBoundingClientRect()
      const dx = (event.clientX - (rect.left + rect.width / 2)) / rect.width
      const dy = (event.clientY - (rect.top + rect.height / 2)) / rect.height
      setPulled({ x: dx * 7, y: dy * 5 })
    },
    [magnetic, motionOff, rest.disabled],
  )

  const reset = useCallback(() => setPulled({ x: 0, y: 0 }), [])

  const handleClick = (event) => {
    vibrate?.(10)
    // The click cue itself is handled globally (Settings -> Sound), so no
    // per-button audio wiring is needed here.
    onClick?.(event)
  }

  return (
    <motion.button
      ref={(node) => {
        localRef.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) ref.current = node
      }}
      type={rest.type || 'button'}
      animate={{ x: pulled.x, y: pulled.y }}
      whileHover={motionOff || rest.disabled ? undefined : { scale: 1.018 }}
      whileTap={motionOff || rest.disabled ? undefined : { scale: 0.972 }}
      transition={{ type: 'spring', stiffness: 420, damping: 28, mass: 0.5 }}
      onPointerMove={handleMove}
      onPointerLeave={reset}
      onBlur={reset}
      onClick={handleClick}
      className={`${VARIANTS[variant] || VARIANTS.default} ${SIZES[size] || ''} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      <span className="relative z-10 inline-flex items-center justify-center gap-2">{children}</span>
    </motion.button>
  )
})

export default Button
