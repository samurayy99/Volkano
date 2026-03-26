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
  //completely overengineered late night programming lol
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
    const vCompressionT = varying(float(0), "vCompressionT");
    const vBurstT = varying(float(0), "vBurstT");
    const vSurfaceHoldT = varying(float(0), "vSurfaceHoldT");
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

      const preloadT = smoothstep(float(0.0), float(0.08), cMix)
        .mul(float(1).sub(smoothstep(float(0.10), float(0.18), cMix)))
        .toConst("preloadT");
      const releaseT = smoothstep(float(0.08), float(0.24), cMix)
        .toConst("releaseT");

      // Distance-weighted stagger: outer particles release slightly earlier
      const distFromCenter = monumentPosition.sub(freezeCenter).length();
      const chamberDiag = cMax.sub(cMin).length();
      const normalizedDist = distFromCenter.div(chamberDiag.max(float(0.001)));
      const releaseStagger = particleHash.mul(0.14).add(normalizedDist.mul(0.06));
      const burstParticleT = releaseT.sub(releaseStagger)
        .div(float(1).sub(releaseStagger)).clamp(0, 1).toConst("burstParticleT");

      // ─── BURST DIRECTION (form memory blend) ─────────
      const hashX = fract(sin(instanceIndex.toFloat().mul(127.1)).mul(43758.5453)).mul(2.0).sub(1.0);
      const hashY = fract(sin(instanceIndex.toFloat().mul(269.5)).mul(18642.3721)).mul(2.0).sub(1.0);
      const hashZ = fract(sin(instanceIndex.toFloat().mul(419.2)).mul(29517.8134)).mul(2.0).sub(1.0);
      const hashDir = normalize(vec3(hashX, hashY, hashZ));

      // 65% radial outward + 35% particle freeze-direction (monument form memory)
      const radialDir = normalize(monumentPosition.sub(freezeCenter).add(hashDir.mul(0.001)));
      const formDir = particleDirection.xyz;
      const rawBurst = mix(radialDir, formDir, float(0.35)).add(hashDir.mul(0.12));
      const burstDir = normalize(rawBurst).toConst("burstDir");

      // ─── FREEZE-SPACE FACE CHOICE ───────────────────
      // Freeze-space chooses the chamber face; in-face placement is authored separately.
      const faceHash = fract(sin(instanceIndex.toFloat().mul(78.233)).mul(43758.5453));
      const uvA = fract(sin(instanceIndex.toFloat().mul(391.7)).mul(28461.6231));
      const uvB = fract(sin(instanceIndex.toFloat().mul(547.3)).mul(63517.1847));

      const spanX = cMax.x.sub(cMin.x);
      const spanY = cMax.y.sub(cMin.y);
      const spanZ = cMax.z.sub(cMin.z);
      const freezeSpan = freezeBoundsMax.sub(freezeBoundsMin);
      const freezeFrac = vec3(
        monumentPosition.x.sub(freezeBoundsMin.x).div(freezeSpan.x.max(float(0.001))),
        monumentPosition.y.sub(freezeBoundsMin.y).div(freezeSpan.y.max(float(0.001))),
        monumentPosition.z.sub(freezeBoundsMin.z).div(freezeSpan.z.max(float(0.001))),
      ).clamp(0, 1).toConst("freezeFrac");
      const freezeCentered = freezeFrac.mul(2.0).sub(1.0).toConst("freezeCentered");

      const xReach = freezeCentered.x.abs().toConst("xReach");
      const yReach = freezeCentered.y.abs().toConst("yReach");
      const negativeX = freezeCentered.x.negate().mul(0.5).add(0.5).toConst("negativeX");
      const positiveX = freezeCentered.x.mul(0.5).add(0.5).toConst("positiveX");
      const positiveY = freezeCentered.y.mul(0.5).add(0.5).toConst("positiveY");
      const negativeY = freezeCentered.y.negate().mul(0.5).add(0.5).toConst("negativeY");
      const xFamilyBoost = formDir.x.abs().mul(0.04).add(hashX.abs().mul(0.02)).toConst("xFamilyBoost");
      const yFamilyBoost = formDir.y.abs().mul(0.04).add(hashY.abs().mul(0.02)).toConst("yFamilyBoost");
      const faceBase = float(0.18);

      const leftWeight = faceBase
        .add(negativeX.mul(0.46))
        .add(xReach.mul(0.18))
        .add(xFamilyBoost)
        .toConst("leftWeight");
      const rightWeight = faceBase
        .add(positiveX.mul(0.46))
        .add(xReach.mul(0.18))
        .add(xFamilyBoost)
        .toConst("rightWeight");
      const ceilingWeight = faceBase
        .add(positiveY.mul(0.46))
        .add(yReach.mul(0.18))
        .add(yFamilyBoost)
        .toConst("ceilingWeight");
      const floorWeight = faceBase
        .add(negativeY.mul(0.46))
        .add(yReach.mul(0.18))
        .add(yFamilyBoost)
        .toConst("floorWeight");
      const weightTotal = leftWeight
        .add(rightWeight)
        .add(ceilingWeight)
        .add(floorWeight)
        .toConst("weightTotal");
      const cdfT1 = leftWeight.div(weightTotal).toConst("cdfT1");
      const cdfT2 = leftWeight.add(rightWeight).div(weightTotal).toConst("cdfT2");
      const cdfT3 = leftWeight.add(rightWeight).add(ceilingWeight).div(weightTotal).toConst("cdfT3");

      const isLeft = float(1).sub(step(cdfT1, faceHash)).toConst("isLeft");
      const isRight = step(cdfT1, faceHash)
        .mul(float(1).sub(step(cdfT2, faceHash)))
        .toConst("isRight");
      const isCeiling = step(cdfT2, faceHash)
        .mul(float(1).sub(step(cdfT3, faceHash)))
        .toConst("isCeiling");
      const isFloor = step(cdfT3, faceHash).toConst("isFloor");
      const sideChosen = isLeft.add(isRight).toConst("sideChosen");
      const topBottomChosen = isCeiling.add(isFloor).toConst("topBottomChosen");

      // ─── AUTHORED FACE DISTRIBUTION ─────────────────
      // Freeze-space only nudges the deposit inside a controlled chamber band.
      const sideYCenter = float(0.5);
      const sideYSpan = float(0.34);
      const sideZCenter = float(0.56);
      const sideZSpan = float(0.22);
      const topBottomXCenter = float(0.5);
      const topBottomXSpan = float(0.34);
      const topBottomZCenter = float(0.56);
      const topBottomZSpan = float(0.22);

      const freezeYDelta = freezeFrac.y.sub(0.5).mul(sideYSpan.mul(0.65)).toConst("freezeYDelta");
      const freezeXDelta = freezeFrac.x.sub(0.5).mul(topBottomXSpan.mul(0.65)).toConst("freezeXDelta");
      const sideFreezeZDelta = freezeFrac.z.sub(0.5).mul(sideZSpan.mul(0.55)).toConst("sideFreezeZDelta");
      const topFreezeZDelta = freezeFrac.z.sub(0.5).mul(topBottomZSpan.mul(0.55)).toConst("topFreezeZDelta");
      const scatterA = uvA.sub(0.5).mul(0.18).toConst("scatterA");
      const scatterB = uvB.sub(0.5).mul(0.16).toConst("scatterB");

      const sidePrimaryUv = sideYCenter
        .add(freezeYDelta)
        .add(scatterA)
        .clamp(0.18, 0.82)
        .toConst("sidePrimaryUv");
      const topPrimaryUv = topBottomXCenter
        .add(freezeXDelta)
        .add(scatterA)
        .clamp(0.18, 0.82)
        .toConst("topPrimaryUv");
      const sideDepthUv = sideZCenter
        .add(sideFreezeZDelta)
        .add(scatterB)
        .clamp(0.22, 0.84)
        .toConst("sideDepthUv");
      const topDepthUv = topBottomZCenter
        .add(topFreezeZDelta)
        .add(scatterB)
        .clamp(0.22, 0.84)
        .toConst("topDepthUv");
      const depthUv = sideChosen.mul(sideDepthUv).add(topBottomChosen.mul(topDepthUv)).toConst("depthUv");

      // Receive target: continuous position on assigned face
      const zMargin = spanZ.mul(0.08);
      const receiveZ = mix(cMin.z.add(zMargin), cMax.z.sub(zMargin), depthUv);
      const receiveX = isLeft.mul(cMin.x)
          .add(isRight.mul(cMax.x))
          .add(topBottomChosen.mul(mix(cMin.x, cMax.x, topPrimaryUv)));
      const receiveY = sideChosen.mul(mix(cMin.y, cMax.y, sidePrimaryUv))
          .add(isCeiling.mul(cMax.y))
          .add(isFloor.mul(cMin.y));
      const receiveTarget = vec3(receiveX, receiveY, receiveZ).toConst("receiveTarget");

      // Receive normal: outward from center toward wall surface
      const receiveNormal = vec3(
        isLeft.mul(-1).add(isRight),
        isCeiling.sub(isFloor),
        float(0),
      ).toConst("receiveNormal");
      const surfaceInset = this.uniforms.size.mul(2.4).toConst("surfaceInset");
      const receiveSurfaceTarget = receiveTarget
        .sub(receiveNormal.mul(surfaceInset))
        .toConst("receiveSurfaceTarget");

      // ─── THREE-PHASE POSITION ────────────────────────
      const chamberSpanY = cMax.y.sub(cMin.y);

      // Phase 1: Burst - outward expansion from monument
      const burstMagnitude = chamberDiag.mul(0.12);
      const burstEnvelope = smoothstep(float(0.0), float(0.15), burstParticleT)
        .mul(float(1).sub(smoothstep(float(0.25), float(0.40), burstParticleT)))
        .toConst("burstEnvelope");
      const burstOffset = burstDir.mul(burstMagnitude.mul(burstEnvelope));

      // Phase 2: Flight - arc toward receive target
      const flightT = smoothstep(float(0.15), float(0.65), burstParticleT).toConst("flightT");
      const arcHeight = chamberSpanY.mul(0.06).mul(sin(flightT.mul(3.14159)));
      const arcOffset = vec3(float(0), arcHeight, float(0));

      // Phase 3: Settle - final position at receive target, then a readable surface hold
      const settleT = smoothstep(float(0.55), float(1.0), burstParticleT).toConst("settleT");
      const surfaceHoldT = smoothstep(float(0.56), float(0.74), burstParticleT)
        .mul(float(1).sub(smoothstep(float(0.94), float(1.0), burstParticleT)))
        .toConst("surfaceHoldT");

      // Combined: burst base -> flight toward target -> settle at target
      const burstPos = monumentPosition.add(burstOffset);
      const flightPos = mix(burstPos, receiveSurfaceTarget, pow(flightT, float(0.6))).add(arcOffset);
      const renderPosition = mix(flightPos, receiveSurfaceTarget, settleT).toConst("renderPosition");

      // ─── VELOCITY STRETCH (flight streak + impact squash) ──
      const flightStretchT = smoothstep(float(0.1), float(0.25), burstParticleT)
        .mul(float(1).sub(smoothstep(float(0.5), float(0.7), burstParticleT)))
        .toConst("flightStretchT");
      const impactT = smoothstep(float(0.55), float(0.85), burstParticleT)
        .toConst("impactT");

      // Monument -> flight streak: thin + long along flight direction
      const flightWidth = mix(monumentWidth, float(0.5), flightStretchT);
      const flightHeight = mix(monumentHeight, float(0.5), flightStretchT);
      const flightLength = mix(monumentLength, float(2.5), flightStretchT);

      // Flight -> impact squash: short + wide on surface
      const postImpactWidth = mix(flightWidth, float(1.3), impactT);
      const postImpactHeight = mix(flightHeight, float(1.3), impactT);
      const postImpactLength = mix(flightLength, float(0.5), impactT);

      // Blend from monument to burst phases based on releaseT
      const finalWidth = mix(monumentWidth, postImpactWidth, releaseT).toConst("finalWidth");
      const finalHeight = mix(monumentHeight, postImpactHeight, releaseT).toConst("finalHeight");
      const finalLength = mix(monumentLength, postImpactLength, releaseT).toConst("finalLength");

      const stretchedPos = vec3(
        localPos.x.mul(finalWidth),
        localPos.y.mul(finalHeight),
        localPos.z.mul(finalLength),
      );

      // ─── SCALE ───────────────────────────────────────
      const preloadScale = mix(float(1.0), float(1.08), preloadT).toConst("preloadScale");
      const flightScale = mix(
        float(1.0),
        float(0.88),
        smoothstep(float(0.3), float(0.7), burstParticleT),
      ).toConst("flightScale");
      const settledScale = mix(flightScale, float(0.62), settleT).toConst("settledScale");
      const surfaceHoldScale = mix(settledScale, float(0.68), surfaceHoldT).toConst("surfaceHoldScale");
      const quietFadeT = smoothstep(float(0.32), float(1.0), this.uniforms.quietChamber)
        .toConst("quietFadeT");
      const quietScale = mix(
        surfaceHoldScale,
        float(0),
        quietFadeT,
      ).toConst("quietScale");
      const renderScale = mix(preloadScale, quietScale, releaseT).toConst("renderScale");

      // ─── DIRECTION ───────────────────────────────────
      vCompressionT.assign(preloadT);
      vBurstT.assign(burstParticleT);
      vSurfaceHoldT.assign(surfaceHoldT);

      const monumentDirection = normalize(mix(particleDirection.xyz, hashDir, float(0.08)));
      const burstActive = releaseT;

      // Monument -> flight direction -> settle toward receive normal
      const flightDirection = normalize(mix(
        mix(
          particleDirection.xyz,
          monumentDirection,
          monumentMix.mul(0.55).add(preloadT.mul(0.25)).clamp(0, 1),
        ),
        burstDir,
        burstActive,
      ));
      const renderDirection = normalize(
        mix(flightDirection, receiveNormal, settleT.mul(0.6)),
      );

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
    const releasePulse = smoothstep(float(0.05), float(0.12), this.uniforms.collapseMix)
      .mul(float(1).sub(smoothstep(float(0.18), float(0.32), this.uniforms.collapseMix)))
      .toConst("releasePulse");
    const releaseHeat = releasePulse
      .mul(mix(float(0.55), float(1.0), smoothstep(float(0.0), float(0.16), vBurstT)))
      .mul(float(1).sub(smoothstep(float(0.42), float(0.84), vBurstT)))
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
    const releaseColor = mix(rc4, hotWhite, smoothstep(float(0.90), float(0.985), releaseHeat))
      .toConst("releaseColor");
    // Debug visualization: only live heat debug remains.
    const debugHeatColor = vec3(particleHeat, particleHeat.mul(0.3), float(0));
    const dv = this.uniforms.debugVis;
    const debugMix = smoothstep(float(0.5), float(1.0), dv);
    const releaseSettle = smoothstep(float(0.42), float(0.96), vBurstT).toConst("releaseSettle");
    const surfaceResidue = mix(
      reignEmber,
      fireGold,
      vSurfaceHoldT.mul(0.38).add(float(0.18)).clamp(0, 1),
    ).toConst("surfaceResidue");
    const depositColor = mix(releaseColor, surfaceResidue, releaseSettle).toConst("depositColor");
    const collapsedColor = mix(
      surfaceColor,
      depositColor,
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
      .mul(float(1).sub(smoothstep(float(0.30), float(0.72), vBurstT)))
      .toConst("releaseFlash");
    const surfaceEmber = smoothstep(float(0.14), float(0.68), vBurstT)
      .mul(float(1).sub(smoothstep(float(0.88), float(1.0), vBurstT)))
      .mul(float(1).sub(this.uniforms.quietChamber.mul(0.55)))
      .toConst("surfaceEmber");
    const releaseEmissive = releaseColor
      .mul(releaseFlash.mul(0.95).add(surfaceEmber.mul(0.34)))
      .toConst("releaseEmissive");
    const collapseFade = smoothstep(float(0.04), float(0.16), this.uniforms.collapseMix);
    const finalEmissive = mix(normalEmissive, releaseEmissive, collapseFade);
    this.material.emissiveNode = mix(finalEmissive, vec3(0), debugMix);
    const heatBloom = smoothstep(float(0.62), float(0.82), particleHeat);
    this._bloomIntensityNode = heatBloom.max(releaseFlash.mul(releaseHeat).mul(1.2));
    this.material.aoNode = vAo;

    //this.material.fragmentNode = vec4(0,0,0,1);
    //this.material.envNode = vec3(0.5);

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
