import * as THREE from "three/webgpu";
import {
  Fn,
  attribute,
  vec3,
  float,
  varying,
  instanceIndex,
  mix,
  normalize,
  cross,
  mat3,
  normalLocal,
  transformNormalToView,
  mrt,
  uniform,
  smoothstep,
  pow,
  fract,
  sin,
  step,
  max,
} from "three/tsl";

import { forensicSuppressCompressVisual } from "../post-enter/forensicPostEnter.js";

const COMPRESS_EASE_EDGE0 = 0.03;
const COMPRESS_EASE_EDGE1 = 0.94;

const PARTICLE_PROFILE_READ = Object.freeze({
  speedBandStart: 1.2,
  speedBandEnd: 3.5,
  stretchGain: 1.2,
  stretchBias: 1.0,
  thinningPower: -0.4,
  freezeBandStart: 0.18,
  freezeBandEnd: 0.82,
  frozenWidth: 1.0,
  frozenHeight: 1.45,
  frozenLength: 0.34,
  compressedWidth: 0.88,
  compressedHeight: 0.78,
  compressedLength: 0.64,
  densityLift: 0.28,
  densityBias: 0.72,
  frozenDensity: 0.975,
  compressedDensity: 1.12,
  instanceScale: 1.04,
  facingThicknessSpeedMin: 0.16,
  facingThicknessSpeedMax: 1.32,
  facingThicknessGain: 0.72,
  facingThicknessBias: 0.28,
});

const WITHDRAW_READ = Object.freeze({
  thinWidthReduction: 0.92,
  thinHeightReduction: 0.9,
  thinLengthReduction: 0.82,
});

const calcLookAtMatrix = /*#__PURE__*/ Fn(([target_immutable]) => {
  const target = vec3(target_immutable).toVar();
  const ww = vec3(normalize(target)).toVar();
  const upY = vec3(0, 1, 0).toConst("upY");
  const upX = vec3(1, 0, 0).toConst("upX");
  const yAbs = pow(ww.y.mul(ww.y), float(0.5)).toConst("yAbs");
  const refUp = mix(upY, upX, step(float(0.92), yAbs)).toConst("refUp");
  const uu = vec3(normalize(cross(refUp, ww))).toVar();
  const vv = vec3(normalize(cross(ww, uu))).toVar();
  return mat3(uu, vv, ww);
}).setLayout({
  name: "calcLookAtMatrix",
  type: "mat3",
  inputs: [{ name: "direction", type: "vec3" }],
});

const buildCompressTVisualRead = (uniforms) =>
  mix(
    uniforms.compressT.clamp(0, 1),
    float(0),
    uniforms.forensicSuppressCompressVisual,
  ).toConst("compressTVisualRead");

/**
 * Spatial relief for held/compressed read: slit vs outer shoulder vs mid vs apex
 * (sim space vs mirrored hero center). Gated by compressEase * freezeShapeT.
 */
const buildHeroReliefModulation = ({ simPos, uniforms, compressT }) => {
  const freezeShapeT = smoothstep(
    float(PARTICLE_PROFILE_READ.freezeBandStart),
    float(PARTICLE_PROFILE_READ.freezeBandEnd),
    uniforms.convergenceFreeze,
  ).toConst("reliefFreezeShapeT");

  const compressLocal = compressT.clamp(0, 1).toConst("reliefCompressLocal");
  const compressEase = smoothstep(
    float(COMPRESS_EASE_EDGE0),
    float(COMPRESS_EASE_EDGE1),
    compressLocal,
  ).toConst("reliefCompressEase");

  const reliefT = compressEase.mul(freezeShapeT).toConst("heroReliefT");

  const hx = uniforms.heroSimCenter.x;
  const hy = uniforms.heroSimCenter.y;
  const dx = simPos.x.sub(hx).abs().toConst("heroReliefDx");
  const creaseCore = smoothstep(float(2.2), float(9.0), dx)
    .oneMinus()
    .toConst("heroCreaseCore");
  const outerCore = smoothstep(float(3.5), float(13.0), dx).toConst(
    "heroOuterCore",
  );
  const apexCore = smoothstep(
    float(-3.0),
    float(-11.0),
    simPos.y.sub(hy),
  ).toConst("heroApexCore");

  const creaseT = reliefT.mul(creaseCore).toConst("heroCreaseT");
  const outerT = reliefT.mul(outerCore).toConst("heroOuterT");
  const midT = reliefT
    .mul(float(1).sub(max(creaseCore, outerCore)).clamp(0, 1))
    .toConst("heroMidT");
  const apexT = reliefT.mul(apexCore).toConst("heroApexT");

  const widthMul = mix(float(1), float(0.88), creaseT)
    .mul(mix(float(1), float(1.1), outerT))
    .mul(mix(float(1), float(0.78), apexT))
    .mul(mix(float(1), float(0.94), midT))
    .toConst("heroReliefWidthMul");

  const lengthMul = mix(float(1), float(1.08), creaseT)
    .mul(mix(float(1), float(1.04), outerT))
    .mul(mix(float(1), float(0.82), apexT))
    .toConst("heroReliefLengthMul");

  const heightMul = mix(float(1), float(0.94), creaseT)
    .mul(mix(float(1), float(1.05), outerT))
    .mul(mix(float(1), float(0.88), apexT))
    .mul(mix(float(1), float(0.96), midT))
    .toConst("heroReliefHeightMul");

  const opacityMul = mix(float(1), float(0.72), creaseT)
    .mul(mix(float(1), float(0.65), apexT))
    .mul(mix(float(1), float(1.06), outerT))
    .mul(mix(float(1), float(0.92), midT))
    .clamp(float(0.5), float(1.12))
    .toConst("heroReliefOpacityMul");

  return { widthMul, heightMul, lengthMul, opacityMul };
};

const buildLateReleaseState = ({ uniforms }) => {
  const structuralReleaseT = smoothstep(
    float(0.24),
    float(0.94),
    uniforms.opacityT.clamp(0, 1),
  ).toConst("structuralReleaseT");

  const structuralSurvival = float(1)
    .sub(structuralReleaseT)
    .clamp(0, 1)
    .toConst("structuralSurvival");

  // Cohort classification is a pure function of instanceIndex — reproduced
  // here with the same hash + seed + thresholds as HERO_POINT_CLOUD in the
  // simulator generator. No buffer/struct field is hijacked.
  const roleU = fract(
    sin(instanceIndex.toFloat().add(float(1)).mul(float(91.4271))).mul(
      float(43758.5453),
    ),
  ).toConst("cohortRoleU");
  const cohortGate = smoothstep(
    float(0.28),
    float(0.9),
    uniforms.heroCohortT.clamp(0, 1),
  ).toConst("cohortGate");
  const heroMask = step(float(0.85), roleU).toConst("cohortHeroMask");
  const supportMask = step(float(0.62), roleU)
    .mul(float(1).sub(heroMask))
    .toConst("cohortSupportMask");
  const bulkMask = float(1)
    .sub(step(float(0.62), roleU))
    .toConst("cohortBulkMask");

  const cohortSizeTarget = heroMask
    .mul(float(1.0))
    .add(supportMask.mul(float(0.82)))
    .add(bulkMask.mul(float(0.55)));
  const cohortOpacityTarget = heroMask
    .mul(float(1.0))
    .add(supportMask.mul(float(0.72)))
    .add(bulkMask.mul(float(0.36)));
  const cohortEmissiveTarget = heroMask
    .mul(float(1.0))
    .add(supportMask.mul(float(0.30)))
    .add(bulkMask.mul(float(0.08)));

  const cohortSizeMul = mix(float(1), cohortSizeTarget, cohortGate).toConst(
    "cohortSizeMul",
  );
  const cohortOpacityMul = mix(
    float(1),
    cohortOpacityTarget,
    cohortGate,
  ).toConst("cohortOpacityMul");
  const cohortEmissiveMul = mix(
    float(1),
    cohortEmissiveTarget,
    cohortGate,
  ).toConst("cohortEmissiveMul");

  return {
    structuralReleaseT,
    structuralSurvival,
    cohortSizeMul,
    cohortOpacityMul,
    cohortEmissiveMul,
  };
};

const buildParticleProfileState = ({
  speed,
  particleDensity,
  convergenceFreeze,
  compressT,
  thinT,
  simPos,
  uniforms,
}) => {
  const stretch = smoothstep(
    float(PARTICLE_PROFILE_READ.speedBandStart),
    float(PARTICLE_PROFILE_READ.speedBandEnd),
    speed,
  )
    .mul(PARTICLE_PROFILE_READ.stretchGain)
    .add(PARTICLE_PROFILE_READ.stretchBias)
    .toConst("stretch");

  const thinning = pow(
    stretch,
    float(PARTICLE_PROFILE_READ.thinningPower),
  ).toConst("thinning");

  const freezeShapeT = smoothstep(
    float(PARTICLE_PROFILE_READ.freezeBandStart),
    float(PARTICLE_PROFILE_READ.freezeBandEnd),
    convergenceFreeze.toConst("shapeFrozenT"),
  ).toConst("freezeShapeT");

  const compressLocal = compressT.clamp(0, 1).toConst("compressLocal");
  const compressEase = smoothstep(
    float(COMPRESS_EASE_EDGE0),
    float(COMPRESS_EASE_EDGE1),
    compressLocal,
  ).toConst("compressEase");

  const rodWidthFreeze = mix(
    thinning,
    float(PARTICLE_PROFILE_READ.frozenWidth),
    freezeShapeT,
  ).toConst("rodWidthFreeze");

  const rodHeightFreeze = mix(
    thinning,
    float(PARTICLE_PROFILE_READ.frozenHeight),
    freezeShapeT,
  ).toConst("rodHeightFreeze");

  const rodLengthFreeze = mix(
    stretch,
    float(PARTICLE_PROFILE_READ.frozenLength),
    freezeShapeT,
  ).toConst("rodLengthFreeze");

  const rodWidthCompressed = mix(
    rodWidthFreeze,
    float(PARTICLE_PROFILE_READ.compressedWidth),
    compressEase,
  ).toConst("rodWidthCompressed");

  const rodHeightCompressed = mix(
    rodHeightFreeze,
    float(PARTICLE_PROFILE_READ.compressedHeight),
    compressEase,
  ).toConst("rodHeightCompressed");

  const rodLengthCompressed = mix(
    rodLengthFreeze,
    float(PARTICLE_PROFILE_READ.compressedLength),
    compressEase,
  ).toConst("rodLengthCompressed");

  const thinLocal = thinT.clamp(0, 1).toConst("thinLocal");

  const relief = buildHeroReliefModulation({ simPos, uniforms, compressT });

  const rodWidth = rodWidthCompressed
    .mul(float(1).sub(thinLocal.mul(float(WITHDRAW_READ.thinWidthReduction))))
    .mul(relief.widthMul)
    .toConst("rodWidth");

  const rodHeight = rodHeightCompressed
    .mul(float(1).sub(thinLocal.mul(float(WITHDRAW_READ.thinHeightReduction))))
    .mul(relief.heightMul)
    .toConst("rodHeight");

  const rodLength = rodLengthCompressed
    .mul(float(1).sub(thinLocal.mul(float(WITHDRAW_READ.thinLengthReduction))))
    .mul(relief.lengthMul)
    .toConst("rodLength");

  const frozenDensity = mix(
    particleDensity
      .mul(PARTICLE_PROFILE_READ.densityLift)
      .add(PARTICLE_PROFILE_READ.densityBias)
      .clamp(0, 1),
    float(PARTICLE_PROFILE_READ.frozenDensity),
    freezeShapeT,
  ).toConst("frozenDensity");

  const densityScale = mix(
    mix(
      frozenDensity,
      float(PARTICLE_PROFILE_READ.compressedDensity),
      compressEase.mul(float(0.65)),
    ).clamp(0, 1.08),
    float(0.08),
    thinLocal,
  ).toConst("densityScale");

  return { rodWidth, rodHeight, rodLength, densityScale };
};

const buildParticleViewState = ({
  formedDir,
  speed,
  vNormalView,
  vFacingThickness,
}) => {
  const mat = calcLookAtMatrix(formedDir);

  const orientedNormalView = normalize(
    transformNormalToView(mat.mul(normalLocal)),
  ).toConst("orientedNormalView");

  const facingThickness = orientedNormalView.z
    .abs()
    .oneMinus()
    .mul(
      smoothstep(
        float(PARTICLE_PROFILE_READ.facingThicknessSpeedMin),
        float(PARTICLE_PROFILE_READ.facingThicknessSpeedMax),
        speed,
      )
        .toConst("facingThicknessBandT")
        .mul(PARTICLE_PROFILE_READ.facingThicknessGain)
        .add(PARTICLE_PROFILE_READ.facingThicknessBias),
    )
    .clamp(0, 1)
    .toConst("facingThickness");

  vNormalView.assign(orientedNormalView);
  vFacingThickness.assign(facingThickness);

  return { mat };
};

const buildUnifiedParticleSurfaceNodes = ({
  particle,
  material,
  vNormalView,
  vFacingThickness,
  uniforms,
}) => {
  const particleHeat = particle.get("heat");
  const particleColor = particle.get("color").toConst("particleColor");
  const lateRelease = buildLateReleaseState({ uniforms });
  const viewNormal = normalize(vNormalView).toConst("viewNormal");
  const viewFacingT = viewNormal.z.abs().clamp(0, 1).toConst("viewFacingT");

  const viewThicknessT = vFacingThickness.clamp(0, 1).toConst("viewThicknessT");

  const roughNoise = fract(sin(instanceIndex.toFloat().mul(483.1)).mul(19847.3))
    .mul(0.12)
    .sub(0.06)
    .toConst("roughNoise");

  const baseSurfaceRoughness = float(0.92)
    .add(roughNoise)
    .clamp(0.86, 0.96)
    .sub(viewThicknessT.mul(0.075))
    .sub(viewFacingT.mul(viewThicknessT).mul(0.02))
    .clamp(0.8, 0.96)
    .toConst("baseSurfaceRoughness");

  const glowFactor = smoothstep(float(0.12), float(0.46), particleHeat).toConst(
    "glowFactor",
  );
  const massDimT = uniforms.massDimT.clamp(0, 1).toConst("massDimT");
  const decayProgress = particle
    .get("dissolveState")
    .y.clamp(0, 1)
    .toConst("decayProgress");
  const surfaceColor = particleColor
    .mul(mix(float(1), float(0.0), massDimT))
    .toConst("surfaceColor");

  const surfaceRoughness = baseSurfaceRoughness
    .add(massDimT.mul(float(0.02)))
    .clamp(0.8, 0.98)
    .toConst("surfaceRoughness");

  const baseEmissive = vec3(0.36, 0.12, 0.03)
    .mul(glowFactor)
    .mul(float(0.0095))
    .toConst("baseEmissive");
  const surfaceEmissive = baseEmissive
    .mul(mix(float(1), float(0.0), massDimT))
    .mul(lateRelease.cohortEmissiveMul)
    .toConst("surfaceEmissive");

  const surfaceAo = mix(float(1.0), float(0.92), viewThicknessT)
    .add(viewThicknessT.mul(0.02))
    .clamp(0, 1)
    .toConst("surfaceAo");

  const simPosSurface = particle.get("position").xyz;
  const compressTVisualSurface = buildCompressTVisualRead(uniforms);
  const reliefSurface = buildHeroReliefModulation({
    simPos: simPosSurface,
    uniforms,
    compressT: compressTVisualSurface,
  });

  const opacityEffective = float(1)
    .sub(uniforms.opacityT.clamp(0, 1))
    .mul(lateRelease.structuralSurvival)
    .mul(float(1).sub(massDimT.mul(float(0.92))))
    .mul(float(1).sub(decayProgress))
    .mul(lateRelease.cohortOpacityMul)
    .mul(reliefSurface.opacityMul)
    .clamp(0, 1)
    .toConst("opacityEffective");

  material.colorNode = surfaceColor;
  material.roughnessNode = surfaceRoughness;
  material.metalnessNode = float(0.015);
  material.emissiveNode = surfaceEmissive;
  material.aoNode = surfaceAo;
  material.opacityNode = opacityEffective;

  material.mrtNode = mrt({
    bloomIntensity: smoothstep(
      float(0.004),
      float(0.035),
      surfaceEmissive.r.max(surfaceEmissive.g).max(surfaceEmissive.b),
    )
      .mul(surfaceEmissive.r.max(surfaceEmissive.g).max(surfaceEmissive.b))
      .mul(opacityEffective)
      .clamp(0, 1),
  });
};

const buildParticlePositionNode = ({
  particle,
  uniforms,
  sizeUniform,
  vNormalView,
  vFacingThickness,
}) =>
  Fn(() => {
    const simPos = particle.get("position").xyz.toConst("simPos");
    const particleDensity = particle.get("density");
    const particleDirection = particle.get("direction");
    const localPos = attribute("position").xyz;
    const speed = particle.get("velocity").length();

    const compressTVisualRead = buildCompressTVisualRead(uniforms);

    const particleProfile = buildParticleProfileState({
      speed,
      particleDensity,
      convergenceFreeze: uniforms.convergenceFreeze,
      compressT: compressTVisualRead,
      thinT: uniforms.thinT,
      simPos,
      uniforms,
    });

    const formedDir = normalize(particleDirection.xyz).toConst("formedDir");
    const shapedPos = vec3(
      localPos.x.mul(particleProfile.rodWidth),
      localPos.y.mul(particleProfile.rodHeight),
      localPos.z.mul(particleProfile.rodLength),
    ).toConst("shapedPos");

    const lateRelease = buildLateReleaseState({ uniforms });
    const structureScale = lateRelease.structuralSurvival
      .mul(lateRelease.cohortSizeMul)
      .toConst("structureScale");

    const viewState = buildParticleViewState({
      formedDir,
      speed,
      vNormalView,
      vFacingThickness,
    });

    return viewState.mat
      .mul(
        shapedPos.mul(
          structureScale,
        ),
      )
      .mul(
        sizeUniform
          .mul(PARTICLE_PROFILE_READ.instanceScale)
          .mul(uniforms.bodyScaleMul),
      )
      .mul(particleProfile.densityScale)
      .add(simPos);
  })();

const createRoundedBox = (width, height, depth, radius) => {
  const box = new THREE.BoxGeometry(
    width - radius * 2,
    height - radius * 2,
    depth - radius * 2,
  );
  const epsilon = Math.min(width, height, depth) * 0.01;
  const positionArray = box.attributes.position.array;
  const normalArray = box.attributes.normal.array;
  const indices = [...box.getIndex().array];
  const vertices = [];
  const posMap = {};
  const edgeMap = {};

  for (let i = 0; i < positionArray.length / 3; i++) {
    const oldPosition = new THREE.Vector3(
      positionArray[i * 3],
      positionArray[i * 3 + 1],
      positionArray[i * 3 + 2],
    );

    positionArray[i * 3 + 0] += normalArray[i * 3 + 0] * radius;
    positionArray[i * 3 + 1] += normalArray[i * 3 + 1] * radius;
    positionArray[i * 3 + 2] += normalArray[i * 3 + 2] * radius;

    const vertex = new THREE.Vector3(
      positionArray[i * 3],
      positionArray[i * 3 + 1],
      positionArray[i * 3 + 2],
    );
    vertex.normal = new THREE.Vector3(
      normalArray[i * 3],
      normalArray[i * 3 + 1],
      normalArray[i * 3 + 2],
    );
    vertex.id = i;
    vertex.faces = [];
    vertex.posHash = oldPosition
      .toArray()
      .map((v) => Math.round(v / epsilon))
      .join("_");

    posMap[vertex.posHash] = [...(posMap[vertex.posHash] || []), vertex];
    vertices.push(vertex);
  }

  vertices.forEach((vertex) => {
    const face = vertex.normal
      .toArray()
      .map((v) => Math.round(v))
      .join("_");
    vertex.face = face;
    posMap[vertex.posHash].forEach((v) => {
      v.faces.push(face);
    });
  });

  vertices.forEach((vertex) => {
    const addVertexToEdgeMap = (entry) => {
      edgeMap[entry] = [...(edgeMap[entry] || []), vertex];
    };

    vertex.faces.sort();
    const f0 = vertex.faces[0];
    const f1 = vertex.faces[1];
    const f2 = vertex.faces[2];
    const face = vertex.face;

    if (f0 === face || f1 === face) addVertexToEdgeMap(`${f0}_${f1}`);
    if (f0 === face || f2 === face) addVertexToEdgeMap(`${f0}_${f2}`);
    if (f1 === face || f2 === face) addVertexToEdgeMap(`${f1}_${f2}`);
  });

  const addFace = (v0, v1, v2) => {
    const a = v1.clone().sub(v0);
    const b = v2.clone().sub(v0);
    if (a.cross(b).dot(v0) > 0) {
      indices.push(v0.id, v1.id, v2.id);
    } else {
      indices.push(v0.id, v2.id, v1.id);
    }
  };

  Object.keys(posMap).forEach((key) => {
    addFace(...posMap[key]);
  });

  Object.keys(edgeMap).forEach((key) => {
    const edgeVertices = edgeMap[key];
    const v0 = edgeVertices[0];
    edgeVertices.sort((v1, v2) => v1.distanceTo(v0) - v2.distanceTo(v0));
    addFace(...edgeVertices.slice(0, 3));
    addFace(...edgeVertices.slice(1, 4));
  });

  box.setIndex(indices);
  return box;
};

let particleGeometryTemplate = null;
export const getParticleGeometryTemplate = () =>
  particleGeometryTemplate ??
  (particleGeometryTemplate = createRoundedBox(0.7, 0.7, 3, 0.1));

class ParticleRenderer {
  mlsMpmSim = null;
  object = null;
  geometry = null;
  material = null;
  uniforms = {};

  runtime = {
    particles: 8192 * 4,
    actualSize: (1.6 / Math.pow(4, 1 / 3)) * 0.68,
    convergenceFreeze: 0,
    bodyScaleMul: 1,
    massDimT: 0,
    compressT: 0,
    thinT: 0,
    opacityT: 0,
    solverLocked: false,
  };

  constructor(mlsMpmSim) {
    this.mlsMpmSim = mlsMpmSim;

    this.geometry = new THREE.InstancedBufferGeometry().copy(
      getParticleGeometryTemplate(),
    );
    this.geometry.instanceCount = this.mlsMpmSim.numParticles;

    this.material = new THREE.MeshStandardNodeMaterial({
      metalness: 0.015,
      roughness: 0.92,
      transparent: true,
      depthWrite: true,
    });

    this.uniforms.size = uniform(1);
    this.uniforms.convergenceFreeze = uniform(0);
    this.uniforms.bodyScaleMul = uniform(1);
    this.uniforms.massDimT = uniform(0);
    this.uniforms.compressT = uniform(0);
    this.uniforms.forensicSuppressCompressVisual = uniform(0);
    this.uniforms.thinT = uniform(0);
    this.uniforms.opacityT = uniform(0);
    this.uniforms.heroCohortT = uniform(0);
    this.uniforms.heroSimCenter = uniform(new THREE.Vector3(32, 31.8, 30.4));
    this.uniforms.solverLockedFloat = uniform(0);

    this._worldQuaternion = new THREE.Quaternion();
    this._worldScale = new THREE.Vector3();

    const vNormalView = varying(vec3(0), "vNormalView");
    const vFacingThickness = varying(0, "vFacingThickness");
    const particle = this.mlsMpmSim.particleBuffer.element(instanceIndex);

    this.material.positionNode = buildParticlePositionNode({
      particle,
      uniforms: this.uniforms,
      sizeUniform: this.uniforms.size,
      vNormalView,
      vFacingThickness,
    });

    buildUnifiedParticleSurfaceNodes({
      particle,
      material: this.material,
      vNormalView,
      vFacingThickness,
      uniforms: this.uniforms,
    });

    /** MLS rods only — must not be the same node as `object`, so post-enter apparition can sibling-render. */
    this._particleBodyMesh = new THREE.Mesh(this.geometry, this.material);
    this._particleBodyMesh.frustumCulled = false;
    this._particleBodyMesh.castShadow = true;
    this._particleBodyMesh.receiveShadow = true;

    this.object = new THREE.Group();
    this.object.frustumCulled = false;
    this.object.add(this._particleBodyMesh);

    const s = 1 / 64;
    this.object.position.set(-32.0 * s * 1.6, -0.012, -0.12);
    this.object.rotation.x = 0.004;
    this.object.rotation.y = -0.04;
    this.object.rotation.z = -0.01;
    this.object.scale.set(s * 1.6, s * 0.88, s * 1.1);
  }

  worldPointToSimulation(worldPoint, target = new THREE.Vector3()) {
    this.object.updateWorldMatrix(true, false);
    return this.object.worldToLocal(target.copy(worldPoint));
  }

  worldDirectionToSimulation(worldDirection, target = new THREE.Vector3()) {
    this.object.updateWorldMatrix(true, false);
    const worldQuaternion = this.object.getWorldQuaternion(
      this._worldQuaternion,
    );
    const worldScale = this.object.getWorldScale(this._worldScale);

    target
      .copy(worldDirection)
      .applyQuaternion(worldQuaternion.invert())
      .set(
        target.x / Math.max(worldScale.x, 0.0001),
        target.y / Math.max(worldScale.y, 0.0001),
        target.z / Math.max(worldScale.z, 0.0001),
      )
      .normalize();

    return target;
  }

  applyRuntime(runtime) {
    if (runtime) this.runtime = runtime;
  }

  updateRuntimeUniforms() {
    this.uniforms.size.value = this.runtime.actualSize;
    this.uniforms.convergenceFreeze.value = this.runtime.convergenceFreeze;
    this.uniforms.bodyScaleMul.value = this.runtime.bodyScaleMul ?? 1;
    this.uniforms.massDimT.value = this.runtime.massDimT ?? 0;
    this.uniforms.compressT.value = this.runtime.compressT ?? 0;
    this.uniforms.forensicSuppressCompressVisual.value =
      forensicSuppressCompressVisual() ? 1 : 0;
    this.uniforms.thinT.value = this.runtime.thinT ?? 0;
    this.uniforms.opacityT.value = this.runtime.opacityT ?? 0;
    this.uniforms.heroCohortT.value = this.runtime.heroBodyWeight ?? 0;
    const heroCenter = this.mlsMpmSim?.uniforms?.heroCenter?.value;
    if (heroCenter) {
      this.uniforms.heroSimCenter.value.copy(heroCenter);
    }
    this.uniforms.solverLockedFloat.value = this.runtime.solverLocked ? 1 : 0;
    this.material.envMapIntensity = 0.12;

    const lockedDissolve =
      !!this.runtime.solverLocked && (this.runtime.opacityT ?? 0) > 0.001;
    this.material.transparent = true;
    this.material.depthWrite = !lockedDissolve;

    if (this._particleBodyMesh) {
      this._particleBodyMesh.castShadow = !this.runtime.solverLocked;
      this._particleBodyMesh.visible = true;
    }
  }

  dispose() {
    if (this.object?.parent) {
      this.object.parent.remove(this.object);
    }

    this._particleBodyMesh = null;
    this.object = null;
    this.geometry?.dispose?.();
    this.material?.dispose?.();
    this.geometry = null;
    this.material = null;
    this.mlsMpmSim = null;
    this.uniforms = {};
  }

  update() {
    this.updateRuntimeUniforms();
    this.geometry.instanceCount = this.runtime.particles;
  }
}

export default ParticleRenderer;
