import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { EndpointStatus } from '../api/types'
import { LATENCY_RINGS, formatMs, formatPercent } from '../lib/stats'

/**
 * Latency radar. Each endpoint is a blip:
 *   distance from center = average latency (log scale)
 *   beam height          = uptime
 *   color                = current status
 * The sweep makes blips flare as it passes; failing blips emit a pulse ring.
 */

export interface RadarBlip {
  id: number
  name: string
  status: EndpointStatus
  average: number | null
  uptime: number | null
}

interface RadarScopeProps {
  blips: RadarBlip[]
  onSelect: (id: number) => void
}

/** 3D points that DOM labels follow; projected to screen space every frame. */
type Anchors = Map<string, THREE.Object3D>
type Nodes = Map<string, HTMLElement>

const R = 4
const TAU = Math.PI * 2
const GOLDEN = 2.399963
const SWEEP_SPEED = 0.9 // radians per second
const LABEL_ANGLE = (282 * Math.PI) / 180 // front, facing the camera

const COLORS = {
  healthy: new THREE.Color('#4fe3c1'),
  slow: new THREE.Color('#f2a93b'),
  unhealthy: new THREE.Color('#ff5c61'),
  not_checked: new THREE.Color('#8fa39c'),
}

/** 20 ms at the center, 5 s at the rim, logarithmic in between. */
export function radiusFor(ms: number | null) {
  if (ms === null) return R * 0.93
  const t = Math.log(Math.max(ms, 20) / 20) / Math.log(5000 / 20)
  return THREE.MathUtils.clamp(t, 0.06, 1) * R * 0.95
}

function colorFor(blip: RadarBlip) {
  if (blip.status === 'unhealthy') return COLORS.unhealthy
  if (blip.status === 'not_checked') return COLORS.not_checked
  if (blip.average !== null && blip.average >= 1000) return COLORS.slow
  return COLORS.healthy
}

function usePrefersReducedMotion() {
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  return reduced
}

const scopeVertex = /* glsl */ `
  varying vec2 vPos;
  void main() {
    vPos = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const scopeFragment = /* glsl */ `
  uniform float uSweep;
  uniform float uRadius;
  uniform vec3 uRings;
  uniform vec3 uPhosphor;
  varying vec2 vPos;

  float line(float value, float target, float width) {
    return 1.0 - smoothstep(0.0, width, abs(value - target));
  }

  void main() {
    float r = length(vPos);
    if (r > uRadius + 0.02) discard;
    float a = atan(vPos.y, vPos.x);
    if (a < 0.0) a += 6.2831853;

    vec3 base = mix(vec3(0.075, 0.2, 0.18), vec3(0.04, 0.115, 0.105), r / uRadius);
    float grid = 0.0;
    grid += line(r, uRings.x, 0.016) * 0.55;
    grid += line(r, uRings.y, 0.016) * 0.55;
    grid += line(r, uRings.z, 0.016) * 0.55;
    grid += line(r, uRadius, 0.03) * 0.9;
    float spokes = line(fract(a / 6.2831853 * 12.0 + 0.5), 0.5, 0.004 / max(r / uRadius, 0.05)) * 0.16;
    grid += spokes * step(0.25, r);
    grid += (1.0 - smoothstep(0.0, 0.06, r)) * 0.6;

    float delta = mod(uSweep - a, 6.2831853);
    float trail = exp(-delta * 2.6) * 0.42 * smoothstep(0.0, 0.4, r);
    float edge = (1.0 - smoothstep(0.0, 0.025, delta)) * 0.8;

    vec3 color = base + uPhosphor * (grid * 0.55 + trail + edge * (0.35 + 0.65 * r / uRadius));
    float alpha = smoothstep(uRadius + 0.02, uRadius - 0.02, r);
    gl_FragColor = vec4(color, alpha);
  }
`

function Scope({ sweep }: { sweep: React.MutableRefObject<number> }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: scopeVertex,
        fragmentShader: scopeFragment,
        transparent: true,
        uniforms: {
          uSweep: { value: 0 },
          uRadius: { value: R },
          uRings: { value: new THREE.Vector3(...LATENCY_RINGS.map((ms) => radiusFor(ms))) },
          uPhosphor: { value: new THREE.Color('#4fe3c1') },
        },
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])
  useFrame(() => {
    material.uniforms.uSweep.value = sweep.current
  })

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} material={material}>
      <circleGeometry args={[R + 0.05, 160]} />
    </mesh>
  )
}

function Blip({
  blip,
  index,
  sweep,
  reduced,
  hovered,
  onHover,
  onSelect,
  anchors,
}: {
  blip: RadarBlip
  index: number
  sweep: React.MutableRefObject<number>
  reduced: boolean
  hovered: boolean
  onHover: (id: number | null) => void
  onSelect: (id: number) => void
  anchors: Anchors
}) {
  const angle = (index * GOLDEN + 0.7) % TAU
  const radius = radiusFor(blip.average)
  const x = Math.cos(angle) * radius
  const z = -Math.sin(angle) * radius
  const color = colorFor(blip)
  const height = 0.18 + ((blip.uptime ?? 0) / 100) * 1.5

  const head = useRef<THREE.Mesh>(null)
  const halo = useRef<THREE.Mesh>(null)
  const pulse = useRef<THREE.Mesh>(null)
  const beam = useRef<THREE.MeshBasicMaterial>(null)
  const grow = useRef(reduced ? 1 : 0)

  useFrame((state, delta) => {
    grow.current = Math.min(1, grow.current + delta * 1.4)
    const appear = 1 - Math.pow(1 - grow.current, 3)
    const since = ((sweep.current - angle) % TAU + TAU) % TAU
    const flare = reduced ? 0.4 : Math.exp(-since * 3.2)
    const hoverBoost = hovered ? 1.5 : 1

    if (head.current) {
      head.current.scale.setScalar((1 + flare * 0.6) * hoverBoost * appear)
      head.current.position.y = height * appear
    }
    if (halo.current) {
      halo.current.scale.setScalar((0.8 + flare * 1.6) * hoverBoost * appear)
      ;(halo.current.material as THREE.MeshBasicMaterial).opacity = 0.18 + flare * 0.5
    }
    if (beam.current) beam.current.opacity = (0.28 + flare * 0.45) * appear
    if (pulse.current) {
      const visible = blip.status === 'unhealthy' && !reduced
      pulse.current.visible = visible
      if (visible) {
        const t = (state.clock.elapsedTime * 0.7 + index * 0.17) % 1
        pulse.current.scale.setScalar(0.3 + t * 2.4)
        ;(pulse.current.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.7
      }
    }
  })

  return (
    <group position={[x, 0, z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} ref={halo} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.32, 40]} />
        <meshBasicMaterial color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} ref={pulse} position={[0, 0.035, 0]}>
        <ringGeometry args={[0.3, 0.36, 48]} />
        <meshBasicMaterial color={COLORS.unhealthy} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, height / 2, 0]}>
        <cylinderGeometry args={[0.022, 0.022, height, 8]} />
        <meshBasicMaterial ref={beam} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      <mesh
        ref={head}
        onPointerOver={(event) => {
          event.stopPropagation()
          onHover(blip.id)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          onHover(null)
          document.body.style.cursor = ''
        }}
        onClick={(event) => {
          event.stopPropagation()
          document.body.style.cursor = ''
          onSelect(blip.id)
        }}
      >
        <sphereGeometry args={[0.13, 24, 24]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <group
        position={[0, height + 0.32, 0]}
        ref={(node) => {
          if (node) anchors.set(`blip-${blip.id}`, node)
          else anchors.delete(`blip-${blip.id}`)
        }}
      />
    </group>
  )
}

function RingAnchors({ anchors }: { anchors: Anchors }) {
  return (
    <>
      {LATENCY_RINGS.map((ms) => (
        <group
          key={ms}
          position={[Math.cos(LABEL_ANGLE) * radiusFor(ms), 0.02, -Math.sin(LABEL_ANGLE) * radiusFor(ms)]}
          ref={(node) => {
            if (node) anchors.set(`ring-${ms}`, node)
            else anchors.delete(`ring-${ms}`)
          }}
        />
      ))}
    </>
  )
}

/** Moves each DOM label to its anchor's screen position without React re-renders. */
function Projector({ anchors, nodes }: { anchors: Anchors; nodes: Nodes }) {
  const { camera, size } = useThree()
  const vector = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    nodes.forEach((node, key) => {
      const anchor = anchors.get(key)
      if (!anchor) {
        node.style.opacity = '0'
        return
      }
      anchor.getWorldPosition(vector).project(camera)
      const x = ((vector.x + 1) / 2) * size.width
      const y = ((1 - vector.y) / 2) * size.height
      node.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
      node.style.opacity = vector.z < 1 ? '1' : '0'
    })
  })
  return null
}

/** Keeps the scope framed for any container aspect ratio. */
function FitCamera() {
  const { camera, size } = useThree()
  useEffect(() => {
    const perspective = camera as THREE.PerspectiveCamera
    const aspect = size.width / size.height
    const distance = aspect < 1.3 ? 14.5 / Math.max(aspect, 0.6) : 12.6
    perspective.position.set(0, distance * 0.86, distance * 0.5)
    perspective.lookAt(0, 0.4, 0.35)
    perspective.updateProjectionMatrix()
  }, [camera, size])
  return null
}

function Rig({ children, reduced }: { children: React.ReactNode; reduced: boolean }) {
  const group = useRef<THREE.Group>(null)
  const { pointer } = useThree()
  useFrame((_, delta) => {
    if (!group.current || reduced) return
    group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, pointer.x * 0.18, 2.5, delta)
    group.current.rotation.x = THREE.MathUtils.damp(group.current.rotation.x, -pointer.y * 0.06, 2.5, delta)
  })
  return <group ref={group}>{children}</group>
}

interface SceneProps extends RadarScopeProps {
  hovered: number | null
  setHovered: (id: number | null) => void
  anchors: Anchors
  nodes: Nodes
}

function SceneContents({ blips, onSelect, hovered, setHovered, anchors, nodes }: SceneProps) {
  const reduced = usePrefersReducedMotion()
  const sweep = useRef(reduced ? 1.1 : 0)

  useFrame((_, delta) => {
    if (!reduced) sweep.current = (sweep.current + Math.min(delta, 0.05) * SWEEP_SPEED) % TAU
  })

  return (
    <Rig reduced={reduced}>
      <Scope sweep={sweep} />
      <RingAnchors anchors={anchors} />
      <Projector anchors={anchors} nodes={nodes} />
      {blips.map((blip, index) => (
        <Blip
          key={blip.id}
          blip={blip}
          index={index}
          sweep={sweep}
          reduced={reduced}
          hovered={hovered === blip.id}
          onHover={setHovered}
          onSelect={onSelect}
          anchors={anchors}
        />
      ))}
    </Rig>
  )
}

export default function RadarScope(props: RadarScopeProps) {
  const wrapper = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(true)
  const [hovered, setHovered] = useState<number | null>(null)
  const anchors = useMemo<Anchors>(() => new Map(), [])
  const nodes = useMemo<Nodes>(() => new Map(), [])
  const hoveredBlip = props.blips.find((blip) => blip.id === hovered) ?? null
  const bindNode = (key: string) => (node: HTMLElement | null) => {
    if (node) nodes.set(key, node)
    else nodes.delete(key)
  }

  useEffect(() => {
    const node = wrapper.current
    if (!node || !('IntersectionObserver' in window)) return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.05 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={wrapper} className="radar__canvas">
      <Canvas
        frameloop={visible ? 'always' : 'never'}
        dpr={[1, 2]}
        camera={{ fov: 36, position: [0, 7, 7] }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        aria-hidden="true"
      >
        <FitCamera />
        <SceneContents {...props} hovered={hovered} setHovered={setHovered} anchors={anchors} nodes={nodes} />
      </Canvas>
      <div className="radar__overlay" aria-hidden="true">
        {LATENCY_RINGS.map((ms) => (
          <span key={ms} ref={bindNode(`ring-${ms}`)} className="radar-anchor">
            <span className="radar-ring-label">{formatMs(ms)}</span>
          </span>
        ))}
        {hoveredBlip ? (
          <span key={hoveredBlip.id} ref={bindNode(`blip-${hoveredBlip.id}`)} className="radar-anchor" style={{ opacity: 0 }}>
            <span className="radar-tip">
              <strong>{hoveredBlip.name}</strong>
              <span>
                {hoveredBlip.status === 'not_checked'
                  ? 'Not checked yet'
                  : `${formatMs(hoveredBlip.average)} average, ${formatPercent(hoveredBlip.uptime)} uptime`}
              </span>
            </span>
          </span>
        ) : null}
      </div>
    </div>
  )
}
