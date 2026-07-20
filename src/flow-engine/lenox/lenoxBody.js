import * as THREE from "three/webgpu";
import {
  cameraPosition,
  color,
  float,
  mix,
  normalWorld,
  positionWorld,
  uniform,
} from "three/tsl";

const TAU = Math.PI * 2;
const clamp01 = (value) => Math.max(0, Math.min(value ?? 0, 1));
const damp = (current, target, tau, dt) => {
  const k = 1 - Math.exp(-Math.max(dt, 0) / Math.max(tau, 0.001));
  return current + (target - current) * k;
};

function createSignalMaterial(signals) {
  const material = new THREE.MeshStandardNodeMaterial();
  const viewDir = cameraPosition.sub(positionWorld).normalize();
  const fresnel = float(1)
    .sub(normalWorld.dot(viewDir).saturate())
    .pow(2.65);
  const base = color(0x0b1117);
  const silver = color(0xaeb9c2);
  const cyan = color(0x55dff2);
  const silverEdge = fresnel.mul(float(0.34).add(signals.attention.mul(0.2)));

  material.colorNode = mix(base, silver, silverEdge);
  material.emissiveNode = cyan.mul(
    fresnel
      .mul(float(0.035).add(signals.energy.mul(0.2)))
      .mul(float(1).sub(signals.tension.mul(0.22))),
  );
  material.roughnessNode = float(0.36).sub(signals.tension.mul(0.08));
  material.metalnessNode = float(0.72);
  material.transparent = true;
  material.opacity = 0;
  material.depthWrite = true;
  material.side = THREE.DoubleSide;
  return material;
}

function createTipMaterial(signals) {
  const material = new THREE.MeshBasicNodeMaterial();
  material.colorNode = color(0x66e8f7).mul(
    float(0.32).add(signals.energy.mul(0.72)),
  );
  material.transparent = true;
  material.opacity = 0;
  material.depthWrite = false;
  material.toneMapped = false;
  return material;
}

function createArm({
  role,
  side,
  index,
  segments,
  length,
  radius,
  rootPosition,
  rootSpread,
  material,
  tipMaterial,
}) {
  const root = new THREE.Group();
  root.name = `Lenox_${role}_${String(index + 1).padStart(2, "0")}`;
  root.position.copy(rootPosition);
  root.rotation.z = rootSpread;

  const joints = [];
  const meshes = [];
  let parent = root;
  const segmentLength = length / segments;

  for (let i = 0; i < segments; i++) {
    const joint = new THREE.Group();
    joint.name = `${root.name}_Joint_${String(i + 1).padStart(2, "0")}`;
    parent.add(joint);
    joints.push(joint);

    const taper0 = 1 - i / (segments + 1);
    const taper1 = 1 - (i + 1) / (segments + 1);
    const geometry = new THREE.CylinderGeometry(
      Math.max(radius * taper1, radius * 0.24),
      Math.max(radius * taper0, radius * 0.3),
      segmentLength * 1.06,
      role === "lead" ? 12 : 9,
      1,
      false,
    );
    const segment = new THREE.Mesh(geometry, material);
    segment.name = `${root.name}_Segment_${String(i + 1).padStart(2, "0")}`;
    segment.position.y = -segmentLength * 0.5;
    segment.castShadow = false;
    segment.receiveShadow = false;
    segment.frustumCulled = false;
    joint.add(segment);
    meshes.push(segment);

    const next = new THREE.Group();
    next.position.y = -segmentLength;
    joint.add(next);
    parent = next;
  }

  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.44, 12, 8),
    tipMaterial,
  );
  tip.name = `${root.name}_Aperture`;
  tip.scale.set(1, 0.55, 1);
  parent.add(tip);
  meshes.push(tip);

  return {
    role,
    side,
    index,
    root,
    joints,
    tip,
    meshes,
    phase: index * 1.713 + (side < 0 ? 0.37 : 1.11),
    response: 0,
    targetResponse: 0,
    baseSpread: rootSpread,
  };
}

/**
 * Phase-1 body: authored silhouette built from cheap articulated chains.
 * It intentionally proves proportion, response hierarchy and material before
 * a Blender rig is commissioned; it is not pretending to be final topology.
 */
export function createLenoxBody({ modelSize, modelCenter }) {
  const signals = {
    energy: uniform(0.38),
    attention: uniform(0.7),
    tension: uniform(0.12),
  };
  const material = createSignalMaterial(signals);
  const tipMaterial = createTipMaterial(signals);
  const root = new THREE.Group();
  root.name = "Lenox_GravityBody";

  const h = Math.max(modelSize.y, 1e-4);
  const w = Math.max(modelSize.x, h * 0.72);
  const d = Math.max(modelSize.z, h * 0.5);
  const anchorY = modelCenter.y - h * 0.31;
  const anchorZ = modelCenter.z - d * 0.16;

  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(w * 0.245, h * 0.035, 10, 32),
    material,
  );
  collar.name = "Lenox_GravityCollar";
  collar.position.set(modelCenter.x, anchorY + h * 0.035, anchorZ);
  collar.rotation.x = Math.PI * 0.5;
  collar.scale.z = 0.72;
  collar.frustumCulled = false;
  root.add(collar);

  const specs = [
    // Lead limbs form the readable calligraphic gesture.
    { role: "lead", side: -1, x: -0.19, z: 0.01, spread: 0.38, length: 0.82, radius: 0.063, segments: 6 },
    { role: "lead", side: 1, x: 0.19, z: 0.01, spread: -0.38, length: 0.82, radius: 0.063, segments: 6 },
    // Support limbs sit behind the leads and preserve a compact instrument silhouette.
    { role: "support", side: -1, x: -0.27, z: 0.09, spread: 0.72, length: 0.57, radius: 0.047, segments: 4 },
    { role: "support", side: 1, x: 0.27, z: 0.09, spread: -0.72, length: 0.57, radius: 0.047, segments: 4 },
    { role: "support", side: -1, x: -0.08, z: 0.17, spread: 0.18, length: 0.63, radius: 0.043, segments: 5 },
    { role: "support", side: 1, x: 0.08, z: 0.17, spread: -0.18, length: 0.63, radius: 0.043, segments: 5 },
  ];

  const arms = specs.map((spec, index) => {
    const arm = createArm({
      role: spec.role,
      side: spec.side,
      index,
      segments: spec.segments,
      length: h * spec.length,
      radius: h * spec.radius,
      rootPosition: new THREE.Vector3(
        modelCenter.x + w * spec.x,
        anchorY,
        anchorZ + d * spec.z,
      ),
      rootSpread: spec.spread,
      material,
      tipMaterial,
    });
    root.add(arm.root);
    return arm;
  });

  const shellMeshes = [collar];
  for (const arm of arms) {
    shellMeshes.push(...arm.meshes.filter((mesh) => mesh !== arm.tip));
  }

  let reveal = 0;
  const dynamics = { energy: 0.38, attention: 0.7, tension: 0.12 };
  const tipWorld = arms.map(() => new THREE.Vector3());

  return {
    root,
    shellMeshes,
    arms,
    signals,

    setReveal(value) {
      reveal = clamp01(value);
      root.visible = reveal > 0.002;
      material.opacity = reveal;
      tipMaterial.opacity = reveal * (0.22 + dynamics.energy * 0.68);
    },

    update({
      dt,
      time,
      intent,
      signalState,
      look,
      scroll = 0,
      portrait = false,
      reduced = false,
    }) {
      const motion = reduced ? 0.34 : 1;
      const scrollT = clamp01(scroll);
      dynamics.energy = damp(dynamics.energy, clamp01(signalState?.energy), 0.24, dt);
      dynamics.attention = damp(dynamics.attention, clamp01(signalState?.attention), 0.18, dt);
      dynamics.tension = damp(dynamics.tension, clamp01(signalState?.tension), 0.42, dt);
      signals.energy.value = dynamics.energy;
      signals.attention.value = dynamics.attention;
      signals.tension.value = dynamics.tension;

      const kind = intent?.kind ?? "rest";
      const targetX = Math.max(
        -1,
        Math.min(
          intent?.targetNdc ? intent.targetNdc.x * 2 : (look?.x ?? 0),
          1,
        ),
      );
      const targetY = Math.max(
        -1,
        Math.min(
          intent?.targetNdc ? intent.targetNdc.y * 2 : (look?.y ?? 0),
          1,
        ),
      );
      const reach = clamp01(intent?.reach ?? 0.72);

      const bodyScale = portrait ? 0.8 : 1;
      root.scale.set(bodyScale, portrait ? 0.76 : 1, bodyScale);

      for (const arm of arms) {
        const selected =
          kind === "guide" &&
          ((intent.arm === "left" && arm.side < 0) ||
            (intent.arm === "right" && arm.side > 0));
        const confirm = kind === "confirm";
        const observing = kind === "observe" && arm.role === "lead";
        const targetResponse = selected
          ? reach
          : confirm && arm.role === "lead"
            ? 0.72
            : observing
              ? 0.14 * dynamics.attention
              : 0;
        const tau = arm.role === "lead" ? 0.38 : 0.74;
        arm.response = damp(arm.response, targetResponse, tau, dt);

        const baseDrift =
          Math.sin(time * TAU * 0.13 + arm.phase) * 0.055 +
          Math.sin(time * TAU * 0.72 + arm.phase * 1.7) * 0.012;
        const micro =
          Math.cos(time * TAU * 0.07 + arm.phase * 0.8) * 0.04 +
          Math.cos(time * TAU * 1.05 + arm.phase * 1.23) * 0.008;
        const compact = 0.12 + dynamics.tension * 0.19 + scrollT * 0.075;
        const guideSpread = selected ? -arm.side * targetX * 0.34 : 0;
        const observeSpread = observing ? -arm.side * targetX * 0.055 : 0;
        arm.root.rotation.z =
          arm.baseSpread * (1 - scrollT * 0.18) +
          (baseDrift + guideSpread + observeSpread) * motion +
          (confirm ? -arm.side * 0.12 : 0);
        arm.root.rotation.x =
          (arm.role === "support" ? 0.18 : 0.06) +
          micro * motion -
          arm.response * targetY * 0.24;

        for (let j = 0; j < arm.joints.length; j++) {
          const along = (j + 1) / arm.joints.length;
          const lag = j * 0.41 + arm.phase;
          const wave = Math.sin(time * TAU * 0.13 + lag) * 0.035 * motion;
          const secondary = Math.sin(time * TAU * 0.72 + lag * 1.37) * 0.009 * motion;
          const authoredCurl =
            arm.side * (compact + along * (arm.role === "lead" ? 0.075 : 0.11));
          const guideCurl = arm.response * arm.side * (-0.34 + along * 0.12);
          arm.joints[j].rotation.z = authoredCurl + guideCurl + wave + secondary;
          arm.joints[j].rotation.x =
            (arm.role === "support" ? arm.side * 0.04 : 0) +
            Math.cos(time * TAU * 0.07 + lag) * 0.018 * motion;
        }

      }

      root.updateMatrixWorld(true);
      for (const arm of arms) {
        arm.tip.getWorldPosition(tipWorld[arm.index]);
      }
      tipMaterial.opacity = reveal * (0.18 + dynamics.energy * 0.72);
      return { signals: dynamics, tips: tipWorld };
    },

    dispose() {
      const geometries = new Set();
      root.traverse((child) => {
        if (child.isMesh && child.geometry) geometries.add(child.geometry);
      });
      geometries.forEach((geometry) => geometry.dispose());
      material.dispose();
      tipMaterial.dispose();
    },
  };
}
