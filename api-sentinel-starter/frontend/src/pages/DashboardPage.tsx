import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Plus, RadioTower, RefreshCw } from 'lucide-react'
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { checkEndpoint, deleteEndpoint, listEndpoints } from '../api/endpoints'
import type { Endpoint } from '../api/types'
import { EndpointDrawer, type DrawerState } from '../components/EndpointDrawer'
import { EndpointRow } from '../components/EndpointRow'
import { AnimatedNumber } from '../components/ui/AnimatedNumber'
import { Button } from '../components/ui/Button'
import { ErrorBoundary } from '../components/ui/ErrorBoundary'
import { Overlay } from '../components/ui/Overlay'
import { useToast } from '../components/ui/Toast'
import { useFleet, useNow } from '../hooks/useFleet'
import { fleetStats, formatMs, formatPercent, historyStats, timeAgo } from '../lib/stats'
import { formatStatusCode } from '../utils/formatters'
import type { RadarBlip } from '../three/RadarScope'

const RadarScope = lazy(() => import('../three/RadarScope'))

function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

function errorText(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

const formatCount = (value: number | null) => (value === null ? '—' : String(Math.round(value)))

export function DashboardPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const reduce = useReducedMotion()
  const now = useNow()
  const webgl = useMemo(supportsWebGL, [])
  const { summaries, error, updatedAt, syncing, reload, applyCheck, removeLocal, setPaused } = useFleet()

  const [checkingId, setCheckingId] = useState<number | null>(null)
  const [checkingAll, setCheckingAll] = useState(false)
  const [drawer, setDrawer] = useState<DrawerState>(null)
  const [removing, setRemoving] = useState<Endpoint | null>(null)
  const [removeBusy, setRemoveBusy] = useState(false)
  const lock = useRef(false)

  useEffect(() => {
    document.title = 'Overview · API Sentinel'
  }, [])

  const busy = checkingAll || checkingId !== null || removeBusy
  useEffect(() => setPaused(busy || drawer !== null), [busy, drawer, setPaused])

  const stats = summaries ? fleetStats(summaries) : null
  const blips: RadarBlip[] = useMemo(
    () =>
      (summaries ?? []).map(({ endpoint, history, status }) => {
        const s = historyStats(history)
        return { id: endpoint.id, name: endpoint.name, status, average: s.average, uptime: s.uptime }
      }),
    [summaries],
  )

  const selectBlip = useCallback((id: number) => navigate(`/endpoints/${id}`), [navigate])

  async function runCheck(id: number) {
    if (lock.current) return
    lock.current = true
    setCheckingId(id)
    const name = summaries?.find((summary) => summary.endpoint.id === id)?.endpoint.name ?? 'Endpoint'
    try {
      const check = await checkEndpoint(id)
      applyCheck(id, check)
      toast(
        check.success
          ? { tone: 'success', title: `${name} passed`, description: `${formatStatusCode(check.status_code)} in ${formatMs(check.response_time_ms)}` }
          : { tone: 'error', title: `${name} failed`, description: check.error_message ?? formatStatusCode(check.status_code) },
      )
    } catch (caught) {
      toast({ tone: 'error', title: 'Check could not run', description: errorText(caught, 'Try again in a moment.') })
    } finally {
      lock.current = false
      setCheckingId(null)
    }
  }

  async function runAll() {
    if (lock.current) return
    lock.current = true
    setCheckingAll(true)
    try {
      const endpoints = await listEndpoints()
      const results = await Promise.allSettled(endpoints.map((endpoint) => checkEndpoint(endpoint.id)))
      await reload()
      const settled = results.filter((result) => result.status === 'fulfilled')
      const failed = settled.filter((result) => result.status === 'fulfilled' && !result.value.success).length
      const notStarted = results.length - settled.length
      if (notStarted > 0) {
        toast({ tone: 'error', title: `${notStarted} check${notStarted === 1 ? '' : 's'} could not start`, description: 'The rest finished and the dashboard is up to date.' })
      } else {
        toast({
          tone: failed > 0 ? 'error' : 'success',
          title: failed > 0 ? `${failed} of ${results.length} endpoints failed` : `All ${results.length} endpoints passed`,
          description: 'Results are on the radar and in the list.',
        })
      }
    } catch (caught) {
      toast({ tone: 'error', title: 'Checks could not run', description: errorText(caught, 'Try again in a moment.') })
    } finally {
      lock.current = false
      setCheckingAll(false)
    }
  }

  async function confirmRemove() {
    if (!removing || lock.current) return
    lock.current = true
    setRemoveBusy(true)
    try {
      await deleteEndpoint(removing.id)
      removeLocal(removing.id)
      toast({ tone: 'success', title: `${removing.name} removed`, description: 'Its check history was deleted too.' })
      setRemoving(null)
    } catch (caught) {
      toast({ tone: 'error', title: 'Endpoint could not be removed', description: errorText(caught, 'Try again in a moment.') })
    } finally {
      lock.current = false
      setRemoveBusy(false)
    }
  }

  function handleSaved(endpoint: Endpoint) {
    setDrawer(null)
    void reload()
    toast({ tone: 'success', title: `${endpoint.name} added`, description: 'Run a check now or wait for the next monitoring cycle.' })
  }

  const headline = !stats
    ? ''
    : stats.endpoints === 0
      ? 'Nothing on the radar yet.'
      : stats.unhealthy > 0
        ? `${stats.unhealthy} of ${stats.endpoints} endpoint${stats.endpoints === 1 ? '' : 's'} need${stats.unhealthy === 1 ? 's' : ''} attention.`
        : stats.healthy === stats.endpoints
          ? `All ${stats.endpoints} endpoint${stats.endpoints === 1 ? '' : 's'} operational.`
          : `${stats.unchecked} endpoint${stats.unchecked === 1 ? '' : 's'} waiting for a first check.`
  const tone = !stats || stats.endpoints === 0 ? 'idle' : stats.unhealthy > 0 ? 'alert' : stats.unchecked === stats.endpoints ? 'idle' : 'calm'

  return (
    <div className="overview">
      <section className={`hero hero--${tone}`} aria-labelledby="overview-title">
        <div className="hero__copy">
          <p className="hero__live">
            <span className={`live-dot ${syncing ? 'is-syncing' : ''}`} aria-hidden="true" />
            {updatedAt ? `Live, updated ${timeAgo(updatedAt, now)}` : 'Connecting to the backend'}
          </p>
          {stats ? (
            <motion.h1
              id="overview-title"
              key={headline}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              {headline}
            </motion.h1>
          ) : (
            <h1 id="overview-title" className="hero__loading">
              <span className="skeleton skeleton--title" />
              <span className="visually-hidden">Loading monitored endpoints</span>
            </h1>
          )}
          <p className="hero__sub">
            {stats && stats.lastCheckAt
              ? `Most recent check ${timeAgo(stats.lastCheckAt, now)}. The backend keeps checking on its own schedule.`
              : 'Add an endpoint and API Sentinel starts checking it on a schedule.'}
          </p>
          <div className="hero__actions">
            <Button variant="primary" icon={<Plus size={17} />} onClick={() => setDrawer({ mode: 'create' })}>
              Add endpoint
            </Button>
            <Button
              icon={<RefreshCw size={16} />}
              loading={checkingAll}
              disabled={busy || !stats || stats.endpoints === 0}
              onClick={runAll}
            >
              {checkingAll ? 'Checking all' : 'Check all now'}
            </Button>
          </div>

          <dl className="vitals">
            <div>
              <dt>Success rate</dt>
              <dd><AnimatedNumber value={stats?.uptime ?? null} format={(v) => formatPercent(v)} /></dd>
            </div>
            <div>
              <dt>Average latency</dt>
              <dd><AnimatedNumber value={stats?.average ?? null} format={formatMs} /></dd>
            </div>
            <div>
              <dt>Checks recorded</dt>
              <dd><AnimatedNumber value={stats?.total ?? null} format={formatCount} /></dd>
            </div>
            <div>
              <dt>Failed checks</dt>
              <dd className={stats && stats.failed > 0 ? 'is-fail' : ''}><AnimatedNumber value={stats?.failed ?? null} format={formatCount} /></dd>
            </div>
          </dl>
        </div>

        <figure className="radar" aria-label="Latency radar">
          {webgl ? (
            <ErrorBoundary fallback={<div className="radar__fallback">The radar needs WebGL, which this browser has turned off. Everything it shows is also in the list below.</div>}>
              <Suspense fallback={<div className="radar__fallback" />}>
                <RadarScope blips={blips} onSelect={selectBlip} />
              </Suspense>
            </ErrorBoundary>
          ) : (
            <div className="radar__fallback">The radar needs WebGL, which this browser has turned off. Everything it shows is also in the list below.</div>
          )}
          <figcaption className="radar__legend">
            <span>Closer to the center is faster</span>
            <span>Taller beam means higher uptime</span>
            <span className="radar__keys">
              <i className="key key--ok" />Up
              <i className="key key--slow" />Slow
              <i className="key key--fail" />Down
            </span>
          </figcaption>
        </figure>
      </section>

      <section className="fleet" aria-labelledby="fleet-title" aria-busy={!summaries}>
        <div className="fleet__head">
          <h2 id="fleet-title">Endpoints</h2>
          {stats ? <span className="fleet__count num">{stats.endpoints}</span> : null}
          <span className="fleet__hint">Bars show the last 30 checks, oldest first.</span>
        </div>

        {error && !summaries ? (
          <div className="empty empty--error" role="alert">
            <h3>Can’t reach the backend</h3>
            <p>{error} The free hosting tier sleeps when idle, so the first request can take up to a minute.</p>
            <Button icon={<RefreshCw size={16} />} onClick={() => void reload()}>
              Try again
            </Button>
          </div>
        ) : !summaries ? (
          <ul className="elist" aria-hidden="true">
            {Array.from({ length: 4 }, (_, index) => (
              <li key={index} className="erow erow--skeleton">
                <span className="skeleton skeleton--line" />
                <span className="skeleton skeleton--strip" />
                <span className="skeleton skeleton--short" />
              </li>
            ))}
          </ul>
        ) : summaries.length === 0 ? (
          <div className="empty">
            <span className="empty__icon" aria-hidden="true"><RadioTower size={26} /></span>
            <h3>Add the first endpoint to watch</h3>
            <p>Paste any public URL, such as a health-check route, and its status shows up here and on the radar.</p>
            <Button variant="primary" icon={<Plus size={17} />} onClick={() => setDrawer({ mode: 'create' })}>
              Add endpoint
            </Button>
          </div>
        ) : (
          <>
            {error ? <p className="notice notice--error" role="alert">Latest refresh failed: {error}</p> : null}
            <motion.ul className="elist" layout={!reduce}>
              <AnimatePresence initial={false} mode="popLayout">
                {summaries.map((summary, index) => (
                  <EndpointRow
                    key={summary.endpoint.id}
                    summary={summary}
                    index={index}
                    now={now}
                    checking={checkingAll || checkingId === summary.endpoint.id}
                    disabled={busy}
                    onCheck={runCheck}
                    onRemove={(id) => setRemoving(summaries.find((item) => item.endpoint.id === id)?.endpoint ?? null)}
                  />
                ))}
              </AnimatePresence>
            </motion.ul>
          </>
        )}
      </section>

      <EndpointDrawer state={drawer} onClose={() => setDrawer(null)} onSaved={handleSaved} />

      <Overlay
        variant="dialog"
        tone="danger"
        open={removing !== null}
        onClose={() => !removeBusy && setRemoving(null)}
        title={`Remove ${removing?.name ?? 'endpoint'}?`}
        description="API Sentinel stops checking it and deletes its recorded history. This can’t be undone."
        footer={
          <>
            <Button variant="quiet" data-autofocus onClick={() => setRemoving(null)} disabled={removeBusy}>
              Cancel
            </Button>
            <Button variant="danger" loading={removeBusy} onClick={confirmRemove}>
              Remove endpoint
            </Button>
          </>
        }
      />
    </div>
  )
}
