import { useState } from 'react';
import { motion as Motion, AnimatePresence } from 'motion/react';
import { Particles } from './particles';
import { AnimatedTree } from './animated-tree';
import { Navbar } from './navbar';
import { useTheme } from '../theme-context';
import { useNavigate } from 'react-router';
import { Sparkles, Sparkle, ChevronDown, ChevronUp, Lightbulb, Zap, Droplets, Leaf, Globe } from 'lucide-react';
import { cn } from '../components/ui/utils';

const FADE = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, delay, ease: 'easeOut' as const },
});

// ─── Mission section helpers ──────────────────────────────────────────────────

const FeatureBox = ({ title, description, className }: { title: string; description: string; className?: string }) => (
  <Motion.div
    initial={{ opacity: 0, y: 30 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-50px' }}
    transition={{ duration: 0.8, ease: [0.21, 0.45, 0.32, 0.9] }}
    className={cn(
      'relative z-20 p-8 rounded-3xl border border-white/5 bg-zinc-900/50 backdrop-blur-xl flex flex-col gap-4 max-w-[380px] group transition-all duration-500 hover:border-green-500/30 hover:bg-zinc-900/80 shadow-2xl',
      className
    )}
  >
    <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-green-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
    <h3
      className="text-2xl font-semibold tracking-tight text-white relative z-10"
      style={{ fontFamily: "'Playfair Display', serif" }}
    >
      {title}
    </h3>
    <p
      className="text-base leading-relaxed text-zinc-400 relative z-10"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {description}
    </p>
  </Motion.div>
);

const FloatingStat = ({
  icon: Icon,
  value,
  label,
  className,
  delay = 0,
  pulsing = false,
}: {
  icon: React.ElementType;
  value: string;
  label: string;
  className?: string;
  delay?: number;
  pulsing?: boolean;
}) => (
  <Motion.div
    initial={{ opacity: 0, scale: 0.8 }}
    whileInView={{ opacity: 1, scale: 1 }}
    viewport={{ once: true }}
    transition={{ delay, duration: 0.5 }}
    className={cn('absolute z-30 flex flex-col items-center gap-3 text-center', className)}
  >
    <div className="relative group">
      <div className="absolute inset-0 blur-2xl bg-green-500/20 group-hover:bg-green-500/40 transition-colors duration-500 animate-pulse" />
      <Motion.div
        animate={pulsing ? { scale: [1, 1.05, 1], opacity: [0.8, 1, 0.8] } : {}}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        className="relative p-4 rounded-2xl bg-zinc-900 border border-white/10 group-hover:border-green-500/40 transition-all duration-300"
      >
        <Icon className="w-6 h-6 text-green-400" />
      </Motion.div>
    </div>
    <div className="flex flex-col">
      <span
        className="text-xl font-bold tracking-tighter text-white"
        style={{ filter: 'drop-shadow(0 0 8px rgba(34,197,94,0.4))' }}
      >
        {value}
      </span>
      <span
        className="text-[8px] uppercase tracking-[0.2em] text-zinc-500 font-bold whitespace-nowrap"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {label}
      </span>
    </div>
  </Motion.div>
);

const PulsingBulbStat = ({ className }: { className?: string }) => (
  <Motion.div
    initial={{ opacity: 0, scale: 0.8 }}
    whileInView={{ opacity: 1, scale: 1 }}
    viewport={{ once: true }}
    className={cn('absolute z-30 flex flex-col items-center gap-3 text-center', className)}
  >
    <div className="relative group">
      <div className="absolute inset-0 blur-2xl bg-yellow-500/20 group-hover:bg-yellow-500/40 transition-colors duration-500 animate-pulse" />
      <Motion.div
        animate={{
          scale: [1, 1.1, 1],
          filter: [
            'drop-shadow(0 0 5px rgba(250,204,21,0.2))',
            'drop-shadow(0 0 15px rgba(250,204,21,0.5))',
            'drop-shadow(0 0 5px rgba(250,204,21,0.2))',
          ],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        className="relative p-3 rounded-2xl bg-zinc-900 border border-white/10 group-hover:border-yellow-500/40 transition-colors duration-300"
      >
        <Lightbulb className="w-6 h-6 text-yellow-400" />
      </Motion.div>
    </div>
    <div className="flex flex-col">
      <span
        className="text-lg font-bold tracking-tighter text-white whitespace-nowrap"
        style={{ fontFamily: "'Playfair Display', serif" }}
      >
        1M API Calls ≈ 10kWh
      </span>
      <span
        className="text-[8px] uppercase tracking-[0.2em] text-zinc-500 font-bold"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        Wasted energy identified
      </span>
    </div>
  </Motion.div>
);

const WindingPath = () => (
  <div className="absolute inset-0 pointer-events-none overflow-visible">
    <svg
      className="w-full h-full"
      viewBox="0 0 1200 800"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="path-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#22c55e" stopOpacity="0" />
          <stop offset="20%"  stopColor="#22c55e" stopOpacity="0.4" />
          <stop offset="50%"  stopColor="#22c55e" stopOpacity="0.8" />
          <stop offset="80%"  stopColor="#22c55e" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="4" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <Motion.path
        d="M 150,250 C 350,250 450,550 600,550 C 750,550 850,200 1050,200"
        stroke="url(#path-gradient)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="12 20"
        filter="url(#glow)"
        initial={{ pathLength: 0, opacity: 0 }}
        whileInView={{ pathLength: 1, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 3, ease: 'easeInOut' }}
      />
      <Motion.circle
        r="4"
        fill="#22c55e"
        filter="url(#glow)"
        style={{
          offsetPath: "path('M 150,250 C 350,250 450,550 600,550 C 750,550 850,200 1050,200')",
          offsetDistance: '0%',
        }}
        animate={{ offsetDistance: ['0%', '100%'] } as any}
        transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
      />
    </svg>
  </div>
);

// ─── Landing Page ─────────────────────────────────────────────────────────────

export function LandingPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const [showFireflies, setShowFireflies] = useState(true);

  return (
    <div className="relative w-full transition-colors duration-1000" style={{ backgroundColor: theme.bg }}>
      {/* ===== HERO SECTION ===== */}
      <div className="relative h-screen overflow-hidden">
        {/* === SKY GRADIENT === */}
        <div
          className="absolute inset-0 z-0 transition-all duration-1000"
          style={{ background: theme.skyGradient }}
        />

        {/* Warm horizon glow */}
        <div
          className="absolute bottom-[22%] left-1/2 -translate-x-1/2 w-[140%] h-[30%] opacity-20 z-[1] transition-all duration-1000"
          style={{
            background: `radial-gradient(ellipse 60% 50% at 50% 80%, ${theme.horizonGlow} 0%, transparent 70%)`,
          }}
        />

        {/* Mist layers */}
        <Motion.div
          className="absolute bottom-[20%] left-[-10%] w-[120%] h-[30%] opacity-[0.04] z-[1]"
          style={{
            background: `radial-gradient(ellipse at center, ${theme.mistColor}, transparent 70%)`,
          }}
          animate={{ x: [-20, 20, -20], opacity: [0.03, 0.05, 0.03] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        />
        <Motion.div
          className="absolute bottom-[25%] left-[-20%] w-[140%] h-[20%] opacity-[0.03] z-[5] pointer-events-none"
          style={{
            background: `linear-gradient(90deg, transparent, ${theme.mistColor}, transparent)`,
          }}
          animate={{ x: [40, -40, 40] }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Floating particles */}
        <AnimatePresence>
          {showFireflies && (
            <Motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1 }}
            >
              <Particles />
            </Motion.div>
          )}
        </AnimatePresence>

        {/* === SVG TREE + STATIC GROUND === */}
        <AnimatedTree />

        {/* Navbar */}
        <Navbar />

        {/* Dark overlay for text readability */}
        <div
          className="absolute inset-0 z-[6] pointer-events-none transition-opacity duration-1000"
          style={{
            backgroundImage: `linear-gradient(to bottom, ${theme.bg}AA 0%, transparent 100%)`,
            opacity: theme.id === 'purple' ? 1 : 0.4,
          }}
        />

        {/* === HERO CONTENT === */}
        <div className="relative z-[10] flex flex-col items-center justify-center h-full px-4 pb-[55vh]">
          <div className="flex flex-col items-center text-center">
            {/* Title */}
            <Motion.h1
              className="inline-block"
              style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: 'clamp(3.5rem, 12vw, 10rem)',
                fontWeight: 900,
                letterSpacing: '-0.02em',
                lineHeight: 1,
                color: '#ffffff',
                filter: `drop-shadow(0 4px 12px ${theme.textTitleGrad[0]}44)`,
              }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            >
              EcoApi
            </Motion.h1>

            {/* Tagline */}
            <Motion.p
              className="mt-4 md:mt-6 tracking-[0.25em] uppercase drop-shadow-[0_2px_15px_rgba(0,0,0,0.3)]"
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 'clamp(0.7rem, 1.5vw, 0.9rem)',
                fontWeight: 500,
                fontStyle: 'italic',
                color: theme.textTagline,
              }}
              initial={{ opacity: 0, letterSpacing: '0.1em' }}
              animate={{ opacity: 1, letterSpacing: '0.25em' }}
              transition={{ duration: 1.5, delay: 0.8, ease: 'easeOut' }}
            >
              Clean Code &bull; Low Costs
            </Motion.p>

            {/* CTA Buttons */}
            <Motion.div
              className="flex flex-col sm:flex-row items-center gap-4 mt-10 md:mt-14"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 1, ease: 'easeOut' }}
            >
              {/* Primary: Extension → /extension */}
              <button
                onClick={() => navigate('/extension')}
                className="relative group px-8 py-3.5 rounded-full overflow-hidden transition-all duration-300 hover:-translate-y-0.5 cursor-pointer"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                <div
                  className="absolute inset-0 opacity-90 group-hover:opacity-100 transition-opacity"
                  style={{ background: `linear-gradient(to right, ${theme.btnGradient[0]}, ${theme.btnGradient[1]})` }}
                />
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ boxShadow: `0 0 30px ${theme.btnShadow}` }}
                />
                <span className="relative z-10 text-white tracking-wider" style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                  Extension
                </span>
              </button>

              {/* Secondary: API → /docs */}
              <button
                onClick={() => navigate('/docs')}
                className="px-8 py-3.5 rounded-full border transition-all duration-300 hover:-translate-y-0.5 cursor-pointer"
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '0.9rem',
                  fontWeight: 500,
                  letterSpacing: '0.04em',
                  color: '#ffffff',
                  backgroundColor: 'rgba(255,255,255,0.12)',
                  borderColor: 'rgba(255,255,255,0.3)',
                }}
              >
                API
              </button>
            </Motion.div>
          </div>
        </div>

        {/* Bottom vignette */}
        <div
          className="absolute bottom-0 left-0 right-0 h-[25%] z-[4] pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(to top, ${theme.bg} 0%, transparent 100%)`,
          }}
        />

        {/* Scroll down indicator */}
        <Motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[10] flex flex-col items-center gap-1 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.45 }}
          transition={{ duration: 1, delay: 1.8 }}
        >
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>scroll</span>
          <Motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          >
            <ChevronDown size={18} color="rgba(255,255,255,0.5)" />
          </Motion.div>
        </Motion.div>

        {/* UI Controls (Particle Toggle) */}
        <div className="fixed bottom-6 left-6 z-[100]">
          <button
            onClick={() => setShowFireflies(!showFireflies)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-medium transition-all border"
            style={{
              backgroundColor: showFireflies ? 'rgba(255,255,255,0.1)' : 'transparent',
              borderColor: showFireflies ? '#ffffff44' : '#ffffff22',
              color: showFireflies ? '#ffffff' : '#ffffff66',
            }}
          >
            {showFireflies ? <Sparkles size={12} /> : <Sparkle size={12} />}
            <span>Fireflies: {showFireflies ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      </div>

      {/* ===== SUSTAINABILITY SECTION ===== */}
      <div className="relative overflow-hidden bg-[#020202]">
        {/* Top fade from hero bg to black */}
        <div
          className="absolute top-0 left-0 right-0 h-32 pointer-events-none z-0"
          style={{ background: `linear-gradient(to bottom, ${theme.bg}, #020202)` }}
        />

        {/* Ambient green glow blobs */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-green-900/10 blur-[150px] rounded-full pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-green-900/10 blur-[150px] rounded-full pointer-events-none" />

        <main className="relative z-[1] max-w-7xl mx-auto px-6 pt-32 pb-[30px] flex flex-col items-center">
          {/* Section header */}
          <Motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="text-center mb-16 space-y-6"
          >
            <h2
              className="text-[56px] md:text-[80px] text-white"
              style={{ fontFamily: "'Playfair Display', serif", fontWeight: 900, lineHeight: 1.05 }}
            >
              Our Mission
            </h2>
            <p
              className="max-w-xl mx-auto text-[15px] leading-relaxed"
              style={{ color: 'rgba(255,255,255,0.45)', fontFamily: "'Inter', sans-serif" }}
            >
              Software efficiency is an environmental issue. EcoApi exists to make every unnecessary API call visible and every optimization count.
            </p>
          </Motion.div>

          {/* Main layout: winding path + feature boxes + floating stats */}
          <div className="relative w-full max-w-6xl py-32 min-h-[900px]">
            <WindingPath />

            {/* Three feature boxes */}
            <div className="relative z-10 w-full h-full flex flex-col md:flex-row items-start justify-between gap-24 md:gap-0">
              <div className="md:w-1/3 flex flex-col items-center md:items-start">
                <FeatureBox
                  title="Sustainable by Design"
                  description="EcoApi surfaces redundant calls, N+1 patterns, and cacheable endpoints so your code ships leaner and consumes less energy."
                  className="md:-translate-y-[50px]"
                />
              </div>
              <div className="md:w-1/3 flex flex-col items-center">
                <FeatureBox
                  title="Environmental Impact"
                  description="AI-powered scanning will estimate electricity (kWh) and water (L) consumed per scan, not just dollars saved."
                  className="md:translate-y-[400px]"
                />
              </div>
              <div className="md:w-1/3 flex flex-col items-center md:items-end">
                <FeatureBox
                  title="Why It Matters"
                  description="Small inefficiencies at scale add up to tons of CO₂. EcoApi makes every optimization visible, measurable, and actionable."
                  className="md:-translate-y-[100px]"
                />
              </div>
            </div>

            {/* Floating stat bubbles — realistic averages for typical projects */}
            <FloatingStat icon={Zap} value="85 kWh" label="Monthly kWh Saved" className="left-[47.07%] top-[10.55%] -translate-x-1/2 -translate-y-1/2" delay={0.5} pulsing />
            <PulsingBulbStat className="left-[13.22%] top-[60.33%] -translate-x-1/2 -translate-y-1/2" />
            <FloatingStat icon={Globe} value="12k" label="API Calls Analyzed" className="left-[38%] top-[43.22%] -translate-x-1/2 -translate-y-1/2" delay={0.7} pulsing />
            <FloatingStat icon={Leaf} value="33 kg" label="CO2 Offset" className="left-[61.57%] top-[37.77%] -translate-x-1/2 -translate-y-1/2" delay={0.9} pulsing />
            <FloatingStat icon={Droplets} value="153 L" label="Water Cooling" className="left-[85.27%] top-[56.66%] -translate-x-1/2 -translate-y-1/2" delay={1.1} pulsing />
          </div>

          <p
            className="text-center text-[13px] mt-12 mb-4"
            style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif" }}
          >
            The stats above are based on averages per project.
          </p>

          {/* Back to top */}
          <Motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-4"
          >
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full text-white text-[15px] transition-all hover:-translate-y-0.5"
              style={{
                backgroundColor: 'rgba(255,255,255,0.10)',
                border: '1px solid rgba(255,255,255,0.25)',
                backdropFilter: 'blur(8px)',
                fontFamily: "'Inter', sans-serif",
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <ChevronUp size={16} />
              Up
            </button>
          </Motion.div>
        </main>
      </div>
    </div>
  );
}
