import { motion, useReducedMotion } from 'motion/react'
import { Activity, ChevronRight, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { EndpointSummary } from '../api/types'
import { formatMs, formatPercent, historyStats, hostOf, latencyBand, timeAgo } from '../lib/stats'
import { formatStatusCode } from '../utils/formatters'
import { Sparkline } from './ui/Sparkline'
import { StatusDot } from './ui/StatusPill'
import { UptimeStrip } from './ui/UptimeStrip'

interface EndpointRowProps {
  summary: EndpointSummary
  index: number
  now: number
  checking: boolean
  disabled: boolean
  onCheck: (id: number) => void
  onRemove: (id: number) => void
}

export function EndpointRow({ summary, index, now, checking, disabled, onCheck, onRemove }: EndpointRowProps) {
  const reduce = useReducedMotion()
  const { endpoint, history, latestCheck, status } = summary
  const stats = historyStats(history)

  return (
    <motion.li
      layout={!reduce}
      className={`erow erow--${status} ${checking ? 'is-checking' : ''}`}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0, transition: { delay: Math.min(index, 8) * 0.04, duration: 0.35 } }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, x: -20, transition: { duration: 0.2 } }}
    >
      <div className="erow__identity">
        <StatusDot status={status} />
        <div className="erow__names">
          <Link className="erow__link" to={`/endpoints/${endpoint.id}`}>
            {endpoint.name}
          </Link>
          <span className="erow__url code" title={endpoint.url}>
            {hostOf(endpoint.url)}
            <span className="erow__path">{endpoint.url.replace(/^https?:\/\/[^/]+/, '')}</span>
          </span>
        </div>
      </div>

      <div className="erow__strip">
        <UptimeStrip checks={history} slots={30} />
        <span className="erow__caption">
          {latestCheck ? (
            <>
              {latestCheck.success ? 'Passed' : 'Failed'} {timeAgo(latestCheck.checked_at, now)},{' '}
              <span className="code">{formatStatusCode(latestCheck.status_code)}</span>
            </>
          ) : (
            'Waiting for the first check'
          )}
        </span>
      </div>

      <div className="erow__latency">
        <span className={`erow__ms num band--${latencyBand(stats.average)}`}>{formatMs(stats.average)}</span>
        <Sparkline checks={history} />
      </div>

      <div className="erow__uptime">
        <span className="num">{formatPercent(stats.uptime)}</span>
        <span className="erow__label">{stats.total} checks</span>
      </div>

      <div className="erow__actions">
        <button
          type="button"
          className="chip-btn"
          disabled={disabled}
          onClick={() => onCheck(endpoint.id)}
          aria-label={`Run a check on ${endpoint.name}`}
        >
          {checking ? <span className="btn__spinner btn__spinner--dark" aria-hidden="true" /> : <Activity size={15} aria-hidden="true" />}
          <span>{checking ? 'Checking' : 'Check'}</span>
        </button>
        <button
          type="button"
          className="icon-btn icon-btn--danger"
          disabled={disabled}
          onClick={() => onRemove(endpoint.id)}
          aria-label={`Remove ${endpoint.name}`}
          title="Remove"
        >
          <Trash2 size={16} />
        </button>
        <ChevronRight size={18} className="erow__chevron" aria-hidden="true" />
      </div>
    </motion.li>
  )
}
