import * as THREE from "three/webgpu";
import { FLOW_TRANSITION_PARTICLE_COUNT } from "./sequenceTimeline";

const OFFSCREEN = 9999;
const WORLD_DOWN = new THREE.Vector3(0, -1, 0);

const randRange = (min, max) => min + Math.random() * (max - min);

class TransitionParticles {
  constructor({ isMobile = false } = {}) {
    this.count = isMobile
      ? FLOW_TRANSITION_PARTICLE_COUNT.mobile
      : FLOW_TRANSITION_PARTICLE_COUNT.desktop;
    this.mode = "idle";
    this.modeElapsed = 0;
    this.debugVisible = true;
    this.renderActive = false;
    this.hasBurstInitializedForCurrentRun = false;
    this.sequenceOrigin = null;

    this.positions = new Float32Array(this.count * 3);
    this.velocities = new Float32Array(this.count * 3);
    this.drifts = new Float32Array(this.count * 3);
    this.targets = new Float32Array(this.count * 3);
    this.clearTargets = new Float32Array(this.count * 3);
    this.life = new Float32Array(this.count);
    this.lifeMax = new Float32Array(this.count);
    this.clearBias = new Float32Array(this.count);
    this.depthBias = new Float32Array(this.count);
    this.sizeBias = new Float32Array(this.count);
    this.baseColors = new Float32Array(this.count * 3);
    this.colors = new Float32Array(this.count * 3);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.positions, 3),
    );
    geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));

    const material = new THREE.PointsMaterial({
      size: isMobile ? 18 : 24,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true,
      vertexColors: true,
      blending: THREE.NormalBlending,
    });

    this.geometry = geometry;
    this.material = material;
    this.object = new THREE.Points(geometry, material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 8;
    this.object.visible = false;

    this.reset();
  }

  setOriginFromDescriptor(descriptor) {
    if (!descriptor) return;
    const origin = (
      descriptor.transitionOriginWorld ?? descriptor.ventOriginWorld
    ).clone();
    const right = descriptor.rightWorld.clone().normalize();
    const up = descriptor.upWorld.clone().normalize();
    const forward = right.clone().cross(up).normalize().negate();
    this.sequenceOrigin = {
      origin,
      axis: descriptor.ventAxisWorld.clone().normalize(),
      right,
      up,
      forward,
    };
  }

  setMode(mode) {
    if (mode === this.mode) return;
    const previousMode = this.mode;
    this.mode = mode;
    this.modeElapsed = 0;

    if (mode === "idle") {
      this.reset();
      return;
    }

    if (previousMode === "idle" && mode === "enter_burst") {
      this.hasBurstInitializedForCurrentRun = false;
    }

    this.syncVisibility();
  }

  setDebugVisibility(enabled) {
    this.debugVisible = enabled;
    this.syncVisibility();
  }

  update(delta) {
    if (this.mode === "idle") {
      return;
    }

    if (this.mode === "enter_burst" && !this.hasBurstInitializedForCurrentRun) {
      this.initializeBurst();
    }

    if (!this.renderActive) {
      return;
    }

    this.modeElapsed += delta;

    const mode = this.mode;
    const modeProgress = this.getModeProgress(mode);
    const activeCount = this.updateParticles(delta, mode, modeProgress);

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;

    this.renderActive = activeCount > 0;
    this.syncMaterialState(mode, modeProgress);
    this.syncVisibility();
  }

  reset() {
    this.mode = "idle";
    this.modeElapsed = 0;
    this.renderActive = false;
    this.hasBurstInitializedForCurrentRun = false;
    this.material.opacity = 0;

    for (let i = 0; i < this.count; i += 1) {
      const i3 = i * 3;
      this.positions[i3] = OFFSCREEN;
      this.positions[i3 + 1] = OFFSCREEN;
      this.positions[i3 + 2] = OFFSCREEN;
      this.velocities[i3] = 0;
      this.velocities[i3 + 1] = 0;
      this.velocities[i3 + 2] = 0;
      this.drifts[i3] = 0;
      this.drifts[i3 + 1] = 0;
      this.drifts[i3 + 2] = 0;
      this.targets[i3] = OFFSCREEN;
      this.targets[i3 + 1] = OFFSCREEN;
      this.targets[i3 + 2] = OFFSCREEN;
      this.clearTargets[i3] = OFFSCREEN;
      this.clearTargets[i3 + 1] = OFFSCREEN;
      this.clearTargets[i3 + 2] = OFFSCREEN;
      this.life[i] = 0;
      this.lifeMax[i] = 1;
      this.clearBias[i] = 0;
      this.depthBias[i] = 0;
      this.sizeBias[i] = 0;
      this.baseColors[i3] = 1;
      this.baseColors[i3 + 1] = 0.5;
      this.baseColors[i3 + 2] = 0.2;
      this.colors[i3] = 0;
      this.colors[i3 + 1] = 0;
      this.colors[i3 + 2] = 0;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.syncVisibility();
  }

  dispose() {
    this.geometry?.dispose?.();
    this.material?.dispose?.();
  }

  initializeBurst() {
    if (this.hasBurstInitializedForCurrentRun || !this.sequenceOrigin) {
      return;
    }

    const { origin, axis, right, up, forward } = this.sequenceOrigin;
    const color = new THREE.Color();

    for (let i = 0; i < this.count; i += 1) {
      const i3 = i * 3;
      const layerBias = randRange(-1, 1);
      const sideBias = randRange(-1, 1);
      const liftBias = randRange(-0.12, 1.0);
      const spreadBias = Math.abs(layerBias);
      const sizeBias = randRange(0, 1);

      const start = origin
        .clone()
        .addScaledVector(right, sideBias * randRange(0.018, 0.042))
        .addScaledVector(up, liftBias * randRange(0.015, 0.04))
        .addScaledVector(axis, randRange(-0.015, 0.022))
        .addScaledVector(forward, layerBias * randRange(0.015, 0.05));

      const target = origin
        .clone()
        .addScaledVector(right, sideBias * randRange(0.24, 0.88))
        .addScaledVector(up, randRange(0.12, 0.62))
        .addScaledVector(forward, layerBias * randRange(0.18, 0.62))
        .addScaledVector(axis, randRange(0.08, 0.34));

      const clearTarget = target
        .clone()
        .addScaledVector(right, sideBias * randRange(0.3, 0.82))
        .addScaledVector(up, randRange(-0.5, -0.12))
        .addScaledVector(forward, layerBias * randRange(0.12, 0.4));

      const burstDirection = axis
        .clone()
        .multiplyScalar(randRange(0.72, 1.08))
        .addScaledVector(right, sideBias * randRange(0.36, 0.96))
        .addScaledVector(up, randRange(-0.1, 0.42))
        .addScaledVector(forward, layerBias * randRange(0.14, 0.46))
        .normalize();

      const velocity = burstDirection.multiplyScalar(randRange(0.68, 1.44));
      const drift = target
        .clone()
        .sub(origin)
        .normalize()
        .multiplyScalar(randRange(0.12, 0.42))
        .addScaledVector(forward, layerBias * randRange(0.04, 0.14))
        .addScaledVector(up, randRange(-0.02, 0.08));

      this.positions[i3] = start.x;
      this.positions[i3 + 1] = start.y;
      this.positions[i3 + 2] = start.z;
      this.velocities[i3] = velocity.x;
      this.velocities[i3 + 1] = velocity.y;
      this.velocities[i3 + 2] = velocity.z;
      this.drifts[i3] = drift.x;
      this.drifts[i3 + 1] = drift.y;
      this.drifts[i3 + 2] = drift.z;
      this.targets[i3] = target.x;
      this.targets[i3 + 1] = target.y;
      this.targets[i3 + 2] = target.z;
      this.clearTargets[i3] = clearTarget.x;
      this.clearTargets[i3 + 1] = clearTarget.y;
      this.clearTargets[i3 + 2] = clearTarget.z;
      this.lifeMax[i] = randRange(2.1, 3.15);
      this.life[i] = this.lifeMax[i];
      this.clearBias[i] = randRange(0.25, 1.0);
      this.depthBias[i] = layerBias;
      this.sizeBias[i] = sizeBias;

      const hue = THREE.MathUtils.clamp(
        0.045 + layerBias * 0.012 + randRange(-0.006, 0.008),
        0.02,
        0.085,
      );
      const saturation = THREE.MathUtils.clamp(
        0.82 - spreadBias * 0.12 + sizeBias * 0.08,
        0.66,
        0.96,
      );
      const lightness = THREE.MathUtils.clamp(
        0.52 + sizeBias * 0.14 - spreadBias * 0.06,
        0.42,
        0.72,
      );
      color.setHSL(hue, saturation, lightness);
      this.baseColors[i3] = color.r;
      this.baseColors[i3 + 1] = color.g;
      this.baseColors[i3 + 2] = color.b;
      this.colors[i3] = color.r * 0.96;
      this.colors[i3 + 1] = color.g * 0.96;
      this.colors[i3 + 2] = color.b * 0.96;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.renderActive = true;
    this.hasBurstInitializedForCurrentRun = true;
    this.syncMaterialState("enter_burst", 0);
    this.syncVisibility();
  }

  updateParticles(delta, mode, modeProgress) {
    let activeCount = 0;

    for (let i = 0; i < this.count; i += 1) {
      if (this.life[i] <= 0) {
        continue;
      }

      const i3 = i * 3;
      let px = this.positions[i3];
      let py = this.positions[i3 + 1];
      let pz = this.positions[i3 + 2];
      let vx = this.velocities[i3];
      let vy = this.velocities[i3 + 1];
      let vz = this.velocities[i3 + 2];

      const driftX = this.drifts[i3];
      const driftY = this.drifts[i3 + 1];
      const driftZ = this.drifts[i3 + 2];
      const targetX = this.targets[i3];
      const targetY = this.targets[i3 + 1];
      const targetZ = this.targets[i3 + 2];
      const clearTargetX = this.clearTargets[i3];
      const clearTargetY = this.clearTargets[i3 + 1];
      const clearTargetZ = this.clearTargets[i3 + 2];
      const clearBias = this.clearBias[i];
      const depthBias = this.depthBias[i];

      const toTargetX = targetX - px;
      const toTargetY = targetY - py;
      const toTargetZ = targetZ - pz;
      const toClearX = clearTargetX - px;
      const toClearY = clearTargetY - py;
      const toClearZ = clearTargetZ - pz;

      if (mode === "enter_burst") {
        vx += driftX * delta * 0.34;
        vy += driftY * delta * 0.18;
        vz += driftZ * delta * 0.34;
        vx += toTargetX * delta * (0.18 + modeProgress * 0.12);
        vy += toTargetY * delta * (0.2 + modeProgress * 0.16);
        vz += toTargetZ * delta * (0.18 + modeProgress * 0.12);
        vy += WORLD_DOWN.y * delta * 0.015;
        this.life[i] -= delta * 0.016;
      } else if (mode === "spread") {
        vx += toTargetX * delta * (0.72 + Math.abs(depthBias) * 0.14);
        vy += toTargetY * delta * 0.8;
        vz += toTargetZ * delta * (0.76 + Math.abs(depthBias) * 0.18);
        vx += driftX * delta * 0.16;
        vy += driftY * delta * 0.08;
        vz += driftZ * delta * 0.16;
        vy += WORLD_DOWN.y * delta * 0.028;
        this.life[i] -= delta * 0.055;
      } else if (mode === "clear_and_rotate") {
        vx += toClearX * delta * (0.74 + clearBias * 0.22);
        vy += toClearY * delta * (0.9 + clearBias * 0.28);
        vz += toClearZ * delta * (0.78 + clearBias * 0.24);
        this.life[i] -= delta * (0.5 + clearBias * 0.32);
      } else {
        vx += toClearX * delta * 0.36;
        vy += (-0.42 - clearBias * 0.14) * delta;
        vz += toClearZ * delta * 0.4;
        this.life[i] -= delta * 1.1;
      }

      const damping =
        mode === "enter_burst"
          ? 0.986
          : mode === "spread"
            ? 0.978
            : mode === "clear_and_rotate"
              ? 0.918
              : 0.86;
      const dampingFactor = Math.pow(damping, delta * 60);

      vx *= dampingFactor;
      vy *= dampingFactor;
      vz *= dampingFactor;

      px += vx * delta;
      py += vy * delta;
      pz += vz * delta;

      this.velocities[i3] = vx;
      this.velocities[i3 + 1] = vy;
      this.velocities[i3 + 2] = vz;
      this.positions[i3] = px;
      this.positions[i3 + 1] = py;
      this.positions[i3 + 2] = pz;

      if (this.life[i] <= 0) {
        this.positions[i3] = OFFSCREEN;
        this.positions[i3 + 1] = OFFSCREEN;
        this.positions[i3 + 2] = OFFSCREEN;
        this.colors[i3] = 0;
        this.colors[i3 + 1] = 0;
        this.colors[i3 + 2] = 0;
        continue;
      }

      const lifeU = THREE.MathUtils.clamp(
        this.life[i] / Math.max(this.lifeMax[i], 0.0001),
        0,
        1,
      );
      const depthPresence = 1 - Math.min(Math.abs(depthBias), 1) * 0.18;
      const sizePresence = 0.06 + this.sizeBias[i] * 0.14;
      const burstFlash =
        mode === "enter_burst" ? 0.56 * (1 - modeProgress * 0.7) : 0;
      const spreadPresence =
        mode === "spread" ? 0.28 * (1 - modeProgress * 0.28) : 0;
      const clearFade =
        mode === "clear_and_rotate" ? 0.16 : mode === "ui_settle" ? 0.04 : 0.34;
      const intensity = THREE.MathUtils.clamp(
        lifeU * (0.78 + spreadPresence) +
          depthPresence * 0.18 +
          sizePresence +
          burstFlash +
          clearFade,
        0,
        1.45,
      );

      this.colors[i3] = this.baseColors[i3] * intensity;
      this.colors[i3 + 1] = this.baseColors[i3 + 1] * intensity;
      this.colors[i3 + 2] = this.baseColors[i3 + 2] * intensity;
      activeCount += 1;
    }

    return activeCount;
  }

  getModeProgress(mode) {
    const duration =
      mode === "enter_burst"
        ? 0.9
        : mode === "spread"
          ? 1.5
          : mode === "clear_and_rotate"
            ? 1.9
            : 0.7;
    return THREE.MathUtils.clamp(this.modeElapsed / duration, 0, 1);
  }

  syncMaterialState(mode, modeProgress) {
    const enterCoreOpacity = 0.96;
    const spreadCoreOpacity = 0.88;
    const clearCoreOpacity = Math.max(0, 0.6 - modeProgress * 0.3);
    const settleCoreOpacity = Math.max(0, 0.18 - modeProgress * 0.14);
    const coreOpacity =
      mode === "enter_burst"
        ? enterCoreOpacity
        : mode === "spread"
          ? spreadCoreOpacity
          : mode === "clear_and_rotate"
            ? clearCoreOpacity
            : settleCoreOpacity;
    this.material.opacity = coreOpacity;
    this.material.size =
      mode === "enter_burst"
        ? 26
        : mode === "spread"
          ? 22
          : mode === "clear_and_rotate"
            ? 16
            : 11;
  }

  syncVisibility() {
    const visible = this.debugVisible && this.renderActive;
    this.object.visible = visible;
  }
}

export default TransitionParticles;
