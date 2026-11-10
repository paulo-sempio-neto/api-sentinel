import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import type { CheckResult } from '../../api/types'
import { formatMs, latencyBand } from '../../lib/stats'
import { formatDateTime, formatStatusCode } from '../../utils/formatters'

interface UptimeStripProps {
  checks: CheckResult[]
  slots: number
  size?: 'sm' | 'lg'
  interactive?: boolean
}

/**
 * Status-page style strip: one bar per check, oldest on the left.
 * Empty slots render as faint placeholders so strips line up across rows.
 */
export function UptimeStrip({ checks, slots, size = 'sm', interactive = false }: UptimeStripProps) {
  const reduce = useReducedMotion()
  const [hovered, setHovered] = useState<CheckResult | null>(null)
  const recent = checks.slice(0, slots).reverse()
  const empty = Math.max(0, slots - recent.length)
  const failed = recent.filter((check) => !check.success).length

  return (
    <div className={`strip strip--${size}`}>
      <div
        className="strip__bars"
        role="img"
        aria-label={recent.length === 0 ? 'No checks recorded' : `Last ${recent.length} checks: ${recent.length - failed} passed, ${failed} failed`}
        onMouseLeave={() => setHovered(null)}
      >
        {Array.from({ length: empty }, (_, index) => (
          <span key={`empty-${index}`} className="strip__bar strip__bar--empty" />
        ))}
        <AnimatePresence initial={false}>
          {recent.map((check) => {
            const tone = !check.success ? 'fail' : latencyBand(check.response_time_ms) === 'slow' ? 'slow' : 'ok'
            return (
              <motion.span
                key={check.id}
                layout={!reduce}
                className={`strip__bar strip__bar--${tone} ${hovered?.id === check.id ? 'is-hovered' : ''}`}
                initial={reduce ? false : { scaleY: 0, opacity: 0 }}
                animate={{ scaleY: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 520, damping: 30 }}
                onMouseEnter={interactive ? () => setHovered(check) : undefined}
              />
            )
          })}
        </AnimatePresence>
      </div>
      {interactive ? (
        <div className="strip__readout" aria-live="off">
          {hovered ? (
            <>
              <span className={`strip__readout-state ${hovered.success ? '' : 'is-fail'}`}>{hovered.success ? 'Passed' : 'Failed'}</span>
              <span className="code">{formatStatusCode(hovered.status_code)}</span>
              <span className="num">{formatMs(hovered.response_time_ms)}</span>
              <span>{formatDateTime(hovered.checked_at)}</span>
            </>
          ) : (
            <span>Hover a bar to inspect that check.</span>
          )}
        </div>
      ) : null}
    </div>
  )
}
