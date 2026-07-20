import * as THREE from "three/webgpu";

const clamp01 = (value) => Math.max(0, Math.min(value ?? 0, 1));
const damp = (current, target, tau, dt) => {
  const k = 1 - Math.exp(-Math.max(dt, 0) / Math.max(tau, 0.001));
  return current + (target - current) * k;
};

const findNamed = (root, ...names) => {
  for (const name of names) {
    const found = root.getObjectByName(name);
    if (found) return found;
  }
  return null;
};

/**
 * Runtime adapter for the authored Blender character.
 *
 * Blender exports eight visible arm meshes, but only six primary chains. The
 * two rear secondary meshes are weighted to the side support chains inside the
 * GLB, so this adapter never invents an eight-chain runtime rig.
 */
export function createAuthoredLenox({ scene, animations = [], parentScale } = {}) {
  if (!scene) return null;

  const orient = new THREE.Group();
    orient.name = "Lenox_Authored_v004";
  orient.add(scene);
  // Blender authored front is -Y; glTF converts it to +Z. The engine camera
  // sees the legacy vessel after the same half-turn.
  orient.rotation.y = Math.PI;
  orient.updateMatrixWorld(true);

  const meshes = [];
  const materials = new Set();
  const morphMeshes = [];
  scene.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = false;
    child.receiveShadow = false;
    child.frustumCulled = false;
    const sourceMaterials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    const cloned = sourceMaterials.map((source) => {
      const material = source.clone();
      material.transparent = true;
      material.opacity = 0;
      material.depthWrite = true;
      material.needsUpdate = true;
      materials.add(material);
      return material;
    });
    child.material = Array.isArray(child.material) ? cloned : cloned[0];
    meshes.push(child);
    if (child.morphTargetDictionary && child.morphTargetInfluences) {
      morphMeshes.push(child);
    }
  });

  const anchor = findNamed(scene, "LENOX_FACE_ANCHOR", "LENOX_FACE_ANCHOR_Orientation");
  const bounds = new THREE.Box3().setFromObject(orient);
  const size = bounds.getSize(new THREE.Vector3());
  const fallbackAnchor = bounds.getCenter(new THREE.Vector3());
  fallbackAnchor.z = bounds.min.z;
  const anchorLocal = anchor
    ? anchor.getWorldPosition(new THREE.Vector3())
    : fallbackAnchor;

  const bones = new Map();
  scene.traverse((child) => {
    if (child.isBone) bones.set(child.name, child);
  });
  const boneRest = new Map();
  for (const bone of bones.values()) {
    bone.rotation.order = "XYZ";
    boneRest.set(bone, bone.rotation.clone());
  }

  const leadBones = [...bones.entries()]
    .filter(([name]) => name.startsWith("Arm_Lead_"))
    .map(([, bone]) => bone);
  const supportBones = [...bones.entries()]
    .filter(([name]) => name.startsWith("Arm_Support_"))
    .map(([, bone]) => bone);
  const finL = findNamed(scene, "Fin.L", "Fin_L");
  const finR = findNamed(scene, "Fin.R", "Fin_R");
  const eyeL = findNamed(scene, "Eye.L", "Eye_L");
  const eyeR = findNamed(scene, "Eye.R", "Eye_R");

  const expression = {
    concerned: 0,
    confirm: 0,
    thinking: 0,
  };
  let reveal = 0;
  let solid = false;

  const setMorph = (name, value) => {
    for (const mesh of morphMeshes) {
      const index = mesh.morphTargetDictionary[name];
      if (index !== undefined) mesh.morphTargetInfluences[index] = value;
    }
  };

  const setBoneRotation = (bone, x, y, z) => {
    if (!bone) return;
    const rest = boneRest.get(bone);
    bone.rotation.set(rest.x + x, rest.y + y, rest.z + z, "XYZ");
  };

  return {
    root: orient,
    animations,
    meshes,
    materials,
    modelHeight: Math.max(size.y, 1e-4),
    modelWidth: Math.max(size.x, 1e-4),
    primaryControlChains: 6,
    visibleArmCount: 8,

    fitToWorldHeight(targetWorldHeight) {
      const k = Math.max(targetWorldHeight, 1e-4) / Math.max(size.y, 1e-4);
      const px = parentScale?.x ?? 1;
      const py = parentScale?.y ?? 1;
      const pz = parentScale?.z ?? 1;
      orient.scale.set(k / px, k / py, k / pz);
      orient.position.set(
        (-anchorLocal.x * k) / px,
        (-anchorLocal.y * k) / py,
        (-anchorLocal.z * k) / pz,
      );
      orient.updateMatrixWorld(true);
      return k;
    },

    setReveal(value) {
      reveal = clamp01(value);
      orient.visible = reveal > 0.002;
      const nextSolid = reveal >= 0.999;
      if (nextSolid !== solid) {
        solid = nextSolid;
        for (const material of materials) {
          material.transparent = !solid;
          material.needsUpdate = true;
        }
      }
      for (const material of materials) material.opacity = reveal;
    },

    update({ dt, time, intent, signalState, look, reduced = false } = {}) {
      const motion = reduced ? 0.32 : 1;
      const tension = clamp01(signalState?.tension);
      const attention = clamp01(signalState?.attention);
      const kind = intent?.kind ?? "rest";
      const concernedTarget = kind === "confirm" ? 0 : clamp01((tension - 0.42) / 0.34);
      const confirmTarget = kind === "confirm" ? 1 : 0;
      const thinkingTarget = kind === "observe" ? attention * 0.36 : 0;
      expression.concerned = damp(expression.concerned, concernedTarget, 0.24, dt);
      expression.confirm = damp(expression.confirm, confirmTarget, 0.2, dt);
      expression.thinking = damp(expression.thinking, thinkingTarget, 0.3, dt);
      setMorph("Concerned", expression.concerned);
      setMorph("Confirm", expression.confirm);
      setMorph("Thinking", expression.thinking);

      const lookX = Math.max(-1, Math.min(look?.x ?? 0, 1));
      const lookY = Math.max(-1, Math.min(look?.y ?? 0, 1));
      setBoneRotation(eyeL, lookY * 0.035, 0, -lookX * 0.045);
      setBoneRotation(eyeR, lookY * 0.035, 0, -lookX * 0.045);

      const finLift = expression.confirm * 0.18 - expression.concerned * 0.22;
      setBoneRotation(finL, 0, -finLift * 0.22, finLift);
      setBoneRotation(finR, 0, finLift * 0.22, -finLift);

      for (let index = 0; index < leadBones.length; index++) {
        const bone = leadBones[index];
        const phase = index * 0.73 + (bone.name.includes("_L_") ? 0.31 : 1.17);
        const guide = kind === "guide" ? clamp01(intent?.reach ?? 0.72) : 0;
        const wave = Math.sin(time * 0.83 + phase) * 0.055 * motion;
        const secondary = Math.sin(time * 1.97 + phase * 1.4) * 0.014 * motion;
        setBoneRotation(
          bone,
          wave * 0.34,
          secondary,
          wave + guide * (bone.name.includes("_L_") ? -0.13 : 0.13),
        );
      }
      for (let index = 0; index < supportBones.length; index++) {
        const bone = supportBones[index];
        const phase = index * 1.11 + 0.47;
        const wave = Math.sin(time * 0.47 + phase) * 0.018 * motion;
        setBoneRotation(bone, wave * 0.3, 0, wave);
      }

      return { reveal, expression };
    },

    dispose() {
      for (const mesh of meshes) mesh.geometry?.dispose?.();
      for (const material of materials) material.dispose?.();
    },
  };
}
