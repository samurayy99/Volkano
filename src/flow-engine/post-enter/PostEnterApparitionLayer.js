import * as THREE from "three/webgpu";

const ASH_DRIFT_SCALE = 0.38;
const HOLD_WOBBLE = 0.012;
const QUAD_FRAC_OF_MIN_XY = 0.028;
const QUAD_SIZE_MIN = 0.07;
const QUAD_SIZE_MAX = 0.22;
/** Start offset from targets (fraction of min chamber XY) — enough to read resolve, not a second cloud. */
const START_SPREAD_FRAC_OF_MIN_XY = 0.12;
const START_JITTER_FRAC_OF_MIN_XY = 0.02;

function detRand01(i, salt) {
  const x = Math.sin(i * 12.9898 + salt * 78.233 + 42.417) * 43758.5453;
  return x - Math.floor(x);
}

function smoothstep01(t) {
  const x = Math.min(Math.max(t, 0), 1);
  return x * x * (3 - 2 * x);
}

/**
 * Separate instanced apparition (not MLS). Parent should be `particleRenderer.object`
 * (chamber root `Group`, same local space as M1 targets and MLS body mesh).
 */
export class PostEnterApparitionLayer {
  /** @type {THREE.InstancedMesh | null} */
  mesh = null;

  /** @type {THREE.Object3D | null} */
  _anchor = null;

  /** @type {Float32Array | null} */
  _starts = null;

  /** @type {Float32Array | null} */
  _targets = null;

  _count = 0;

  _dummy = new THREE.Object3D();

  /**
   * @param {{ count: number; positions: Float32Array }} targetField
   * @param {import("./PostEnterDirector").PostEnterContext} context
   * @returns {boolean}
   */
  initFromTargetField(targetField, context) {
    this.dispose();

    const count = targetField?.count ?? 0;
    const positions = targetField?.positions;
    if (!count || !positions || positions.length < count * 3) {
      return false;
    }

    const cmin = context.chamberBoundsSim.min;
    const cmax = context.chamberBoundsSim.max;
    const dx = Math.max(cmax.x - cmin.x, 1e-4);
    const dy = Math.max(cmax.y - cmin.y, 1e-4);
    const minXY = Math.min(dx, dy);
    const quadSize = THREE.MathUtils.clamp(
      minXY * QUAD_FRAC_OF_MIN_XY,
      QUAD_SIZE_MIN,
      QUAD_SIZE_MAX,
    );
    const spread = minXY * START_SPREAD_FRAC_OF_MIN_XY;
    const jitter = minXY * START_JITTER_FRAC_OF_MIN_XY;

    this._starts = new Float32Array(count * 3);
    this._targets = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const b = i * 3;
      const tx = positions[b];
      const ty = positions[b + 1];
      const tz = positions[b + 2];
      this._targets[b] = tx;
      this._targets[b + 1] = ty;
      this._targets[b + 2] = tz;

      const sx = (detRand01(i, 1.1) - 0.5) * 2 * spread;
      const sy = (detRand01(i, 2.2) - 0.5) * 2 * spread;
      const sz = (detRand01(i, 3.3) - 0.5) * 2 * spread * 0.55;
      const jx = (detRand01(i, 4.4) - 0.5) * 2 * jitter;
      const jy = (detRand01(i, 5.5) - 0.5) * 2 * jitter;
      const jz = (detRand01(i, 6.6) - 0.5) * 2 * jitter * 0.35;
      this._starts[b] = tx + sx + jx;
      this._starts[b + 1] = ty + sy + jy;
      this._starts[b + 2] = tz + sz + jz;
    }

    this._count = count;

    const geometry = new THREE.PlaneGeometry(quadSize, quadSize);
    const material = new THREE.MeshBasicMaterial({
      color: 0xd86a38,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });

    this.mesh = new THREE.InstancedMesh(geometry, material, count);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = count;
    this.mesh.name = "PostEnterApparitionLayer";
    this.mesh.rotation.x = -0.52;

    return true;
  }

  /** @param {THREE.Object3D} anchorObject */
  attachTo(anchorObject) {
    if (!this.mesh) return;
    this.disposeAnchorOnly();
    this._anchor = anchorObject;
    anchorObject.add(this.mesh);
  }

  disposeAnchorOnly() {
    if (this.mesh && this.mesh.parent) {
      this.mesh.parent.remove(this.mesh);
    }
    this._anchor = null;
  }

  dispose() {
    this.disposeAnchorOnly();
    if (this.mesh) {
      this.mesh.geometry?.dispose?.();
      this.mesh.material?.dispose?.();
      this.mesh = null;
    }
    this._starts = null;
    this._targets = null;
    this._count = 0;
  }

  /**
   * @param {number} _delta
   * @param {import("./PostEnterDirector").PostEnterDerived} derived
   * @param {import("./PostEnterDirector").PostEnterContext | null | undefined} context
   * @param {{ count: number; positions: Float32Array } | null | undefined} targetField
   */
  update(_delta, derived, context, targetField) {
    if (!this.mesh || !this._starts || !this._targets || !targetField?.positions) {
      return;
    }

    const phase = derived.postEnterPhase;
    if (phase === "idle" || phase === "rotation_ready") {
      this.mesh.visible = false;
      return;
    }

    this.mesh.visible = true;

    const extractT = smoothstep01(derived.extractMix);
    const clearMix = derived.clearMix ?? 0;
    const quietMix = derived.quietMix ?? 0;
    const phaseElapsed = derived.phaseElapsed ?? 0;

    const cmin = context?.chamberBoundsSim?.min;
    const cmax = context?.chamberBoundsSim?.max;
    const ySpan =
      cmin && cmax ? Math.max(cmax.y - cmin.y, 1e-4) : 1;

    /** @type {THREE.MeshBasicMaterial} */
    const mat = this.mesh.material;
    let opacity = 1;
    if (phase === "arrest") {
      opacity = 0.06 + 0.22 * smoothstep01(derived.phaseT);
    } else if (phase === "resolve") {
      opacity = 0.35 + 0.5 * smoothstep01(extractT);
    }
    if (phase === "ash") {
      opacity *= 1 - clearMix * 0.88;
    }
    if (phase === "quiet") {
      opacity *= 1 - quietMix * 0.95;
    }
    mat.opacity = Math.max(0, Math.min(1, opacity));
    mat.transparent = mat.opacity < 0.995;

    const ashDrift =
      phase === "ash" || phase === "quiet"
        ? clearMix * ySpan * ASH_DRIFT_SCALE +
          (phase === "quiet" ? quietMix * ySpan * 0.12 : 0)
        : 0;

    const holdWobble =
      phase === "hold"
        ? Math.sin(phaseElapsed * 2.6) * HOLD_WOBBLE
        : 0;

    for (let i = 0; i < this._count; i += 1) {
      const b = i * 3;
      const sx = this._starts[b];
      const sy = this._starts[b + 1];
      const sz = this._starts[b + 2];
      const tx = this._targets[b];
      const ty = this._targets[b + 1];
      const tz = this._targets[b + 2];

      let x = THREE.MathUtils.lerp(sx, tx, extractT);
      let y = THREE.MathUtils.lerp(sy, ty, extractT);
      let z = THREE.MathUtils.lerp(sz, tz, extractT);

      if (phase === "hold") {
        const h = detRand01(i, 9.7) * 6.28318;
        x += Math.cos(h + phaseElapsed * 1.4) * holdWobble;
        y += Math.sin(h * 1.3 + phaseElapsed * 1.1) * holdWobble * 0.6;
      }

      y -= ashDrift;

      this._dummy.position.set(x, y, z);
      this._dummy.quaternion.identity();
      this._dummy.scale.setScalar(1);
      this._dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this._dummy.matrix);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
