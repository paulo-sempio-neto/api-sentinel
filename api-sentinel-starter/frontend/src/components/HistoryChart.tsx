import type { CheckResult } from '../api/types'
import { formatShortDateTime } from '../utils/formatters'

interface HistoryChartProps {
  checks: CheckResult[]
}

const chartWidth = 720
const chartHeight = 240
const padding = { top: 24, right: 28, bottom: 42, left: 54 }

export function HistoryChart({ checks }: HistoryChartProps) {
  const measurements = [...checks]
    .filter((check) => check.response_time_ms !== null)
    .reverse()

  if (measurements.length === 0) {
    return <p className="chart-empty">No latency measurements are available yet.</p>
  }

  const values = measurements.map((check) => check.response_time_ms as number)
  const maximum = Math.max(...values, 1)
  const minimum = Math.min(...values, 0)
  const span = Math.max(maximum - minimum, 1)
  const plotWidth = chartWidth - padding.left - padding.right
  const plotHeight = chartHeight - padding.top - padding.bottom
  const xFor = (index: number) => padding.left + (measurements.length === 1 ? plotWidth / 2 : (index / (measurements.length - 1)) * plotWidth)
  const yFor = (value: number) => padding.top + ((maximum - value) / span) * plotHeight
  const points = measurements.map((check, index) => `${xFor(index)},${yFor(check.response_time_ms as number)}`).join(' ')

  return (
    <figure className="history-chart">
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-labelledby="latency-chart-title latency-chart-description">
        <title id="latency-chart-title">Response time history</title>
        <desc id="latency-chart-description">A line chart of recorded endpoint response times in milliseconds, ordered from oldest to newest.</desc>
        {[0, 0.5, 1].map((ratio) => {
          const y = padding.top + ratio * plotHeight
          const label = Math.round(maximum - ratio * span)
          return (
            <g key={ratio}>
              <line className="chart-grid" x1={padding.left} x2={chartWidth - padding.right} y1={y} y2={y} />
              <text className="chart-axis-label" x={padding.left - 10} y={y + 4} textAnchor="end">{label} ms</text>
            </g>
          )
        })}
        <polyline className="chart-line" points={points} fill="none" />
        {measurements.map((check, index) => {
          const latency = check.response_time_ms as number
          return (
            <g key={check.id}>
              <circle className={check.success ? 'chart-point chart-point-success' : 'chart-point chart-point-failure'} cx={xFor(index)} cy={yFor(latency)} r="4">
                <title>{`${formatShortDateTime(check.checked_at)}: ${Math.round(latency)} ms`}</title>
              </circle>
            </g>
          )
        })}
        <text className="chart-axis-label" x={padding.left} y={chartHeight - 12}>{formatShortDateTime(measurements[0].checked_at)}</text>
        {measurements.length > 1 ? <text className="chart-axis-label" x={chartWidth - padding.right} y={chartHeight - 12} textAnchor="end">{formatShortDateTime(measurements[measurements.length - 1].checked_at)}</text> : null}
      </svg>
      <figcaption>Latency in milliseconds. Points reflect individual recorded checks.</figcaption>
    </figure>
  )
}
