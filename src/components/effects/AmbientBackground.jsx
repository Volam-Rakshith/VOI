/**
 * AmbientBackground — the atmospheric layer that sits behind every screen.
 *
 * • gradient orbs + neon grid + vignette are pure CSS (compositor only)
 * • particles run on ONE canvas rAF loop, sized by device + intensity setting
 * • pointer / touch / device-tilt produce a subtle parallax drift
 * • reduced motion or intensity=calm drops to a static, zero-cost backdrop
 */

import { useEffect, useRef } from 'react'
import { useSettings } from '../../context/SettingsContext.jsx'

const INTENSITY_COUNT = { 0: 0, 1: 46, 2: 84 }

export function AmbientBackground() {
  const canvasRef = useRef(null)
  const { settings, motionOff } = useSettings()
  const intensity = motionOff ? 0 : settings.intensity

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return () => {}

    const baseCount = INTENSITY_COUNT[intensity] ?? 46
    if (baseCount === 0) {
      const ctx = canvas.getContext('2d')
      ctx?.clearRect(0, 0, canvas.width, canvas.height)
      return () => {}
    }

    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return () => {}

    let width = 0
    let height = 0
    let dpr = 1
    let particles = []
    let raf = 0
    let running = true
    let lastFrame = 0
    const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 }
    const tilt = { x: 0, y: 0 }

    const COLORS = ['#22d3ee', '#a855f7', '#ff2bd1', '#ff5fa2', '#ffffff']

    const build = () => {
      const area = width * height
      const count = Math.max(12, Math.min(baseCount * 2, Math.round((area / 26000) * (baseCount / 40)) + baseCount / 2))
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 1.7 + 0.5,
        vx: (Math.random() - 0.5) * 0.16,
        vy: (Math.random() - 0.5) * 0.16 - 0.05,
        depth: Math.random() * 0.9 + 0.25,
        phase: Math.random() * Math.PI * 2,
        twinkle: Math.random() * 0.6 + 0.35,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      }))
    }

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1)
      width = canvas.clientWidth || window.innerWidth
      height = canvas.clientHeight || window.innerHeight
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      build()
    }

    const draw = (time) => {
      if (!running) return
      raf = requestAnimationFrame(draw)
      // ~45fps ceiling keeps mid-range phones cool.
      if (time - lastFrame < 22) return
      const dt = Math.min(48, time - lastFrame) / 16.67
      lastFrame = time

      pointer.x += (pointer.tx - pointer.x) * 0.045
      pointer.y += (pointer.ty - pointer.y) * 0.045

      ctx.clearRect(0, 0, width, height)

      const cx = (pointer.x - 0.5) * 2 + tilt.x
      const cy = (pointer.y - 0.5) * 2 + tilt.y

      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i]
        p.x += p.vx * dt * (0.4 + p.depth)
        p.y += p.vy * dt * (0.4 + p.depth)
        p.phase += 0.012 * dt

        if (p.x < -12) p.x = width + 12
        if (p.x > width + 12) p.x = -12
        if (p.y < -12) p.y = height + 12
        if (p.y > height + 12) p.y = -12

        const px = p.x + cx * 26 * p.depth
        const py = p.y + cy * 26 * p.depth
        const glow = 0.35 + Math.sin(p.phase) * 0.3 * p.twinkle
        const radius = p.r * (0.8 + p.depth * 0.8)

        ctx.beginPath()
        ctx.fillStyle = p.color
        ctx.globalAlpha = Math.max(0.05, glow * 0.75)
        ctx.shadowBlur = 12 * p.depth
        ctx.shadowColor = p.color
        ctx.arc(px, py, radius, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      ctx.shadowBlur = 0
    }

    const onPointer = (event) => {
      const point = event.touches?.[0] || event
      pointer.tx = point.clientX / window.innerWidth
      pointer.ty = point.clientY / window.innerHeight
    }

    const onTilt = (event) => {
      // Android exposes these without a prompt; iOS simply never fires them.
      if (typeof event.gamma !== 'number' || typeof event.beta !== 'number') return
      tilt.x = Math.max(-1, Math.min(1, event.gamma / 45)) * 0.35
      tilt.y = Math.max(-1, Math.min(1, (event.beta - 45) / 45)) * 0.25
    }

    const onVisibility = () => {
      if (document.hidden) {
        running = false
        cancelAnimationFrame(raf)
      } else if (!running) {
        running = true
        lastFrame = 0
        raf = requestAnimationFrame(draw)
      }
    }

    resize()
    raf = requestAnimationFrame(draw)

    window.addEventListener('resize', resize, { passive: true })
    window.addEventListener('pointermove', onPointer, { passive: true })
    window.addEventListener('touchmove', onPointer, { passive: true })
    window.addEventListener('deviceorientation', onTilt, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('touchmove', onPointer)
      window.removeEventListener('deviceorientation', onTilt)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [intensity])

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-void">
      {/* Atmospheric gradient wash */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(1200px 700px at 50% -12%, rgba(124,58,237,.42), transparent 68%),' +
            'radial-gradient(900px 620px at 88% 8%, rgba(34,211,238,.16), transparent 70%),' +
            'radial-gradient(1000px 700px at 6% 96%, rgba(255,43,209,.14), transparent 72%),' +
            'linear-gradient(180deg, #0B001A 0%, #0A0017 45%, #07000F 100%)',
        }}
      />

      {/* Perspective neon grid */}
      <div
        className="absolute inset-x-0 bottom-0 h-[46%] opacity-[.55]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(168,85,247,.20) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,.16) 1px, transparent 1px)',
          backgroundSize: '58px 42px',
          transform: 'perspective(520px) rotateX(66deg)',
          transformOrigin: 'bottom',
          maskImage: 'linear-gradient(to top, rgba(0,0,0,.9), transparent 78%)',
          WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,.9), transparent 78%)',
        }}
      />

      {/* Drifting glow orbs */}
      <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-limb/40 blur-[90px] animate-pulse-glow" />
      <div
        className="absolute right-[-70px] top-1/3 h-80 w-80 rounded-full bg-cyan-neon/20 blur-[110px] animate-pulse-glow"
        style={{ animationDelay: '1.6s' }}
      />
      <div
        className="absolute bottom-[-90px] left-1/3 h-72 w-72 rounded-full bg-magenta-neon/25 blur-[110px] animate-pulse-glow"
        style={{ animationDelay: '3s' }}
      />

      {/* Light streaks */}
      {intensity > 0 && !motionOff && (
        <div className="absolute inset-0 overflow-hidden opacity-40">
          <span
            className="absolute left-0 h-px w-[45%] animate-sweep bg-gradient-to-r from-transparent via-cyan-neon/70 to-transparent"
            style={{ top: '22%', animationDuration: '9s', animationIterationCount: 'infinite' }}
          />
          <span
            className="absolute left-0 h-px w-[35%] animate-sweep bg-gradient-to-r from-transparent via-magenta-neon/60 to-transparent"
            style={{ top: '68%', animationDuration: '13s', animationDelay: '3.5s', animationIterationCount: 'infinite' }}
          />
        </div>
      )}

      {/* Particle field */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Scanline + grain + vignette */}
      <div className="noise-plate absolute inset-0 opacity-[.05]" />
      <div
        className="absolute inset-0 opacity-[.06]"
        style={{
          backgroundImage: 'repeating-linear-gradient(180deg, rgba(255,255,255,.5) 0 1px, transparent 1px 3px)',
        }}
      />
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(120% 90% at 50% 45%, transparent 42%, rgba(4,0,12,.82) 100%)' }}
      />
    </div>
  )
}

export default AmbientBackground
