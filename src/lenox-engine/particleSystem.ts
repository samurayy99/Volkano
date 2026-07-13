/**
 * Three.js particle system for Lenox — V2.
 *
 * 1200 particles. Magnetic cursor. Organic eyes via layered noise.
 * Breathing, blinking, gaze-follow, wake ritual.
 */

import * as THREE from 'three';

// ── Config ──────────────────────────────────────────────
const N = 1200;
const BASE_SIZE = 6.0;
const CURSOR_FORCE = 0.06;
const CURSOR_RADIUS = 0.28;
const BREATHE_RATE = 0.4;
const BREATHE_AMP = 0.008;
const BLINK_INTERVAL_MIN = 3.5;
const BLINK_INTERVAL_MAX = 8.0;
const BLINK_DURATION = 0.15;
const WAKE_VORTEX_SPEED = 0.04;
const WAKE_VORTEX_DURATION = 1.8; // seconds before convergence starts
const FORMATION_SPEED = 0.025;
const GAZE_LAG = 0.08; // cursor smoothing

// ── Shaders ─────────────────────────────────────────────
const VERT = /* glsl */ `
  attribute float size;
  attribute float alpha;
  varying float vAlpha;
  varying float vSize;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = size;
    vAlpha = alpha;
    vSize = size;
  }
`;

const FRAG = /* glsl */ `
  varying float vAlpha;
  varying float vSize;
  uniform float uTime;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    // Soft multi-layer glow
    float core = exp(-d * 6.0) * 0.8;
    float halo = exp(-d * 2.2) * 0.3;
    float glow = core + halo;
    if (glow < 0.015) discard;

    // Cyan → silver gradient
    vec3 cyan   = vec3(0.302, 0.941, 1.0);
    vec3 silver = vec3(0.78, 0.80, 0.82);
    vec3 color  = mix(silver, cyan, pow(glow, 1.6));

    float a = glow * vAlpha;
    gl_FragColor = vec4(color, a);
  }
`;

// ── Types ────────────────────────────────────────────────
export type EyeLayer = 'core' | 'inner' | 'outer' | 'scatter';
export type LenoxVisualState = 'idle' | 'waking' | 'awakening' | 'alive' | 'processing' | 'resolved' | 'error';

interface Particle {
  scatter: { x: number; y: number };
  eyeBase: { x: number; y: number };
  current: { x: number; y: number };
  layer: EyeLayer;
  baseSize: number;
  baseAlpha: number;
  alpha: number;
  blinkMask: number; // 1 = visible, 0 = blinked
  phase: number; // random phase offset
  orbitAngle: number;
}

// ── Noise helpers ───────────────────────────────────────
function noise2D(x: number, y: number): number {
  // Simple value noise
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const n00 = hash(ix, iy);
  const n10 = hash(ix + 1, iy);
  const n01 = hash(ix, iy + 1);
  const n11 = hash(ix + 1, iy + 1);

  return lerp(lerp(n00, n10, sx), lerp(n01, n11, sx), sy);
}

function hash(x: number, y: number): number {
  let h = x * 374761393 + y * 668265263 + 1274126177;
  h = (h ^ (h >> 13)) * 1274126177;
  return (h ^ (h >> 16)) / 2147483648;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ── Eye shape ───────────────────────────────────────────
const EYE_CX = { left: 0.35, right: 0.65 };
const EYE_CY = 0.44;
const EYE_RX = 0.085;
const EYE_RY = 0.04;

function organicEye(
  layer: EyeLayer,
  isLeft: boolean,
  t: number,
  seed: number,
): { x: number; y: number } {
  const cx = isLeft ? EYE_CX.left : EYE_CX.right;
  const cy = EYE_CY;

  // Base ellipse radius per layer
  let rxF: number, ryF: number;
  switch (layer) {
    case 'core':
      rxF = 0.28;
      ryF = 0.28;
      break;
    case 'inner':
      rxF = 0.55;
      ryF = 0.50;
      break;
    case 'outer':
      rxF = 0.82;
      ryF = 0.72;
      break;
    case 'scatter':
      rxF = 1.15;
      ryF = 0.95;
      break;
    default:
      rxF = 0.6;
      ryF = 0.5;
  }

  // Organic angular distribution
  const n = noise2D(seed * 1.7 + t * 0.3, layer === 'core' ? 1 : 2);
  const angle = (seed * 2.399963 + n * 1.2) % (Math.PI * 2);

  // Radius modulated by noise for organic edge
  const rNoise = 1 + noise2D(Math.cos(angle) * 3 + t * 0.5, Math.sin(angle) * 3) * 0.25;
  const r = Math.sqrt(Math.random()) * rNoise; // fill, not just outline

  return {
    x: cx + Math.cos(angle) * r * EYE_RX * rxF,
    y: cy + Math.sin(angle) * r * EYE_RY * ryF,
  };
}

// ── Scatter positions ───────────────────────────────────
function scatterPos(seed: number): { x: number; y: number } {
  // Sinusoidal hash — decorrelated 2D coordinates
  const ax = seed * 12.9898 + 78.233;
  const ay = seed * 39.3103 + 47.661;
  const x = (Math.sin(ax) * 43758.5453) % 1;
  const y = (Math.sin(ay) * 43758.5453) % 1;
  return {
    x: Math.abs(x) * 0.78 + 0.11,
    y: Math.abs(y) * 0.58 + 0.21,
  };
}

// ── Particle System ─────────────────────────────────────
export class ParticleSystem {
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer;
  private geometry!: THREE.BufferGeometry;
  private points!: THREE.Points;
  private particles: Particle[] = [];
  private animId: number | null = null;
  private disposer: (() => void) | null = null;

  // State
  visualState: LenoxVisualState = 'idle';
  energy = 0;
  cursorX = 0.5;
  cursorY = 0.5;
  private cursorSmoothX = 0.5;
  private cursorSmoothY = 0.5;
  private time = 0;
  private wakeTimer = 0;
  private wakeActive = false;
  private blinkTimer = 4;
  private blinkProgress = 1; // 1 = open
  private breathePhase = 0;
  private formationT = 0; // 0→1 for eye formation

  // Callbacks
  onWakeComplete?: () => void;
  onAwake?: () => void;

  // ── Lifecycle ──────────────────────────────────────────
  constructor(container: HTMLElement) {
    // Scene
    this.scene = new THREE.Scene();

    // Ortho camera for 2D
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    this.camera.position.z = 5;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    container.appendChild(this.renderer.domElement);

    this.resize();
    this.initParticles();
    this.animate();

    const onResize = () => this.resize();
    window.addEventListener('resize', onResize);
    this.disposer = () => window.removeEventListener('resize', onResize);
  }

  private resize() {
    const p = this.renderer.domElement.parentElement;
    if (!p) return;
    const w = p.clientWidth;
    const h = p.clientHeight;
    this.renderer.setSize(w, h, false);
  }

  private initParticles() {
    const layerDist: [EyeLayer, number][] = [
      ['core', 0.15],
      ['inner', 0.30],
      ['outer', 0.30],
      ['scatter', 0.25],
    ];

    // Assign layers
    const layerAssignments: EyeLayer[] = [];
    let acc = 0;
    for (const [layer, frac] of layerDist) {
      const count = Math.floor(N * frac);
      for (let i = 0; i < count; i++) layerAssignments.push(layer);
    }
    while (layerAssignments.length < N) layerAssignments.push('scatter');

    // Shuffle
    for (let i = layerAssignments.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [layerAssignments[i], layerAssignments[j]] = [layerAssignments[j], layerAssignments[i]];
    }

    this.particles = [];
    for (let i = 0; i < N; i++) {
      const layer = layerAssignments[i];
      const isLeft = i < N / 2;
      const scatter = scatterPos(i);
      const eyeBase = organicEye(layer, isLeft, 0, i);

      // Size varies by layer
      const sizeMul = layer === 'core' ? 1.4 : layer === 'inner' ? 1.1 : layer === 'outer' ? 0.85 : 0.7;
      const alphaMul = layer === 'core' ? 0.9 : layer === 'inner' ? 0.6 : layer === 'outer' ? 0.35 : 0.18;

      this.particles.push({
        scatter,
        eyeBase,
        current: { ...scatter },
        layer,
        baseSize: BASE_SIZE * sizeMul * (0.7 + Math.random() * 0.6),
        baseAlpha: alphaMul * (0.7 + Math.random() * 0.6),
        alpha: 0,
        blinkMask: 1,
        phase: Math.random() * Math.PI * 2,
        orbitAngle: Math.random() * Math.PI * 2,
      });
    }

    this.rebuildGeometry();
  }

  private rebuildGeometry() {
    if (this.points) {
      this.scene.remove(this.points);
      this.geometry.dispose();
    }

    const pos = new Float32Array(N * 3);
    const sizes = new Float32Array(N);
    const alphas = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      const p = this.particles[i];
      pos[i * 3] = (p.current.x - 0.5) * 2;
      pos[i * 3 + 1] = (0.5 - p.current.y) * 2;
      pos[i * 3 + 2] = (p.layer === 'core' ? 0.2 : p.layer === 'inner' ? 0.1 : 0) * 0.1;
      sizes[i] = p.baseSize;
      alphas[i] = p.alpha;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, mat);
    this.scene.add(this.points);
  }

  // ── Animation Loop ─────────────────────────────────────
  private animate = () => {
    this.animId = requestAnimationFrame(this.animate);
    const dt = Math.min(0.05, 1 / 60); // cap for tab-away
    this.time += dt;

    // Smooth cursor
    this.cursorSmoothX += (this.cursorX - this.cursorSmoothX) * GAZE_LAG;
    this.cursorSmoothY += (this.cursorY - this.cursorSmoothY) * GAZE_LAG;

    // Breathing
    this.breathePhase += dt * BREATHE_RATE * (this.visualState === 'alive' ? 1 : 0.3);

    // Blinking
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blinkTimer = BLINK_INTERVAL_MIN + Math.random() * (BLINK_INTERVAL_MAX - BLINK_INTERVAL_MIN);
      this.blinkProgress = 0;
    }
    if (this.blinkProgress < 1) {
      this.blinkProgress = Math.min(1, this.blinkProgress + dt / BLINK_DURATION);
    }

    // Update particles per state
    this.updateParticles(dt);

    // Flush to GPU
    this.flushGeometry();
    (this.points.material as THREE.ShaderMaterial).uniforms.uTime.value = this.time;
    this.renderer.render(this.scene, this.camera);
  };

  private updateParticles(_dt: number) {
    const csrX = this.cursorSmoothX;
    const csrY = this.cursorSmoothY;

    for (let i = 0; i < N; i++) {
      const p = this.particles[i];
      const isLeft = i < N / 2;
      const eye = organicEye(p.layer, isLeft, this.time, i);

      // Magnetic cursor force
      const dx = csrX - p.current.x;
      const dy = csrY - p.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const force = dist < CURSOR_RADIUS
        ? (1 - dist / CURSOR_RADIUS) * (1 - dist / CURSOR_RADIUS) * CURSOR_FORCE
        : 0;

      switch (this.visualState) {
        case 'idle': {
          // Magnetic drift with breathing
          const breathe = Math.sin(this.breathePhase + p.phase) * BREATHE_AMP;
          const tx = p.scatter.x + dx * force * 0.5 + breathe * (p.scatter.x - 0.5);
          const ty = p.scatter.y + dy * force * 0.5 + breathe * (p.scatter.y - 0.5);
          p.current.x += (tx - p.current.x) * 0.02;
          p.current.y += (ty - p.current.y) * 0.02;
          p.alpha += (p.baseAlpha * 0.7 - p.alpha) * 0.03;
          break;
        }

        case 'waking': {
          // Vortex: orbit around a point between eyes, then converge
          this.wakeTimer += _dt;
          const vortexT = Math.min(1, this.wakeTimer / WAKE_VORTEX_DURATION);
          const vortexCx = 0.5;
          const vortexCy = 0.44;
          const angle = this.time * 2.5 + i * 0.15;
          const radius = (1 - vortexT) * (0.3 + Math.sin(i * 0.5) * 0.15);
          const tx = vortexCx + Math.cos(angle) * radius;
          const ty = vortexCy + Math.sin(angle) * radius * 0.6;
          p.current.x += (tx - p.current.x) * WAKE_VORTEX_SPEED;
          p.current.y += (ty - p.current.y) * WAKE_VORTEX_SPEED;
          p.alpha += (p.baseAlpha * 0.8 - p.alpha) * 0.05;

          if (vortexT >= 1 && this.onWakeComplete) {
            this.onWakeComplete();
            this.onWakeComplete = undefined;
          }
          break;
        }

        case 'awakening': {
          // Converge to eye positions
          this.formationT = Math.min(1, this.formationT + _dt * 0.5);
          const t = easeInOutCubic(this.formationT);
          const tx = lerp(p.scatter.x, eye.x, t) + dx * force * 0.15 * (1 - t);
          const ty = lerp(p.scatter.y, eye.y, t) + dy * force * 0.15 * (1 - t);
          p.current.x += (tx - p.current.x) * FORMATION_SPEED;
          p.current.y += (ty - p.current.y) * FORMATION_SPEED;
          p.alpha += (p.baseAlpha - p.alpha) * 0.06;

          if (this.formationT >= 1 && this.onAwake) {
            this.onAwake();
            this.onAwake = undefined;
          }
          break;
        }

        case 'alive': {
          // Gaze follow + breathing + blinking
          const breathe = Math.sin(this.breathePhase + p.phase) * BREATHE_AMP;

          // Blink only affects upper particles (y above center)
          const blinkY = p.current.y < EYE_CY ? this.blinkProgress : 1;
          // Blink compresses vertically
          const blinkScale = p.layer === 'scatter' ? 1 : (0.3 + blinkY * 0.7);

          // Gaze offset
          const gazeX = (csrX - 0.5) * 0.03 * (1 - Math.abs(p.layer === 'core' ? 0 : p.layer === 'inner' ? 0.3 : 0.6));
          const gazeY = (csrY - 0.5) * 0.02;

          const tx = eye.x + gazeX + Math.sin(this.time * 1.2 + p.phase) * 0.002;
          const ty = eye.y * blinkScale + (1 - blinkScale) * EYE_CY + gazeY + breathe + Math.cos(this.time * 1.4 + p.phase) * 0.002;

          p.current.x += (tx - p.current.x) * 0.06;
          p.current.y += (ty - p.current.y) * 0.06;

          const blinkAlpha = p.layer === 'scatter' ? 1 : (0.2 + blinkY * 0.8);
          p.alpha += (p.baseAlpha * blinkAlpha - p.alpha) * 0.08;
          break;
        }

        case 'processing': {
          // Compress toward center, pulse
          const pulse = Math.sin(this.time * 6 + p.phase) * this.energy * 0.04;
          const compress = 1 - this.energy * 0.3;
          const cx = p.current.x + (eye.x * compress - p.current.x + pulse) * 0.1;
          const cy = p.current.y + (eye.y * compress - p.current.y + pulse * 0.5) * 0.1;
          p.current.x = cx;
          p.current.y = cy;
          p.alpha += (0.4 + this.energy * 0.5 - p.alpha) * 0.1;
          break;
        }

        case 'resolved': {
          // Soft, calm, slight breathing
          const b = Math.sin(this.breathePhase + p.phase) * BREATHE_AMP * 0.4;
          const tx = eye.x + b;
          const ty = eye.y + b;
          p.current.x += (tx - p.current.x) * 0.04;
          p.current.y += (ty - p.current.y) * 0.04;
          p.alpha += (p.baseAlpha * 0.7 - p.alpha) * 0.05;
          break;
        }

        case 'error': {
          // Brief amber scatter
          const scatterForce = (Math.sin(this.time * 14) * 0.5 + 0.5) * 0.3;
          const tx = eye.x + (p.scatter.x - eye.x) * scatterForce;
          const ty = eye.y + (p.scatter.y - eye.y) * scatterForce;
          p.current.x += (tx - p.current.x) * 0.15;
          p.current.y += (ty - p.current.y) * 0.15;
          p.alpha += (0.3 - p.alpha) * 0.1;
          break;
        }
      }
    }
  }

  private flushGeometry() {
    const posAttr = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    const alphaAttr = this.geometry.getAttribute('alpha') as THREE.BufferAttribute;
    const posArr = posAttr.array as Float32Array;
    const alphaArr = alphaAttr.array as Float32Array;

    for (let i = 0; i < N; i++) {
      const p = this.particles[i];
      posArr[i * 3] = (p.current.x - 0.5) * 2;
      posArr[i * 3 + 1] = (0.5 - p.current.y) * 2;
      alphaArr[i] = p.alpha * p.blinkMask;
    }
    posAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;
  }

  // ── Public API ─────────────────────────────────────────
  setCursor(x: number, y: number) {
    this.cursorX = Math.max(0, Math.min(1, x));
    this.cursorY = Math.max(0, Math.min(1, y));
  }

  setState(state: LenoxVisualState) {
    const prev = this.visualState;
    this.visualState = state;

    if (state === 'waking') {
      this.wakeTimer = 0;
      this.wakeActive = true;
    }
    if (state === 'awakening') {
      this.formationT = 0;
      this.wakeActive = false;
    }
    if (state === 'idle') {
      this.formationT = 0;
      this.wakeTimer = 0;
      this.wakeActive = false;
    }
  }

  setEnergy(lvl: number) {
    this.energy = Math.max(0, Math.min(1, lvl));
  }

  dispose() {
    if (this.animId !== null) cancelAnimationFrame(this.animId);
    this.disposer?.();
    this.renderer.dispose();
    this.geometry?.dispose();
    (this.points?.material as THREE.Material)?.dispose();
  }
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
