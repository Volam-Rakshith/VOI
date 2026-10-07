/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        void: {
          DEFAULT: '#0B001A',
          800: '#120126',
          700: '#180233',
          600: '#1F0440',
        },
        violet: {
          deep: '#2B0B52',
          neon: '#A855F7',
        },
        cyan: {
          neon: '#22D3EE',
        },
        magenta: {
          neon: '#FF2BD1',
        },
        pink: {
          hot: '#FF5FA2',
        },
        limb: '#7C3AED',
      },
      fontFamily: {
        display: ['Orbitron', 'Rajdhani', 'Impact', 'system-ui', 'sans-serif'],
        body: ['"Segoe UI"', 'system-ui', '-apple-system', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        neon: '0 0 12px rgba(168,85,247,.55), 0 0 42px rgba(124,58,237,.30)',
        'neon-cyan': '0 0 12px rgba(34,211,238,.55), 0 0 42px rgba(34,211,238,.22)',
        'neon-magenta': '0 0 12px rgba(255,43,209,.55), 0 0 42px rgba(255,43,209,.22)',
        inset: 'inset 0 1px 0 rgba(255,255,255,.08)',
        card: '0 30px 80px -20px rgba(0,0,0,.85)',
      },
      backgroundImage: {
        'grid-neon':
          'linear-gradient(rgba(168,85,247,.14) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,.10) 1px, transparent 1px)',
        'sweep': 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,.55) 50%, transparent 65%)',
      },
      backgroundSize: {
        grid: '46px 46px',
      },
      keyframes: {
        floaty: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        pulseGlow: {
          '0%,100%': { opacity: '.55', filter: 'blur(28px)' },
          '50%': { opacity: '.95', filter: 'blur(38px)' },
        },
        sweep: {
          '0%': { transform: 'translateX(-120%)' },
          '100%': { transform: 'translateX(220%)' },
        },
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        glitch: {
          '0%,100%': { transform: 'translate(0)' },
          '20%': { transform: 'translate(-2px,1px)' },
          '40%': { transform: 'translate(2px,-1px)' },
          '60%': { transform: 'translate(-1px,-2px)' },
          '80%': { transform: 'translate(1px,2px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        flicker: {
          '0%,100%': { opacity: '1' },
          '45%': { opacity: '.75' },
          '47%': { opacity: '1' },
          '62%': { opacity: '.6' },
          '64%': { opacity: '1' },
        },
        /* ---- cinematic open: the warp floor, the burst, the impacts ---- */
        warp: {
          '0%': { transform: 'perspective(420px) rotateX(72deg) translateZ(0) translateY(0)' },
          '100%': { transform: 'perspective(420px) rotateX(72deg) translateZ(0) translateY(46px)' },
        },
        'spin-slow': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        ring: {
          '0%': { transform: 'scale(.25)', opacity: '.85' },
          '70%': { opacity: '.22' },
          '100%': { transform: 'scale(2.6)', opacity: '0' },
        },
        flash: {
          '0%': { opacity: '0' },
          '18%': { opacity: '.9' },
          '100%': { opacity: '0' },
        },
        spark: {
          '0%': { transform: 'translate3d(0,0,0) scale(1)', opacity: '1' },
          '100%': { transform: 'translate3d(var(--sx),var(--sy),0) scale(.2)', opacity: '0' },
        },
        chroma: {
          '0%,100%': { textShadow: '0 0 12px rgba(34,211,238,.75), 0 0 34px rgba(168,85,247,.5)' },
          '35%': { textShadow: '-3px 0 0 rgba(255,43,209,.85), 3px 0 0 rgba(34,211,238,.85)' },
          '45%': { textShadow: '2px 0 0 rgba(34,211,238,.9), -2px 0 0 rgba(255,43,209,.7)' },
          '55%': { textShadow: '0 0 12px rgba(34,211,238,.75), 0 0 34px rgba(168,85,247,.5)' },
        },
        'beam-run': {
          '0%': { backgroundPosition: '-120% 0' },
          '100%': { backgroundPosition: '220% 0' },
        },
      },
      animation: {
        floaty: 'floaty 6s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 5s ease-in-out infinite',
        sweep: 'sweep 1.1s ease-in-out',
        scanline: 'scanline 5.5s linear infinite',
        glitch: 'glitch .38s steps(2) 2',
        shimmer: 'shimmer 2.6s linear infinite',
        flicker: 'flicker 4.5s ease-in-out infinite',
        warp: 'warp 1.5s linear infinite',
        'spin-slow': 'spin-slow 22s linear infinite',
        ring: 'ring 1.15s cubic-bezier(.16,1,.3,1) forwards',
        flash: 'flash .5s ease-out forwards',
        spark: 'spark .85s cubic-bezier(.16,1,.3,1) forwards',
        chroma: 'chroma .9s steps(3) 1',
        'beam-run': 'beam-run 1.5s linear infinite',
      },
    },
  },
  plugins: [],
}
