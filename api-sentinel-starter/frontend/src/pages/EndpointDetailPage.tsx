import { motion, useReducedMotion } from 'motion/react'
import { Activity, ArrowLeft, ExternalLink, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { checkEndpoint, deleteEndpoint, listEndpointChecks, listEndpoints } from '../api/endpoints'
import type { CheckResult, Endpoint } from '../api/types'
import { EndpointDrawer, type DrawerState } from '../components/EndpointDrawer'
import { LatencyChart } from '../components/LatencyChart'
import { Button } from '../components/ui/Button'
import { Overlay } from '../components/ui/Overlay'
import { StatusPill } from '../components/ui/StatusPill'
import { useToast } from '../components/ui/Toast'
import { UptimeStrip } from '../components/ui/UptimeStrip'
import { HISTORY_LIMIT, useNow } from '../hooks/useFleet'
import { formatMs, formatPercent, historyStats, timeAgo } from '../lib/stats'
import { formatDateTime, formatStatusCode, getEndpointStatus } from '../utils/formatters'

interface Detail {
  endpoint: Endpoint | null
  checks: CheckResult[]
}

function errorText(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

export function EndpointDetailPage() {
  const { endpointId } = useParams()
  const id = Number(endpointId)
  const navigate = useNavigate()
  const toast = useToast()
  const reduce = useReducedMotion()
  const now = useNow()

  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [checking, setChecking] = useState(false)
  const [drawer, setDrawer] = useState<DrawerState>(null)
  const [confirming, setConfirming] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [filter, setFilter] = useState<'all' | 'failed'>('all')
  const lock = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    if (!Number.isInteger(id) || id < 1) {
      setError('This endpoint link is not valid.')
      return
    }
    setError(null)
    Promise.all([listEndpoints(controller.signal), listEndpointChecks(id, HISTORY_LIMIT, controller.signal)])
      .then(([endpoints, checks]) => {
        if (controller.signal.aborted) return
        setDetail({ endpoint: endpoints.find((endpoint) => endpoint.id === id) ?? null, checks })
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return
        if (caught instanceof ApiError && caught.status === 404) {
          setDetail({ endpoint: null, checks: [] })
          return
        }
        setError(errorText(caught, 'An unexpected error occurred while loading this endpoint.'))
      })
    return () => controller.abort()
  }, [id, reloadKey])

  useEffect(() => {
    document.title = detail?.endpoint ? `${detail.endpoint.name} · API Sentinel` : 'Endpoint · API Sentinel'
  }, [detail?.endpoint])

  if (error) {
    return (
      <div className="empty empty--error empty--page" role="alert">
        <h1>Can’t load this endpoint</h1>
        <p>{error}</p>
        <Button icon={<RefreshCw size={16} />} onClick={() => setReloadKey((value) => value + 1)}>
          Try again
        </Button>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="detail" aria-busy="true">
        <span className="skeleton skeleton--crumb" />
        <span className="skeleton skeleton--title" />
        <span className="skeleton skeleton--panel" />
        <span className="visually-hidden">Loading endpoint details</span>
      </div>
    )
  }

  if (!detail.endpoint) {
    return (
      <div className="empty empty--page">
        <h1>This endpoint isn’t monitored</h1>
        <p>It may have been removed. Endpoints you add appear on the overview.</p>
        <Link className="btn btn--secondary btn--md" to="/">
          <ArrowLeft size={16} aria-hidden="true" /> Back to overview
        </Link>
      </div>
    )
  }

  const endpoint = detail.endpoint
  const latest = detail.checks[0] ?? null
  const status = getEndpointStatus(latest)
  const stats = historyStats(detail.checks)
  const rows = filter === 'failed' ? detail.checks.filter((check) => !check.success) : detail.checks

  async function runCheck() {
    if (lock.current) return
    lock.current = true
    setChecking(true)
    try {
      const check = await checkEndpoint(id)
      setDetail((current) => current && { ...current, checks: [check, ...current.checks.filter((item) => item.id !== check.id)].slice(0, HISTORY_LIMIT) })
      toast(
        check.success
          ? { tone: 'success', title: 'Check passed', description: `${formatStatusCode(check.status_code)} in ${formatMs(check.response_time_ms)}` }
          : { tone: 'error', title: 'Check failed', description: check.error_message ?? formatStatusCode(check.status_code) },
      )
    } catch (caught) {
      toast({ tone: 'error', title: 'Check could not run', description: errorText(caught, 'Try again in a moment.') })
    } finally {
      lock.current = false
      setChecking(false)
    }
  }

  async function remove() {
    if (lock.current) return
    lock.current = true
    setRemoving(true)
    try {
      await deleteEndpoint(id)
      toast({ tone: 'success', title: `${endpoint.name} removed`, description: 'Its check history was deleted too.' })
      navigate('/')
    } catch (caught) {
      toast({ tone: 'error', title: 'Endpoint could not be removed', description: errorText(caught, 'Try again in a moment.') })
      lock.current = false
      setRemoving(false)
    }
  }

  const reveal = (delay: number) => ({
    initial: reduce ? false : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] as const },
  })

  return (
    <div className="detail">
      <Link to="/" className="crumb">
        <ArrowLeft size={15} aria-hidden="true" /> Overview
      </Link>

      <motion.header className="dhead" {...reveal(0)}>
        <div className="dhead__copy">
          <StatusPill status={status} size="lg" />
          <h1>{endpoint.name}</h1>
          <a className="dhead__url code" href={endpoint.url} target="_blank" rel="noreferrer">
            {endpoint.url}
            <ExternalLink size={14} aria-hidden="true" />
            <span className="visually-hidden">(opens in a new tab)</span>
          </a>
          <p className="dhead__meta">
            {latest ? `Last checked ${timeAgo(latest.checked_at, now)}` : 'Not checked yet'}
          </p>
        </div>
        <div className="dhead__actions">
          <Button variant="primary" icon={<Activity size={16} />} loading={checking} disabled={removing} onClick={runCheck}>
            {checking ? 'Checking' : 'Run check'}
          </Button>
          <Button icon={<Pencil size={15} />} disabled={checking || removing} onClick={() => setDrawer({ mode: 'edit', endpoint })}>
            Edit
          </Button>
          <Button variant="quiet" className="btn--danger-quiet" icon={<Trash2 size={15} />} disabled={checking || removing} onClick={() => setConfirming(true)}>
            Remove
          </Button>
        </div>
      </motion.header>

      <motion.section className="panel" aria-labelledby="availability-title" {...reveal(0.06)}>
        <div className="panel__head">
          <h2 id="availability-title">Availability</h2>
          <span className="panel__hint">Last {Math.min(detail.checks.length, HISTORY_LIMIT) || 0} checks, oldest first</span>
        </div>
        <UptimeStrip checks={detail.checks} slots={HISTORY_LIMIT} size="lg" interactive />
        <dl className="dstats">
          <div>
            <dt>Success rate</dt>
            <dd className="num">{formatPercent(stats.uptime)}</dd>
            <span>{stats.passed} passed, {stats.failed} failed</span>
          </div>
          <div>
            <dt>Average latency</dt>
            <dd className="num">{formatMs(stats.average)}</dd>
            <span>Across checks with a response</span>
          </div>
          <div>
            <dt>95th percentile</dt>
            <dd className="num">{formatMs(stats.p95)}</dd>
            <span>95% of checks were faster</span>
          </div>
          <div>
            <dt>Latest response</dt>
            <dd className="code">{latest ? formatStatusCode(latest.status_code) : '—'}</dd>
            <span>{latest ? formatMs(latest.response_time_ms) : 'Run a check to see it'}</span>
          </div>
        </dl>
        {latest?.error_message ? (
          <p className="notice notice--error">
            <strong>Latest error:</strong> {latest.error_message}
          </p>
        ) : null}
      </motion.section>

      <motion.section className="panel" aria-labelledby="latency-title" {...reveal(0.12)}>
        <div className="panel__head">
          <h2 id="latency-title">Response time</h2>
          <span className="panel__hint">Red marks are failed checks</span>
        </div>
        <LatencyChart checks={detail.checks} />
      </motion.section>

      <motion.section className="panel" aria-labelledby="log-title" {...reveal(0.18)}>
        <div className="panel__head">
          <h2 id="log-title">Check log</h2>
          <div className="segmented" role="group" aria-label="Filter checks">
            <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
              All <span className="num">{stats.total}</span>
            </button>
            <button type="button" aria-pressed={filter === 'failed'} onClick={() => setFilter('failed')}>
              Failed <span className="num">{stats.failed}</span>
            </button>
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="chart-empty">{filter === 'failed' ? 'No failed checks in this history.' : 'No checks recorded yet.'}</p>
        ) : (
          <div className="log" tabIndex={0} role="region" aria-label="Check log, scrollable">
            <table>
              <caption className="visually-hidden">Recorded checks for {endpoint.name}, newest first</caption>
              <thead>
                <tr>
                  <th scope="col">Result</th>
                  <th scope="col">Response</th>
                  <th scope="col">Latency</th>
                  <th scope="col">Checked</th>
                  <th scope="col">Error</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((check) => (
                  <tr key={check.id} className={check.success ? '' : 'is-fail'}>
                    <td>
                      <span className={`result result--${check.success ? 'ok' : 'fail'}`}>{check.success ? 'Passed' : 'Failed'}</span>
                    </td>
                    <td className="code">{formatStatusCode(check.status_code)}</td>
                    <td className="num">{formatMs(check.response_time_ms)}</td>
                    <td>
                      <time dateTime={check.checked_at} title={formatDateTime(check.checked_at)}>
                        {timeAgo(check.checked_at, now)}
                      </time>
                    </td>
                    <td className="log__error">{check.error_message ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.section>

      <EndpointDrawer
        state={drawer}
        onClose={() => setDrawer(null)}
        onSaved={(saved) => {
          setDrawer(null)
          setDetail((current) => current && { ...current, endpoint: saved })
          toast({ tone: 'success', title: 'Changes saved', description: saved.name })
        }}
      />

      <Overlay
        variant="dialog"
        tone="danger"
        open={confirming}
        onClose={() => !removing && setConfirming(false)}
        title={`Remove ${endpoint.name}?`}
        description="API Sentinel stops checking it and deletes its recorded history. This can’t be undone."
        footer={
          <>
            <Button variant="quiet" data-autofocus onClick={() => setConfirming(false)} disabled={removing}>
              Cancel
            </Button>
            <Button variant="danger" loading={removing} onClick={remove}>
              Remove endpoint
            </Button>
          </>
        }
      />
    </div>
  )
}
