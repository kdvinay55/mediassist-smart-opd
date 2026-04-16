import { motion } from 'framer-motion';

const BAR_COUNT = 5;

export default function VoiceWaveAnimation({ state = 'idle', size = 'md' }) {
  const sizeMap = { sm: { h: 16, w: 2, gap: 1 }, md: { h: 24, w: 3, gap: 1.5 }, lg: { h: 36, w: 4, gap: 2 } };
  const s = sizeMap[size] || sizeMap.md;

  const colorMap = {
    idle: 'bg-gray-300',
    listening: 'bg-blue-500',
    processing: 'bg-amber-500',
    speaking: 'bg-emerald-500'
  };
  const barColor = colorMap[state] || colorMap.idle;

  if (state === 'idle') {
    return (
      <div className="flex items-center justify-center" style={{ gap: s.gap * 4, height: s.h }}>
        {Array.from({ length: BAR_COUNT }).map((_, i) => (
          <div key={i} className={`rounded-full ${barColor}`} style={{ width: s.w, height: s.h * 0.15 }} />
        ))}
      </div>
    );
  }

  if (state === 'processing') {
    return (
      <div className="flex items-center justify-center" style={{ gap: s.gap * 4, height: s.h }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <motion.div
            key={i}
            className={`rounded-full ${barColor}`}
            style={{ width: s.w * 2, height: s.w * 2 }}
            animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.2, ease: 'easeInOut' }}
          />
        ))}
      </div>
    );
  }

  // listening or speaking — animated wave bars
  return (
    <div className="flex items-center justify-center" style={{ gap: s.gap * 4, height: s.h }}>
      {Array.from({ length: BAR_COUNT }).map((_, i) => {
        const delays = [0, 0.15, 0.3, 0.15, 0];
        const amplitudes = state === 'speaking'
          ? [0.3, 0.7, 1.0, 0.7, 0.3]
          : [0.4, 0.8, 1.0, 0.8, 0.4];

        return (
          <motion.div
            key={i}
            className={`rounded-full ${barColor}`}
            style={{ width: s.w, minHeight: s.h * 0.15 }}
            animate={{
              height: [s.h * 0.15, s.h * amplitudes[i], s.h * 0.15]
            }}
            transition={{
              duration: state === 'speaking' ? 0.5 : 0.7,
              repeat: Infinity,
              delay: delays[i],
              ease: 'easeInOut'
            }}
          />
        );
      })}
    </div>
  );
}
