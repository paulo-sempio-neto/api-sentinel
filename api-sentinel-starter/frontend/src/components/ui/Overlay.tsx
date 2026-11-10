import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { X } from 'lucide-react'
import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '../../hooks/useFocusTrap'

interface OverlayProps {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  variant: 'drawer' | 'dialog'
  tone?: 'default' | 'danger'
}

function Panel({ onClose, title, description, children, footer, variant, tone = 'default' }: Omit<OverlayProps, 'open'>) {
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const reduce = useReducedMotion()
  useFocusTrap(panel, onClose)

  const motionProps = variant === 'drawer'
    ? {
        initial: reduce ? { opacity: 0 } : { x: '100%' },
        animate: reduce ? { opacity: 1 } : { x: 0 },
        exit: reduce ? { opacity: 0 } : { x: '100%' },
        transition: { type: 'spring' as const, stiffness: 380, damping: 40 },
      }
    : {
        initial: reduce ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 6 },
        transition: { type: 'spring' as const, stiffness: 460, damping: 34 },
      }

  return (
    <div className={`overlay overlay--${variant}`}>
      <motion.div
        className="overlay__backdrop"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      />
      <motion.div
        ref={panel}
        role={tone === 'danger' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={`overlay__panel overlay__panel--${variant}`}
        {...motionProps}
      >
        <header className="overlay__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <div id={descriptionId} className="overlay__description">{description}</div> : null}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        {children ? <div className="overlay__body">{children}</div> : null}
        {footer ? <footer className="overlay__footer">{footer}</footer> : null}
      </motion.div>
    </div>
  )
}

export function Overlay({ open, ...props }: OverlayProps) {
  return createPortal(<AnimatePresence>{open ? <Panel {...props} /> : null}</AnimatePresence>, document.body)
}
