import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import type { CheckResult } from '../api/types'
import { formatMs } from '../lib/stats'
import { formatDateTime, formatShortDateTime, formatStatusCode } from '../utils/formatters'

const HEIGHT = 260
const PAD = { top: 18, right: 16, bottom: 30, left: 56 }

function niceMax(value: number) {
  const steps = [50, 100, 200, 300, 500, 1000, 2000, 3000, 5000, 10000, 20000, 30000]
  return steps.find((step) => step >= value * 1.1) ?? Math.ceil(value / 10000) * 10000
}

/** Response time over time; failed checks are marked, hover shows the exact check. */
export function LatencyChart({ checks }: { checks: CheckResult[] }) {
  const reduce = useReducedMotion()
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(720)
  const [active, setActive] = useState<number | null>(null)

  useEffect(() => {
    const node = box.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const series = useMemo(() => [...checks].reverse(), [checks])
  const measured = series.filter((check) => check.response_time_ms !== null)

  if (measured.length === 0) {
    return <p className="chart-empty">No response times recorded yet. Run a check to start the chart.</p>
  }

  const max = niceMax(Math.max(...measured.map((check) => check.response_time_ms as number)))
  const plotW = width - PAD.left - PAD.right
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const x = (index: number) => PAD.left + (series.length === 1 ? plotW / 2 : (index / (series.length - 1)) * plotW)
  const y = (ms: number) => PAD.top + plotH - (ms / max) * plotH

  const points = series
    .map((check, index) => (check.response_time_ms === null ? null : ([x(index), y(check.response_time_ms)] as const)))
    .filter((point): point is readonly [number, number] => point !== null)
  const line = points.map(([px, py], index) => `${index === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ')
  const area = `${line} L${points[points.length - 1][0]},${PAD.top + plotH} L${points[0][0]},${PAD.top + plotH} Z`
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(max * ratio))
  // Hide the 300 ms line when the scale is so large it would crowd the 1 s line.
  const thresholds = [300, 1000].filter((ms) => ms < max && !(ms === 300 && max > 1000 && (700 / max) * plotH < 18))

  function onMove(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const px = ((event.clientX - rect.left) / rect.width) * width
    const ratio = (px - PAD.left) / plotW
    setActive(Math.max(0, Math.min(series.length - 1, Math.round(ratio * (series.length - 1)))))
  }

  const current = active !== null ? series[active] : null

  return (
    <div className="chart" ref={box}>
      <svg
        viewBox={`0 0 ${width} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
        role="img"
        aria-label={`Response times for the last ${series.length} checks, from ${formatMs(Math.min(...measured.map((c) => c.response_time_ms as number)))} to ${formatMs(Math.max(...measured.map((c) => c.response_time_ms as number)))}.`}
        onPointerMove={onMove}
        onPointerLeave={() => setActive(null)}
      >
        <defs>
          <linearGradient id="latency-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--signal)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--signal)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((tick) => (
          <g key={tick}>
            <line className="chart__grid" x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} />
            <text className="chart__axis num" x={PAD.left - 10} y={y(tick) + 4} textAnchor="end">
              {formatMs(tick)}
            </text>
          </g>
        ))}
        {thresholds.map((ms) => (
          <g key={`t-${ms}`}>
            <line className={`chart__threshold chart__threshold--${ms === 1000 ? 'slow' : 'ok'}`} x1={PAD.left} x2={width - PAD.right} y1={y(ms)} y2={y(ms)} />
            <text className="chart__threshold-label" x={PAD.left + 6} y={y(ms) - 6}>
              {ms === 1000 ? 'Slow' : 'Fast'} {ms === 1000 ? 'above' : 'below'} {formatMs(ms)}
            </text>
          </g>
        ))}
        <motion.path
          d={area}
          fill="url(#latency-fill)"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        />
        <motion.path
          d={line}
          className="chart__line"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        />
        {series.map((check, index) =>
          check.success ? null : (
            <g key={check.id} className="chart__fail">
              <line x1={x(index)} x2={x(index)} y1={PAD.top} y2={PAD.top + plotH} />
              <circle cx={x(index)} cy={check.response_time_ms === null ? PAD.top + plotH : y(check.response_time_ms)} r="4.5" />
            </g>
          ),
        )}
        {current ? (
          <g className="chart__cursor">
            <line x1={x(active!)} x2={x(active!)} y1={PAD.top} y2={PAD.top + plotH} />
            {current.response_time_ms !== null ? <circle cx={x(active!)} cy={y(current.response_time_ms)} r="5.5" /> : null}
          </g>
        ) : null}
        <text className="chart__axis" x={PAD.left} y={HEIGHT - 8}>
          {formatShortDateTime(series[0].checked_at)}
        </text>
        {series.length > 1 ? (
          <text className="chart__axis" x={width - PAD.right} y={HEIGHT - 8} textAnchor="end">
            {formatShortDateTime(series[series.length - 1].checked_at)}
          </text>
        ) : null}
      </svg>
      {current ? (
        <div
          className="chart__tip"
          style={{ left: `${(x(active!) / width) * 100}%` }}
          data-side={x(active!) > width * 0.7 ? 'left' : 'right'}
        >
          <strong className={current.success ? '' : 'is-fail'}>{current.success ? 'Passed' : 'Failed'}</strong>
          {current.response_time_ms === null ? <span>No response received</span> : <span className="num">{formatMs(current.response_time_ms)}</span>}
          <span className="code">{formatStatusCode(current.status_code)}</span>
          <span>{formatDateTime(current.checked_at)}</span>
        </div>
      ) : null}
    </div>
  )
}
