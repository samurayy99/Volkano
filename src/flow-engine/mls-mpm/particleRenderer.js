import * as THREE from "three/webgpu";
import {
  Fn,
  attribute,
  vec2,
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
} from "three/tsl";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { conf } from "../conf";
import { PREENTER_VESSEL, PREENTER_SOURCE_ANCHOR } from "../vesselDescriptors";

export const calcLookAtMatrix = /*#__PURE__*/ Fn(([target_immutable]) => {
  const target = vec3(target_immutable).toVar();
  const rr = vec3(0, 0, 1.0).toVar();
  const ww = vec3(normalize(target)).toVar();
  const uu = vec3(normalize(cross(ww, rr)).negate()).toVar();
  const vv = vec3(normalize(cross(uu, ww)).negate()).toVar();

  return mat3(uu, vv, ww);
}).setLayout({
  name: "calcLookAtMatrix",
  type: "mat3",
  inputs: [{ name: "direction", type: "vec3" }],
});

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
    posMap[vertex.posHash].forEach((vertex) => {
      vertex.faces.push(face);
    });
  });
  vertices.forEach((vertex) => {
    const addVertexToEdgeMap = (vertex, entry) => {
      edgeMap[entry] = [...(edgeMap[entry] || []), vertex];
    };
    vertex.faces.sort();
    const f0 = vertex.faces[0];
    const f1 = vertex.faces[1];
    const f2 = vertex.faces[2];
    const face = vertex.face;
    if (f0 === face || f1 === face) addVertexToEdgeMap(vertex, f0 + "_" + f1);
    if (f0 === face || f2 === face) addVertexToEdgeMap(vertex, f0 + "_" + f2);
    if (f1 === face || f2 === face) addVertexToEdgeMap(vertex, f1 + "_" + f2);
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

class ParticleRenderer {
  mlsMpmSim = null;
  object = null;
  bloom = false;
  freezeDescriptor = null;
  uniforms = {};

  constructor(mlsMpmSim) {
    this.mlsMpmSim = mlsMpmSim;

    const boxGeometry = BufferGeometryUtils.mergeVertices(
      new THREE.BoxGeometry(7, 7, 30),
      3.0,
    );
    boxGeometry.attributes.position.array =
      boxGeometry.attributes.position.array.map((v) => v * 0.1);
    const roundedBoxGeometry = createRoundedBox(0.7, 0.7, 3, 0.1); //BufferGeometryUtils.mergeVertices(new RoundedBoxGeometry(0.7,0.7,3,1,0.1));

    this.defaultIndexCount = roundedBoxGeometry.index.count;
    this.shadowIndexCount = boxGeometry.index.count;

    const mergedGeometry = BufferGeometryUtils.mergeGeometries([
      roundedBoxGeometry,
      boxGeometry,
    ]);

    this.geometry = new THREE.InstancedBufferGeometry().copy(mergedGeometry);

    this.geometry.setDrawRange(0, this.defaultIndexCount);
    this.geometry.instanceCount = this.mlsMpmSim.numParticles;

    this.material = new THREE.MeshStandardNodeMaterial({
      metalness: 0.015,
      roughness: 0.96,
    });

    this.uniforms.size = uniform(1);
    const vAo = varying(0, "vAo");
    const vNormal = varying(vec3(0), "v_normalView");
    this.uniforms.quietChamber = uniform(0);
    this.uniforms.collapseMix = uniform(0);
    this.uniforms.convergenceFreeze = uniform(0);
    this.uniforms.debugVis = uniform(0);
    this.uniforms.freezeCenter = uniform(new THREE.Vector3());
    this.uniforms.freezeBoundsMin = uniform(new THREE.Vector3());
    this.uniforms.freezeBoundsMax = uniform(new THREE.Vector3());
    this.uniforms.chamberMin = uniform(new THREE.Vector3());
    this.uniforms.chamberMax = uniform(new THREE.Vector3());
    const vBurstT = varying(float(0), "vBurstT");
    const vFrontPassT = varying(float(0), "vFrontPassT");
    const vFringeFrontFade = varying(float(0), "vFringeFrontFade");
    const vLossFrontFade = varying(float(0), "vLossFrontFade");
    const vCoreRole = varying(float(0), "vCoreRole");
    const vFringeRole = varying(float(0), "vFringeRole");
    const vLossRole = varying(float(0), "vLossRole");
    const vFringeKeep = varying(float(0), "vFringeKeep");
    const vLossKeep = varying(float(0), "vLossKeep");
    const particle = this.mlsMpmSim.particleBuffer.element(instanceIndex);
    this.material.positionNode = Fn(() => {
      // ─── PARTICLE DATA ───────────────────────────────
      const particlePosition = particle.get("position");
      const particleDensity = particle.get("density");
      const particleDirection = particle.get("direction");
      const localPos = attribute("position").xyz;
      const particleVelocity = particle.get("velocity");
      const speed = particleVelocity.length();

      // ─── BASE STRETCH ────────────────────────────────
      const stretchT = smoothstep(float(1.2), float(3.5), speed);
      const stretch = stretchT.mul(1.2).add(1.0);
      const thinning = pow(stretch, -0.4);
      const monumentMix = this.uniforms.convergenceFreeze;
      const crustCompression = monumentMix.toConst("crustCompression");
      const monumentWidth = mix(
        thinning,
        float(2.08),
        crustCompression,
      ).toConst("monumentWidth");
      const monumentHeight = mix(
        thinning,
        float(1.26),
        crustCompression,
      ).toConst("monumentHeight");
      const monumentLength = mix(
        stretch,
        float(0.62),
        crustCompression,
      ).toConst("monumentLength");

      // ─── TIMING + HASHES ─────────────────────────────
      const cMix = this.uniforms.collapseMix;
      const particleHash = fract(float(instanceIndex).add(1.0).mul(0.6180339887))
        .toConst("particleHash");
      const freezeCenter = this.uniforms.freezeCenter;
      const freezeBoundsMin = this.uniforms.freezeBoundsMin;
      const freezeBoundsMax = this.uniforms.freezeBoundsMax;
      const cMin = this.uniforms.chamberMin;
      const cMax = this.uniforms.chamberMax;

      const basePosition = particlePosition.xyz.toConst("basePosition");
      const monumentPosition = basePosition.toConst("monumentPosition");

      const preloadT = smoothstep(float(0.0), float(0.14), cMix)
        .mul(float(1).sub(smoothstep(float(0.18), float(0.34), cMix)))
        .toConst("preloadT");
      const releaseT = smoothstep(float(0.14), float(0.72), cMix)
        .toConst("releaseT");

      // Distance-weighted stagger: outer particles release slightly earlier
      const distFromCenter = monumentPosition.sub(freezeCenter).length();
      const chamberDiag = cMax.sub(cMin).length();
      const normalizedDist = distFromCenter.div(chamberDiag.max(float(0.001)));
      const hashStagger = particleHash.mul(0.35).toConst("hashStagger");
      const distanceStagger = normalizedDist.mul(0.20).toConst("distanceStagger");
      const releaseStagger = hashStagger.add(distanceStagger).toConst("releaseStagger");
      const burstParticleT = releaseT.sub(releaseStagger)
        .div(float(1).sub(releaseStagger)).clamp(0, 1).toConst("burstParticleT");

      // ─── BURST DIRECTION (form memory blend) ─────────
      const hashX = fract(sin(instanceIndex.toFloat().mul(127.1)).mul(43758.5453)).mul(2.0).sub(1.0);
      const hashY = fract(sin(instanceIndex.toFloat().mul(269.5)).mul(18642.3721)).mul(2.0).sub(1.0);
      const hashZ = fract(sin(instanceIndex.toFloat().mul(419.2)).mul(29517.8134)).mul(2.0).sub(1.0);
      const hashDir = normalize(vec3(hashX, hashY, hashZ));

      // Keep the original burst class; target-depth tuning should not also replace the early motion grammar.
      const radialDir = normalize(monumentPosition.sub(freezeCenter).add(hashDir.mul(0.001)));
      const formDir = particleDirection.xyz;
      const rawBurst = mix(radialDir, formDir, float(0.35)).add(hashDir.mul(0.12));
      const burstDir = normalize(rawBurst).toConst("burstDir");
      const shellT = smoothstep(float(0.16), float(0.58), normalizedDist).toConst("shellT");
      const peelDir = normalize(
        mix(radialDir, burstDir, float(0.55)).add(hashDir.mul(0.04)),
      ).toConst("peelDir");

      // ─── FREEZE-SPACE VOLUMETRIC CLEARING ───────────
      const roleHash = fract(sin(instanceIndex.toFloat().mul(211.7)).mul(51234.7261))
        .toConst("roleHash");
      const coreRole = float(1).sub(step(float(0.18), roleHash)).toConst("coreRole");
      const fringeRole = step(float(0.18), roleHash)
        .mul(float(1).sub(step(float(0.52), roleHash)))
        .toConst("fringeRole");
      const lossRole = step(float(0.52), roleHash).toConst("lossRole");

      const spanX = cMax.x.sub(cMin.x);
      const spanY = cMax.y.sub(cMin.y);
      const spanZ = cMax.z.sub(cMin.z);
      const chamberDepth = spanZ.max(float(0.001)).toConst("chamberDepth");
      const freezeSpan = freezeBoundsMax.sub(freezeBoundsMin);
      const freezeFrac = vec3(
        monumentPosition.x.sub(freezeBoundsMin.x).div(freezeSpan.x.max(float(0.001))),
        monumentPosition.y.sub(freezeBoundsMin.y).div(freezeSpan.y.max(float(0.001))),
        monumentPosition.z.sub(freezeBoundsMin.z).div(freezeSpan.z.max(float(0.001))),
      ).clamp(0, 1).toConst("freezeFrac");
      const freezeCentered = freezeFrac.mul(2.0).sub(1.0).toConst("freezeCentered");
      const clearForwardDir = vec3(0, 0, -1).toConst("clearForwardDir");
      const bandHash = fract(sin(instanceIndex.toFloat().mul(91.13)).mul(24634.634))
        .toConst("bandHash");
      const rearBand = float(1).sub(step(float(0.34), bandHash)).toConst("rearBand");
      const midBand = step(float(0.34), bandHash)
        .mul(float(1).sub(step(float(0.78), bandHash)))
        .toConst("midBand");
      const nearBand = step(float(0.78), bandHash).toConst("nearBand");

      const memoryX = freezeCentered.x.toConst("memoryX");
      const memoryY = freezeCentered.y.toConst("memoryY");
      const scatterX = hashX.toConst("scatterX");
      const scatterY = hashY.toConst("scatterY");

      const baseCoreSpreadX = mix(memoryX, scatterX, float(0.16))
        .mul(spanX.mul(0.12))
        .toConst("baseCoreSpreadX");
      const baseCoreSpreadY = mix(memoryY, scatterY, float(0.16))
        .mul(spanY.mul(0.14))
        .toConst("baseCoreSpreadY");
      const coreTargetZ = clearForwardDir.z.mul(chamberDepth.mul(1.95))
        .add(hashZ.mul(chamberDepth.mul(0.08)))
        .toConst("coreTargetZ");
      const baseSpearTarget = freezeCenter.add(vec3(baseCoreSpreadX, baseCoreSpreadY, coreTargetZ))
        .toConst("baseSpearTarget");

      const fringeDepth = rearBand.mul(chamberDepth.mul(0.24))
        .add(midBand.mul(chamberDepth.mul(0.42)))
        .add(nearBand.mul(chamberDepth.mul(0.58)))
        .toConst("fringeDepth");
      const fringeSpanX = rearBand.mul(spanX.mul(0.18))
        .add(midBand.mul(spanX.mul(0.28)))
        .add(nearBand.mul(spanX.mul(0.36)))
        .toConst("fringeSpanX");
      const fringeSpanY = rearBand.mul(spanY.mul(0.20))
        .add(midBand.mul(spanY.mul(0.30)))
        .add(nearBand.mul(spanY.mul(0.34)))
        .toConst("fringeSpanY");
      const baseFringeSpreadX = mix(memoryX, scatterX, float(0.42))
        .mul(fringeSpanX)
        .toConst("baseFringeSpreadX");
      const baseFringeSpreadY = mix(memoryY, scatterY, float(0.42))
        .mul(fringeSpanY)
        .toConst("baseFringeSpreadY");
      const fringeTargetZ = clearForwardDir.z.mul(fringeDepth)
        .add(hashZ.mul(chamberDepth.mul(0.10)))
        .toConst("fringeTargetZ");
      const baseFringeBandTarget = freezeCenter.add(vec3(baseFringeSpreadX, baseFringeSpreadY, fringeTargetZ))
        .toConst("baseFringeBandTarget");

      const baseLossSpreadX = mix(memoryX, scatterX, float(0.80))
        .mul(spanX.mul(0.52))
        .toConst("baseLossSpreadX");
      const baseLossSpreadY = mix(memoryY, scatterY, float(0.80))
        .mul(spanY.mul(0.42))
        .toConst("baseLossSpreadY");
      const lossTargetZ = clearForwardDir.z.mul(chamberDepth.mul(1.18))
        .add(hashZ.mul(chamberDepth.mul(0.16)))
        .toConst("lossTargetZ");
      const baseLossTarget = freezeCenter.add(vec3(baseLossSpreadX, baseLossSpreadY, lossTargetZ))
        .toConst("baseLossTarget");

      // ─── THREE-PHASE POSITION ───────────────────────
      const burstMagnitude = chamberDiag.mul(0.12);
      const burstEnvelope = smoothstep(float(0.0), float(0.18), burstParticleT)
        .mul(float(1).sub(smoothstep(float(0.42), float(0.96), burstParticleT)))
        .toConst("burstEnvelope");
      const centerReleaseT = smoothstep(float(0.04), float(0.34), burstParticleT)
        .toConst("centerReleaseT");
      const transferBase = mix(
        monumentPosition,
        monumentPosition.add(burstDir.mul(burstMagnitude.mul(0.35))),
        centerReleaseT,
      ).toConst("transferBase");
      const burstPos = transferBase.add(burstDir.mul(burstMagnitude.mul(burstEnvelope)))
        .toConst("burstPos");
      const sheddingT = smoothstep(float(0.08), float(0.38), burstParticleT)
        .toConst("sheddingT");
      const fieldBuildT = smoothstep(float(0.30), float(0.88), burstParticleT)
        .toConst("fieldBuildT");
      const spearDriveT = smoothstep(float(0.40), float(0.98), burstParticleT)
        .toConst("spearDriveT");
      const lossDriftT = smoothstep(float(0.28), float(0.90), burstParticleT)
        .toConst("lossDriftT");
      const coreApexT = smoothstep(float(0.44), float(0.76), burstParticleT)
        .mul(float(1).sub(smoothstep(float(0.80), float(0.96), burstParticleT)))
        .mul(smoothstep(float(0.50), float(1.0), spearDriveT))
        .toConst("coreApexT");
      const fieldEase = float(1).sub(pow(float(1).sub(fieldBuildT), float(3)))
        .toConst("fieldEase");
      const spearEase = float(1).sub(pow(float(1).sub(spearDriveT), float(3)))
        .toConst("spearEase");
      const lossEase = float(1).sub(pow(float(1).sub(lossDriftT), float(3)))
        .toConst("lossEase");
      const forwardBase = mix(monumentPosition, burstPos, sheddingT).toConst("forwardBase");
      const baseCorePosition = mix(forwardBase, baseSpearTarget, spearEase).toConst("baseCorePosition");
      const baseFringePosition = mix(forwardBase, baseFringeBandTarget, fieldEase)
        .toConst("baseFringePosition");
      const baseLossPosition = mix(forwardBase, baseLossTarget, lossEase).toConst("baseLossPosition");
      const baseRenderPosition = baseCorePosition.mul(coreRole)
        .add(baseFringePosition.mul(fringeRole))
        .add(baseLossPosition.mul(lossRole))
        .toConst("baseRenderPosition");
      const frontTravelBase = cMin.z.sub(baseRenderPosition.z).max(float(0)).toConst("frontTravelBase");
      const nearPassT = smoothstep(
        chamberDepth.mul(0.26),
        chamberDepth.mul(1.18),
        frontTravelBase,
      ).toConst("nearPassT");
      const coreNearT = nearPassT.mul(smoothstep(float(0.42), float(1.0), spearDriveT))
        .toConst("coreNearT");
      // Keep non-core selective near camera; broad front coverage breaks the read.
      const fringeNearT = nearPassT.mul(smoothstep(float(0.60), float(1.0), fieldBuildT))
        .toConst("fringeNearT");
      const lossNearT = nearPassT.mul(smoothstep(float(0.52), float(1.0), lossDriftT))
        .toConst("lossNearT");
      const coreNearSpreadMul = mix(float(1.0), float(1.18), coreNearT)
        .mul(mix(float(1.0), float(0.80), coreApexT))
        .toConst("coreNearSpreadMul");
      const fringeNearSpreadMul = mix(float(1.0), float(0.92), fringeNearT)
        .toConst("fringeNearSpreadMul");
      const lossNearSpreadMul = mix(float(1.0), float(0.70), lossNearT).toConst("lossNearSpreadMul");
      const coreNearScaleMul = mix(float(1.0), float(0.78), coreNearT).toConst("coreNearScaleMul");
      const fringeNearScaleMul = mix(float(1.0), float(0.24), fringeNearT)
        .toConst("fringeNearScaleMul");
      const lossNearScaleMul = mix(float(1.0), float(0.08), lossNearT).toConst("lossNearScaleMul");

      const coreSpreadX = baseCoreSpreadX.mul(coreNearSpreadMul).toConst("coreSpreadX");
      const coreSpreadY = baseCoreSpreadY.mul(coreNearSpreadMul).toConst("coreSpreadY");
      const fringeSpreadX = baseFringeSpreadX.mul(fringeNearSpreadMul).toConst("fringeSpreadX");
      const fringeSpreadY = baseFringeSpreadY.mul(fringeNearSpreadMul).toConst("fringeSpreadY");
      const lossSpreadX = baseLossSpreadX.mul(lossNearSpreadMul).toConst("lossSpreadX");
      const lossSpreadY = baseLossSpreadY.mul(lossNearSpreadMul).toConst("lossSpreadY");
      const spearTarget = freezeCenter.add(vec3(coreSpreadX, coreSpreadY, coreTargetZ))
        .toConst("spearTarget");
      const fringeBandTarget = freezeCenter.add(vec3(fringeSpreadX, fringeSpreadY, fringeTargetZ))
        .toConst("fringeBandTarget");
      const lossTarget = freezeCenter.add(vec3(lossSpreadX, lossSpreadY, lossTargetZ))
        .toConst("lossTarget");

      const chamberUp = vec3(0, 1, 0).toConst("chamberUp");
      const chamberRight = vec3(1, 0, 0).toConst("chamberRight");
      const coreTravelDir = normalize(
        spearTarget.sub(forwardBase).add(clearForwardDir.mul(0.001)),
      ).toConst("coreTravelDir");
      const fringeTravelDirBase = normalize(
        fringeBandTarget.sub(forwardBase).add(clearForwardDir.mul(0.001)),
      ).toConst("fringeTravelDirBase");
      const lossTravelDirBase = normalize(
        lossTarget.sub(forwardBase).add(clearForwardDir.mul(0.001)),
      ).toConst("lossTravelDirBase");
      const coreSideA = cross(coreTravelDir, chamberUp).toConst("coreSideA");
      const fringeSideA = cross(fringeTravelDirBase, chamberUp).toConst("fringeSideA");
      const lossSideA = cross(lossTravelDirBase, chamberUp).toConst("lossSideA");
      const coreSideB = cross(coreTravelDir, chamberRight).toConst("coreSideB");
      const fringeSideB = cross(fringeTravelDirBase, chamberRight).toConst("fringeSideB");
      const lossSideB = cross(lossTravelDirBase, chamberRight).toConst("lossSideB");
      const coreSideBasis = normalize(
        mix(coreSideB, coreSideA, step(float(0.001), coreSideA.length())).add(hashDir.mul(0.001)),
      ).toConst("coreSideBasis");
      const fringeSideBasis = normalize(
        mix(fringeSideB, fringeSideA, step(float(0.001), fringeSideA.length())).add(hashDir.mul(0.001)),
      ).toConst("fringeSideBasis");
      const lossSideBasis = normalize(
        mix(lossSideB, lossSideA, step(float(0.001), lossSideA.length())).add(hashDir.mul(0.001)),
      ).toConst("lossSideBasis");
      const coreArcBell = float(4).mul(spearDriveT).mul(float(1).sub(spearDriveT))
        .toConst("coreArcBell");
      const coreArcOffset = coreSideBasis.mul(spanX.mul(0.05).mul(coreArcBell).mul(hashY))
        .add(chamberUp.mul(spanY.mul(0.03).mul(coreArcBell).mul(hashX)))
        .toConst("coreArcOffset");
      const fringeSweepT = smoothstep(float(0.46), float(0.92), burstParticleT)
        .toConst("fringeSweepT");
      const lossSweepT = smoothstep(float(0.30), float(0.78), burstParticleT)
        .toConst("lossSweepT");
      const fringeSweepTarget = fringeBandTarget
        .add(peelDir.mul(chamberDiag.mul(0.16).mul(shellT)))
        .add(fringeTravelDirBase.mul(chamberDepth.mul(0.10)))
        .add(fringeSideBasis.mul(spanX.mul(0.12).mul(hashY)))
        .add(chamberUp.mul(spanY.mul(0.05).mul(hashX)))
        .toConst("fringeSweepTarget");
      const lossSweepTarget = lossTarget
        .add(peelDir.mul(chamberDiag.mul(0.26).mul(shellT)))
        .add(lossTravelDirBase.mul(chamberDepth.mul(0.12)))
        .add(lossSideBasis.mul(spanX.mul(0.12).mul(hashY)))
        .add(chamberUp.mul(spanY.mul(0.05).mul(hashX)))
        .toConst("lossSweepTarget");
      const fringeTravelDir = normalize(
        mix(fringeBandTarget, fringeSweepTarget, fringeSweepT)
          .sub(forwardBase)
          .add(clearForwardDir.mul(0.001)),
      ).toConst("fringeTravelDir");
      const lossTravelDir = normalize(
        mix(lossTarget, lossSweepTarget, lossSweepT)
          .sub(forwardBase)
          .add(clearForwardDir.mul(0.001)),
      ).toConst("lossTravelDir");

      const corePosition = mix(forwardBase, spearTarget, spearEase).add(coreArcOffset)
        .toConst("corePosition");
      const fringeFieldPosition = mix(forwardBase, fringeBandTarget, fieldEase)
        .toConst("fringeFieldPosition");
      const fringePosition = mix(fringeFieldPosition, fringeSweepTarget, fringeSweepT)
        .toConst("fringePosition");
      const lossBasePosition = mix(forwardBase, lossTarget, lossEase).toConst("lossBasePosition");
      const lossPosition = mix(lossBasePosition, lossSweepTarget, lossSweepT)
        .toConst("lossPosition");
      const renderPosition = corePosition.mul(coreRole)
        .add(fringePosition.mul(fringeRole))
        .add(lossPosition.mul(lossRole))
        .toConst("renderPosition");
      const frontTravel = cMin.z.sub(renderPosition.z).max(float(0)).toConst("frontTravel");
      const coreFrontPassT = smoothstep(
        chamberDepth.mul(0.22),
        chamberDepth.mul(1.02),
        frontTravel,
      ).toConst("coreFrontPassT");
      const coreOccupancyGate = mix(
        float(1.0),
        float(0.64),
        smoothstep(float(0.42), float(0.84), coreFrontPassT).mul(coreApexT),
      ).toConst("coreOccupancyGate");
      const fringeFrontFade = smoothstep(
        chamberDepth.mul(0.24),
        chamberDepth.mul(0.60),
        frontTravel,
      ).toConst("fringeFrontFade");
      const lossFrontFade = smoothstep(
        chamberDepth.mul(0.16),
        chamberDepth.mul(0.42),
        frontTravel,
      ).toConst("lossFrontFade");
      const nearShapeT = smoothstep(
        chamberDepth.mul(0.34),
        chamberDepth.mul(1.10),
        frontTravel,
      ).toConst("nearShapeT");
      const coreNearShapeT = nearShapeT.mul(smoothstep(float(0.42), float(1.0), spearDriveT))
        .toConst("coreNearShapeT");
      const fringeNearShapeT = nearShapeT.mul(smoothstep(float(0.46), float(1.0), fieldBuildT))
        .toConst("fringeNearShapeT");
      const lossNearShapeT = nearShapeT.mul(smoothstep(float(0.38), float(1.0), lossDriftT))
        .toConst("lossNearShapeT");
      const lateCullHash = fract(sin(instanceIndex.toFloat().mul(53.17)).mul(15731.743))
        .toConst("lateCullHash");
      const fringeLateT = smoothstep(float(0.40), float(0.82), burstParticleT).toConst("fringeLateT");
      const lossLateT = smoothstep(float(0.24), float(0.62), burstParticleT).toConst("lossLateT");
      const fringeKeepMask = float(1)
        .sub(step(mix(float(1.0), float(0.46), fringeLateT), lateCullHash))
        .toConst("fringeKeepMask");
      const lossKeepMask = float(1)
        .sub(step(mix(float(1.0), float(0.18), lossLateT), lateCullHash))
        .toConst("lossKeepMask");

      // ─── LAYERED FLIGHT SHAPE ───────────────────────
      const flightStretchT = smoothstep(float(0.14), float(0.46), burstParticleT)
        .mul(float(1).sub(smoothstep(float(0.70), float(0.92), burstParticleT)))
        .toConst("flightStretchT");
      const flightWidth = mix(monumentWidth, float(0.62), flightStretchT).toConst("flightWidth");
      const flightHeight = mix(monumentHeight, float(0.62), flightStretchT).toConst("flightHeight");
      const flightLength = mix(monumentLength, float(1.9), flightStretchT).toConst("flightLength");
      const coreShapeT = spearDriveT.toConst("coreShapeT");
      const fringeShapeT = fieldBuildT.toConst("fringeShapeT");
      const lossShapeT = lossDriftT.toConst("lossShapeT");
      const roleShapeT = coreRole.mul(coreShapeT)
        .add(fringeRole.mul(fringeShapeT))
        .add(lossRole.mul(lossShapeT))
        .toConst("roleShapeT");
      const coreClearWidthTarget = mix(float(0.30), float(0.22), coreApexT)
        .toConst("coreClearWidthTarget");
      const coreClearHeightTarget = mix(float(0.30), float(0.22), coreApexT)
        .toConst("coreClearHeightTarget");
      const coreClearLengthTarget = mix(float(0.84), float(0.78), coreApexT)
        .toConst("coreClearLengthTarget");
      const clearWidthTarget = coreRole.mul(coreClearWidthTarget)
        .add(fringeRole.mul(float(0.28)))
        .add(lossRole.mul(float(0.18)))
        .toConst("clearWidthTarget");
      const clearHeightTarget = coreRole.mul(coreClearHeightTarget)
        .add(fringeRole.mul(float(0.28)))
        .add(lossRole.mul(float(0.18)))
        .toConst("clearHeightTarget");
      const clearLengthTarget = coreRole.mul(coreClearLengthTarget)
        .add(fringeRole.mul(float(0.36)))
        .add(lossRole.mul(float(0.18)))
        .toConst("clearLengthTarget");
      const clearWidth = mix(flightWidth, clearWidthTarget, roleShapeT).toConst("clearWidth");
      const clearHeight = mix(flightHeight, clearHeightTarget, roleShapeT).toConst("clearHeight");
      const clearLength = mix(flightLength, clearLengthTarget, roleShapeT).toConst("clearLength");
      const coreNearWidthMul = mix(float(1.0), float(0.58), coreNearShapeT)
        .mul(mix(float(1.0), float(0.86), coreApexT))
        .toConst("coreNearWidthMul");
      const fringeNearWidthMul = mix(float(1.0), float(0.24), fringeNearShapeT)
        .toConst("fringeNearWidthMul");
      const lossNearWidthMul = mix(float(1.0), float(0.08), lossNearShapeT)
        .toConst("lossNearWidthMul");
      const coreNearLengthMul = mix(float(1.0), float(0.90), coreNearShapeT)
        .mul(mix(float(1.0), float(0.96), coreApexT))
        .toConst("coreNearLengthMul");
      const fringeNearLengthMul = mix(float(1.0), float(0.54), fringeNearShapeT)
        .toConst("fringeNearLengthMul");
      const lossNearLengthMul = mix(float(1.0), float(0.34), lossNearShapeT)
        .toConst("lossNearLengthMul");
      const roleNearWidthMul = coreRole.mul(coreNearWidthMul)
        .add(fringeRole.mul(fringeNearWidthMul))
        .add(lossRole.mul(lossNearWidthMul))
        .toConst("roleNearWidthMul");
      const roleNearLengthMul = coreRole.mul(coreNearLengthMul)
        .add(fringeRole.mul(fringeNearLengthMul))
        .add(lossRole.mul(lossNearLengthMul))
        .toConst("roleNearLengthMul");
      const finalWidth = mix(monumentWidth, clearWidth, releaseT).mul(roleNearWidthMul)
        .toConst("finalWidth");
      const finalHeight = mix(monumentHeight, clearHeight, releaseT).mul(roleNearWidthMul)
        .toConst("finalHeight");
      const finalLength = mix(monumentLength, clearLength, releaseT).mul(roleNearLengthMul)
        .toConst("finalLength");

      const stretchedPos = vec3(
        localPos.x.mul(finalWidth),
        localPos.y.mul(finalHeight),
        localPos.z.mul(finalLength),
      );

      // ─── SCALE ──────────────────────────────────────
      const preloadScale = mix(float(1.0), float(1.08), preloadT).toConst("preloadScale");
      const flightScale = mix(
        float(1.0),
        float(0.97),
        smoothstep(float(0.34), float(0.82), burstParticleT),
      ).toConst("flightScale");
      const coreScaleJitter = mix(float(1.0), float(1.34), particleHash)
        .toConst("coreScaleJitter");
      const coreApexScaleMul = mix(float(1.0), float(0.76), coreApexT)
        .toConst("coreApexScaleMul");
      const fringeScaleJitter = mix(float(0.88), float(1.16), particleHash)
        .toConst("fringeScaleJitter");
      const lossScaleJitter = mix(float(0.70), float(0.98), particleHash)
        .toConst("lossScaleJitter");
      const coreVisibility = float(1)
        .sub(smoothstep(float(0.0), float(1.0), coreFrontPassT.mul(0.82)))
        .mul(coreOccupancyGate)
        .mul(float(1).sub(smoothstep(float(0.42), float(0.78), this.uniforms.quietChamber)))
        .toConst("coreVisibility");
      const fringeVisibility = float(1).sub(
        smoothstep(float(0.34), float(0.94), this.uniforms.quietChamber),
      )
        .mul(float(1).sub(fringeFrontFade.mul(0.78)))
        .mul(float(1).sub(smoothstep(float(0.12), float(0.40), this.uniforms.quietChamber)))
        .toConst("fringeVisibility");
      const lossVisibility = float(1)
        .sub(smoothstep(float(0.62), float(1.0), burstParticleT))
        .mul(float(1).sub(lossFrontFade))
        .mul(float(1).sub(smoothstep(float(0.04), float(0.24), this.uniforms.quietChamber)))
        .toConst("lossVisibility");
      const roleVisibility = coreRole.mul(coreVisibility)
        .add(fringeRole.mul(fringeVisibility.mul(fringeKeepMask)))
        .add(lossRole.mul(lossVisibility.mul(lossKeepMask)))
        .toConst("roleVisibility");
      const roleScale = coreRole.mul(float(0.40).mul(coreScaleJitter).mul(coreApexScaleMul))
        .add(fringeRole.mul(float(0.24).mul(fringeScaleJitter)))
        .add(lossRole.mul(float(0.10).mul(lossScaleJitter)))
        .toConst("roleScale");
      const nearScaleMul = coreRole.mul(coreNearScaleMul)
        .add(fringeRole.mul(fringeNearScaleMul))
        .add(lossRole.mul(lossNearScaleMul))
        .toConst("nearScaleMul");
      const hardClearGate = float(1)
        .sub(smoothstep(float(0.52), float(0.70), this.uniforms.quietChamber))
        .toConst("hardClearGate");
      const roleHardClear = coreRole.mul(float(1.0))
        .add(fringeRole.mul(hardClearGate))
        .add(lossRole.mul(hardClearGate))
        .toConst("roleHardClear");
      const quietFade = float(1).sub(
        smoothstep(float(0.34), float(0.96), this.uniforms.quietChamber),
      ).toConst("quietFade");
      const clearScale = mix(flightScale, roleScale, roleShapeT)
        .mul(roleVisibility)
        .mul(nearScaleMul)
        .mul(roleHardClear)
        .mul(quietFade)
        .toConst("clearScale");
      const renderScale = mix(preloadScale, clearScale, releaseT).toConst("renderScale");

      // ─── DIRECTION ──────────────────────────────────
      vBurstT.assign(burstParticleT);
      vFrontPassT.assign(coreFrontPassT);
      vFringeFrontFade.assign(fringeFrontFade);
      vLossFrontFade.assign(lossFrontFade);
      vCoreRole.assign(coreRole);
      vFringeRole.assign(fringeRole);
      vLossRole.assign(lossRole);
      vFringeKeep.assign(fringeKeepMask);
      vLossKeep.assign(lossKeepMask);

      const monumentDirection = normalize(mix(particleDirection.xyz, hashDir, float(0.08)));
      const flightDirection = normalize(mix(
        mix(
          particleDirection.xyz,
          monumentDirection,
          monumentMix.mul(0.55).add(preloadT.mul(0.25)).clamp(0, 1),
        ),
        burstDir,
        releaseT,
      )).toConst("flightDirection");
      const roleTravelDir = coreTravelDir.mul(coreRole)
        .add(fringeTravelDir.mul(fringeRole))
        .add(lossTravelDir.mul(lossRole))
        .toConst("roleTravelDir");
      const roleDirectionT = coreRole.mul(spearDriveT)
        .add(fringeRole.mul(fieldBuildT))
        .add(lossRole.mul(lossDriftT))
        .toConst("roleDirectionT");
      const renderDirection = normalize(
        mix(flightDirection, roleTravelDir, roleDirectionT),
      ).toConst("renderDirection");

      const mat = calcLookAtMatrix(renderDirection);
      vNormal.assign(transformNormalToView(mat.mul(normalLocal)));
      vAo.assign(particlePosition.z.div(64));
      vAo.assign(
        vAo
          .mul(vAo)
          .oneMinus()
          .add(monumentMix.mul(0.02)),
      );
      return mat
        .mul(stretchedPos.mul(this.uniforms.size.mul(1.08)))
        .mul(mix(particleDensity.mul(0.28).add(0.72).clamp(0, 1), float(0.975), monumentMix))
        .mul(renderScale)
        .add(renderPosition);
    })();
    const particleColor = particle.get("color");
    const particleHeat = particle.get("heat");
    const coal = vec3(0.012, 0.009, 0.008);
    const surfaceColor = particleColor.toConst("surfaceColor");
    const releasePulse = smoothstep(float(0.06), float(0.18), this.uniforms.collapseMix)
      .mul(float(1).sub(smoothstep(float(0.34), float(0.62), this.uniforms.collapseMix)))
      .toConst("releasePulse");
    const releaseHeat = releasePulse
      .mul(mix(float(0.55), float(1.0), smoothstep(float(0.0), float(0.28), vBurstT)))
      .mul(float(1).sub(smoothstep(float(0.58), float(0.96), vBurstT)))
      .clamp(0, 1)
      .toConst("releaseHeat");
    // Progressive thermal ramp: No pink. Dark matter ember -> Fire Gold -> Bright Gold
    const deepRed = vec3(0.10, 0.012, 0.0);
    const reignEmber = vec3(0.24, 0.035, 0.0);
    const flareRed = vec3(0.58, 0.11, 0.0);
    const fireGold = vec3(0.92, 0.42, 0.0);
    const hotWhite = vec3(1.0, 0.78, 0.24);
    const rc1 = mix(coal, deepRed, smoothstep(float(0.0), float(0.22), releaseHeat));
    const rc2 = mix(rc1, reignEmber, smoothstep(float(0.18), float(0.42), releaseHeat));
    const rc3 = mix(rc2, flareRed, smoothstep(float(0.38), float(0.62), releaseHeat));
    const rc4 = mix(rc3, fireGold, smoothstep(float(0.58), float(0.84), releaseHeat));
    // Debug visualization: only live heat debug remains.
    const debugHeatColor = vec3(particleHeat, particleHeat.mul(0.3), float(0));
    const dv = this.uniforms.debugVis;
    const debugMix = smoothstep(float(0.5), float(1.0), dv);
    const coolT = smoothstep(float(0.34), float(1.0), vBurstT).toConst("coolT");
    const coreVisibility = float(1)
      .sub(smoothstep(float(0.0), float(1.0), vFrontPassT.mul(0.82)))
      .mul(float(1).sub(smoothstep(float(0.42), float(0.78), this.uniforms.quietChamber)))
      .toConst("coreVisibility");
    const fringeVisibility = float(1).sub(
      smoothstep(float(0.34), float(0.94), this.uniforms.quietChamber),
    )
      .mul(float(1).sub(vFringeFrontFade.mul(0.78)))
      .mul(float(1).sub(smoothstep(float(0.12), float(0.40), this.uniforms.quietChamber)))
      .mul(vFringeKeep)
      .toConst("fringeVisibility");
    const lossVisibility = float(1)
      .sub(smoothstep(float(0.62), float(1.0), vBurstT))
      .mul(float(1).sub(vLossFrontFade))
      .mul(float(1).sub(smoothstep(float(0.04), float(0.24), this.uniforms.quietChamber)))
      .mul(vLossKeep)
      .toConst("lossVisibility");
    const coreApexEmissiveT = smoothstep(float(0.44), float(0.76), vBurstT)
      .mul(float(1).sub(smoothstep(float(0.80), float(0.96), vBurstT)))
      .toConst("coreApexEmissiveT");
    const coreHotLift = vCoreRole
      .mul(smoothstep(float(0.97), float(1.0), releaseHeat))
      .mul(coreVisibility)
      .mul(mix(float(0.16), float(0.08), coreApexEmissiveT))
      .toConst("coreHotLift");
    const releaseColor = mix(rc4, hotWhite, coreHotLift)
      .toConst("releaseColor");
    const fringeReleaseColor = mix(
      rc3,
      rc4,
      smoothstep(float(0.58), float(0.84), releaseHeat).mul(0.55),
    ).toConst("fringeReleaseColor");
    const coreCool = mix(reignEmber, deepRed, float(0.35)).toConst("coreCool");
    const fringeCool = mix(deepRed, coal, float(0.25)).toConst("fringeCool");
    const coreClearColor = mix(releaseColor, coreCool, coolT).toConst("coreClearColor");
    const fringeClearColor = mix(fringeReleaseColor, fringeCool, coolT).toConst("fringeClearColor");
    const lossClearColor = mix(
      deepRed,
      coal,
      smoothstep(float(0.12), float(0.72), vBurstT),
    ).toConst("lossClearColor");
    const roleClearColor = vCoreRole.mul(coreClearColor.mul(coreVisibility))
      .add(vFringeRole.mul(fringeClearColor.mul(fringeVisibility)))
      .add(vLossRole.mul(lossClearColor.mul(lossVisibility)))
      .toConst("roleClearColor");
    const collapsedColor = mix(
      surfaceColor,
      roleClearColor,
      smoothstep(float(0.04), float(0.18), this.uniforms.collapseMix),
    ).toConst("collapsedColor");
    this.material.colorNode = mix(collapsedColor, debugHeatColor, debugMix);
    const glowFactor = smoothstep(float(0.18), float(0.52), particleHeat);
    const ember = vec3(0.82, 0.12, 0.02);
    const emberLift = smoothstep(float(0.48), float(0.82), particleHeat).mul(0.06);
    const preCollapseFade = float(1).sub(
      smoothstep(float(0.0), float(0.05), this.uniforms.collapseMix)
    ).toConst("preCollapseFade");
    const normalEmissive = surfaceColor
      .mul(glowFactor)
      .mul(0.34)
      .add(ember.mul(emberLift))
      .mul(preCollapseFade);
    const releaseFlash = releasePulse
      .mul(float(1).sub(smoothstep(float(0.48), float(0.90), vBurstT)))
      .mul(0.50)
      .toConst("releaseFlash");
    const hardClearGate = float(1)
      .sub(smoothstep(float(0.52), float(0.70), this.uniforms.quietChamber))
      .toConst("hardClearGate");
    const roleEmissiveWeight = vCoreRole.mul(
      coreVisibility.mul(mix(float(0.68), float(0.40), coreApexEmissiveT)),
    )
      .add(vFringeRole.mul(fringeVisibility.mul(0.07).mul(hardClearGate)))
      .add(vLossRole.mul(lossVisibility.mul(0.01).mul(hardClearGate)))
      .toConst("roleEmissiveWeight");
    const releaseEmissive = releaseColor
      .mul(releaseFlash)
      .mul(roleEmissiveWeight)
      .toConst("releaseEmissive");
    const collapseFade = smoothstep(float(0.04), float(0.16), this.uniforms.collapseMix);
    const finalEmissive = mix(normalEmissive, releaseEmissive, collapseFade);
    this.material.emissiveNode = mix(finalEmissive, vec3(0), debugMix);
    const heatBloom = smoothstep(float(0.62), float(0.82), particleHeat);
    this._bloomIntensityNode = heatBloom.max(releaseFlash.mul(releaseHeat).mul(0.55));
    this.material.aoNode = vAo;

    this.object = new THREE.Mesh(this.geometry, this.material);
    this.object.onBeforeShadow = () => {
      this.geometry.setDrawRange(this.defaultIndexCount, Infinity);
    };
    this.object.onAfterShadow = () => {
      this.geometry.setDrawRange(0, this.defaultIndexCount);
    };

    this.object.frustumCulled = false;

    const s = 1 / 64;
    this.object.position.set(-32.0 * s * 1.6, -0.012, -0.12);
    this.object.rotation.x = 0.004;
    this.object.rotation.y = -0.04;
    this.object.rotation.z = -0.01;
    this.object.scale.set(s * 1.6, s * 0.88, s * 1.1);
    this.object.castShadow = true;
    this.object.receiveShadow = true;
  }

  worldPointToSimulation(worldPoint, target = new THREE.Vector3()) {
    this.object.updateWorldMatrix(true, false);
    target.copy(worldPoint);
    this.object.worldToLocal(target);
    // Lab shader has no SIM_RENDER_SCALE — identity (1,1,1)
    return target;
  }

  worldDirectionToSimulation(worldDirection, target = new THREE.Vector3()) {
    this.object.updateWorldMatrix(true, false);
    const worldQuaternion = this.object.getWorldQuaternion(
      new THREE.Quaternion(),
    );
    const worldScale = this.object.getWorldScale(new THREE.Vector3());
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

  setFreezeDescriptor(descriptor) {
    if (!descriptor) {
      this.freezeDescriptor = null;
      return;
    }

    this.freezeDescriptor = {
      center: descriptor.center.clone(),
      boundsMin: descriptor.boundsMin.clone(),
      boundsMax: descriptor.boundsMax.clone(),
    };
  }

  clearFreezeDescriptor() {
    this.freezeDescriptor = null;
  }

  update() {
    const { particles, bloom, actualSize } = conf;
    this.uniforms.size.value = actualSize;
    this.uniforms.quietChamber.value = conf.quietChamberMix || 0;
    this.uniforms.collapseMix.value = conf.collapseMix || 0;
    this.uniforms.convergenceFreeze.value = conf.convergenceFreeze || 0;

    const v = PREENTER_VESSEL;
    const src = PREENTER_SOURCE_ANCHOR.originLocal;
    const monumentCenter = new THREE.Vector3(
      v.centerX + src.x,
      v.centerY + src.y,
      v.centerZ + src.z,
    );
    const wallMin = new THREE.Vector3(
      v.centerX - v.apertureWidth / 2,
      v.centerY - v.apertureHeight / 2,
      v.centerZ,
    );
    const wallMax = new THREE.Vector3(
      v.centerX + v.apertureWidth / 2,
      v.centerY + v.apertureHeight / 2,
      v.centerZ + v.depth,
    );
    this.worldPointToSimulation(wallMin, this.uniforms.chamberMin.value);
    this.worldPointToSimulation(wallMax, this.uniforms.chamberMax.value);

    const fallbackCenter = this.worldPointToSimulation(
      monumentCenter,
      this.uniforms.freezeCenter.value,
    );
    const chamberSpan = this.uniforms.chamberMax.value
      .clone()
      .sub(this.uniforms.chamberMin.value);
    const fallbackExtents = new THREE.Vector3(
      chamberSpan.x * 0.14,
      chamberSpan.y * 0.22,
      chamberSpan.z * 0.08,
    );

    if (this.freezeDescriptor) {
      this.uniforms.freezeCenter.value.copy(this.freezeDescriptor.center);
      this.uniforms.freezeBoundsMin.value.copy(this.freezeDescriptor.boundsMin);
      this.uniforms.freezeBoundsMax.value.copy(this.freezeDescriptor.boundsMax);
    } else {
      this.uniforms.freezeCenter.value.copy(fallbackCenter);
      this.uniforms.freezeBoundsMin.value.copy(fallbackCenter).sub(fallbackExtents);
      this.uniforms.freezeBoundsMax.value.copy(fallbackCenter).add(fallbackExtents);
    }

    const debugMap = { heat: 1 };
    this.uniforms.debugVis.value = debugMap[conf.particleDebugMode] || 0;
    this.geometry.instanceCount = particles;

    if (bloom !== this.bloom) {
      this.bloom = bloom;
      if (bloom) {
        this.material.mrtNode = mrt({
          bloomIntensity: this._bloomIntensityNode,
        });
      } else {
        this.material.mrtNode = null;
      }
    }
  }
}
export default ParticleRenderer;
