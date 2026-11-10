import { animate, useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'

export function AnimatedNumber({ value, format }: { value: number | null; format: (value: number | null) => string }) {
  const node = useRef<HTMLSpanElement>(null)
  const previous = useRef(0)
  const reduce = useReducedMotion()

  useEffect(() => {
    const element = node.current
    if (!element) return
    if (value === null || reduce) {
      element.textContent = format(value)
      previous.current = value ?? 0
      return
    }
    const controls = animate(previous.current, value, {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        element.textContent = format(latest)
      },
    })
    previous.current = value
    return () => controls.stop()
  }, [value, format, reduce])

  return <span ref={node} className="num">{format(value === null ? null : 0)}</span>
}
