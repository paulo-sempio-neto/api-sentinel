import { AnimatePresence, motion } from 'motion/react'
import { CircleAlert, CircleCheck, X } from 'lucide-react'
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

type Tone = 'success' | 'error'
interface Toast {
  id: number
  tone: Tone
  title: string
  description?: string
}

const ToastContext = createContext<((toast: Omit<Toast, 'id'>) => void) | null>(null)
const DURATION = 5000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((toast) => toast.id !== id)), [])
  const push = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = nextId.current++
    setToasts((list) => [...list.slice(-3), { ...toast, id }])
    window.setTimeout(() => dismiss(id), DURATION)
  }, [dismiss])

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="region" aria-label="Notifications" aria-live="polite">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              className={`toast toast--${toast.tone}`}
              role={toast.tone === 'error' ? 'alert' : 'status'}
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, transition: { duration: 0.18 } }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            >
              <span className="toast__icon" aria-hidden="true">
                {toast.tone === 'success' ? <CircleCheck size={19} /> : <CircleAlert size={19} />}
              </span>
              <div>
                <p className="toast__title">{toast.title}</p>
                {toast.description ? <p className="toast__description">{toast.description}</p> : null}
              </div>
              <button type="button" className="toast__close" aria-label="Dismiss notification" onClick={() => dismiss(toast.id)}>
                <X size={15} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside <ToastProvider>')
  return context
}
