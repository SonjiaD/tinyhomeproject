import { AnimatePresence, motion } from 'framer-motion'

interface ProgressToastProps {
  visible: boolean
  label: string
  done?: number
  total?: number
}

export function ProgressToast({ visible, label, done, total }: ProgressToastProps) {
  const hasProgress = done !== undefined && total !== undefined && total > 0
  const pct = hasProgress ? Math.round((done! / total!) * 100) : 0

  return (
    <AnimatePresence>
      {visible && (
        <div className="fixed inset-0 z-[9995] flex items-center justify-center pointer-events-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="w-72 bg-primary-900 border border-teal-600/50 rounded-2xl px-6 py-5 shadow-2xl"
        >
          {/* Spinner + label */}
          <div className="flex items-center gap-3 mb-3">
            <svg className="animate-spin w-4 h-4 text-teal-400 shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-white text-sm font-semibold">{label}</span>
          </div>

          {/* Progress bar track */}
          <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden mb-2">
            {hasProgress ? (
              <motion.div
                className="h-full bg-teal-400 rounded-full origin-left"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: pct / 100 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                style={{ transformOrigin: 'left center', width: '100%' }}
              />
            ) : (
              /* Indeterminate sweep */
              <motion.div
                className="h-full w-2/5 bg-teal-400 rounded-full"
                animate={{ x: ['-100%', '350%'] }}
                transition={{ repeat: Infinity, duration: 1.1, ease: 'easeInOut' }}
              />
            )}
          </div>

          {/* Count + percentage */}
          {hasProgress && (
            <div className="flex justify-between items-center">
              <span className="text-teal-300/60 text-xs">
                {done!.toLocaleString()} of {total!.toLocaleString()}
              </span>
              <span className="text-teal-400 text-xs font-semibold">{pct}%</span>
            </div>
          )}
        </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
