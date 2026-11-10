import type { CheckResult } from '../../api/types'

/** Tiny latency trend for list rows; oldest on the left. */
export function Sparkline({ checks, points = 24 }: { checks: CheckResult[]; points?: number }) {
  const values = checks
    .slice(0, points)
    .reverse()
    .map((check) => check.response_time_ms)
    .filter((value): value is number => value !== null)

  if (values.length < 2) return <span className="spark spark--empty" aria-hidden="true" />

  const width = 96
  const height = 28
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = Math.max(max - min, 1)
  const coords = values.map((value, index) => [
    (index / (values.length - 1)) * width,
    height - 3 - ((value - min) / span) * (height - 6),
  ])
  const line = coords.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const [lastX, lastY] = coords[coords.length - 1]

  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={`${line} L${width},${height} L0,${height} Z`} className="spark__area" />
      <path d={line} className="spark__line" />
      <circle cx={lastX} cy={lastY} r="2.6" className="spark__dot" />
    </svg>
  )
}
