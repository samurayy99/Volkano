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

const REQUIRED_NODE_ALIASES = [
  ["Root"],
  ["Head"],
  ["Eye.L", "Eye_L", "EyeL"],
  ["Eye.R", "Eye_R", "EyeR"],
  ["Fin.L", "Fin_L", "FinL"],
  ["Fin.R", "Fin_R", "FinR"],
  ["LENOX_FACE_ANCHOR"],
];
const PRIMARY_CHAIN_PREFIXES = [
  "Arm_Lead_L_",
  "Arm_Lead_R_",
  "Arm_Support_Front_L_",
  "Arm_Support_Front_R_",
  "Arm_Support_Side_L_",
  "Arm_Support_Side_R_",
];
const REQUIRED_MORPHS = ["Concerned", "Confirm", "Thinking"];

const validateAuthoredContract = (scene, animations) => {
  const names = new Set();
  const boneNames = new Set();
  const morphNames = new Set();
  let skinnedMeshes = 0;
  scene.traverse((child) => {
    if (child.name) names.add(child.name);
    if (child.isBone) boneNames.add(child.name);
    if (child.isSkinnedMesh) skinnedMeshes += 1;
    for (const name of Object.keys(child.morphTargetDictionary ?? {})) {
      morphNames.add(name);
    }
  });

  const missingNodes = REQUIRED_NODE_ALIASES.filter(
    (aliases) => !aliases.some((name) => names.has(name) || boneNames.has(name)),
  ).map(([canonical]) => canonical);
  const missingChains = PRIMARY_CHAIN_PREFIXES.filter(
    (prefix) => ![...boneNames].some((name) => name.startsWith(prefix)),
  );
  const missingMorphs = REQUIRED_MORPHS.filter((name) => !morphNames.has(name));
  const metadata = findNamed(scene, "LENOX_ROOT")?.userData ?? {};
  const bodyMetadata = findNamed(scene, "LENOX_Body_Arms_Retopology")?.userData ?? {};
  const authoredArmObjects = [...names].filter((name) => name.startsWith("LENOX_Arm_"));
  const visibleArmCount =
    metadata.visible_arm_count ??
    (bodyMetadata.authored_visible_arms ?? 0) + authoredArmObjects.length;
  const primaryControlChains =
    metadata.primary_control_chains ??
    PRIMARY_CHAIN_PREFIXES.length - missingChains.length;
  const animationTest = animations.some((clip) => /^LENOX_v\d+_/.test(clip.name));

  const failures = [];
  if (missingNodes.length) failures.push(`missing nodes: ${missingNodes.join(", ")}`);
  if (missingChains.length) failures.push(`missing chains: ${missingChains.join(", ")}`);
  if (missingMorphs.length) failures.push(`missing morphs: ${missingMorphs.join(", ")}`);
  if (visibleArmCount !== 8) failures.push(`visible arms: ${visibleArmCount}, expected 8`);
  if (primaryControlChains !== 6) {
    failures.push(`primary chains: ${primaryControlChains}, expected 6`);
  }
  if (skinnedMeshes < 1) failures.push("no skinned deformable mesh");
  if (!animationTest) failures.push("named LENOX animation test missing");
  return {
    failures,
    metadata,
    visibleArmCount,
    primaryControlChains,
  };
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

  const contract = validateAuthoredContract(scene, animations);
  if (contract.failures.length) {
    console.warn(
      `[lenox] authored GLB contract rejected — keeping procedural fallback: ${contract.failures.join("; ")}`,
    );
    return null;
  }

  const orient = new THREE.Group();
  orient.name = `Lenox_Authored_${contract.metadata.version ?? "compatible"}`;
  orient.add(scene);
  // Blender authored front is -Y; glTF converts it to +Z. The engine camera
  // sees the legacy vessel after the same half-turn.
  orient.rotation.y = Math.PI;
  orient.updateMatrixWorld(true);

  const meshes = [];
  const materials = new Set();
  const morphMeshes = [];
  const morphChannels = {
    face: [],
    fins: [],
    mouth: [],
  };
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
      if (child.name.includes("Fin_")) morphChannels.fins.push(child);
      else if (child.name.includes("Mouth")) morphChannels.mouth.push(child);
      else morphChannels.face.push(child);
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
  const finL = findNamed(scene, "Fin.L", "Fin_L", "FinL");
  const finR = findNamed(scene, "Fin.R", "Fin_R", "FinR");
  const eyeL = findNamed(scene, "Eye.L", "Eye_L", "EyeL");
  const eyeR = findNamed(scene, "Eye.R", "Eye_R", "EyeR");

  const expression = {
    concerned: 0,
    confirm: 0,
    thinking: 0,
  };
  const finExpression = { ...expression };
  const mouthExpression = { ...expression };
  let reveal = 0;
  let solid = false;

  const setMorph = (targets, name, value) => {
    for (const mesh of targets) {
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
    primaryControlChains: contract.primaryControlChains,
    visibleArmCount: contract.visibleArmCount,

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
      expression.concerned = damp(expression.concerned, concernedTarget, 0.16, dt);
      expression.confirm = damp(expression.confirm, confirmTarget, 0.15, dt);
      expression.thinking = damp(expression.thinking, thinkingTarget, 0.22, dt);
      finExpression.concerned = damp(finExpression.concerned, concernedTarget, 0.26, dt);
      finExpression.confirm = damp(finExpression.confirm, confirmTarget, 0.23, dt);
      finExpression.thinking = damp(finExpression.thinking, thinkingTarget, 0.28, dt);
      mouthExpression.concerned = damp(mouthExpression.concerned, concernedTarget, 0.36, dt);
      mouthExpression.confirm = damp(mouthExpression.confirm, confirmTarget, 0.26, dt);
      mouthExpression.thinking = damp(mouthExpression.thinking, thinkingTarget, 0.34, dt);
      for (const name of REQUIRED_MORPHS) {
        const key = name.toLowerCase();
        setMorph(morphChannels.face, name, expression[key]);
        setMorph(morphChannels.fins, name, finExpression[key]);
        setMorph(morphChannels.mouth, name, mouthExpression[key]);
      }

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
        const selected =
          kind === "guide" &&
          ((intent?.arm === "left" && bone.name.includes("_L_")) ||
            (intent?.arm === "right" && bone.name.includes("_R_")));
        const guide = selected ? clamp01(intent?.reach ?? 0.72) : 0;
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
