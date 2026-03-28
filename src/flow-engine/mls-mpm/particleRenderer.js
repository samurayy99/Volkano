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
  freezeSnapshot = null;
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
    this.uniforms.quietChamber = uniform(0);
    this.uniforms.collapseMix = uniform(0);
    this.uniforms.convergenceFreeze = uniform(0);
    this.uniforms.debugVis = uniform(0);
    this.uniforms.freezeCenter = uniform(new THREE.Vector3());
    this.uniforms.freezeBoundsMin = uniform(new THREE.Vector3());
    this.uniforms.freezeBoundsMax = uniform(new THREE.Vector3());
    this.uniforms.chamberMin = uniform(new THREE.Vector3());
    this.uniforms.chamberMax = uniform(new THREE.Vector3());
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

      // ─── TIMING + SPATIAL EROSION ───────────────────
      const cMix = this.uniforms.collapseMix;
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

      const hashX = fract(
        sin(instanceIndex.toFloat().mul(127.1)).mul(43758.5453),
      )
        .mul(2.0)
        .sub(1.0);
      const hashY = fract(
        sin(instanceIndex.toFloat().mul(269.5)).mul(18642.3721),
      )
        .mul(2.0)
        .sub(1.0);
      const hashZ = fract(
        sin(instanceIndex.toFloat().mul(419.2)).mul(29517.8134),
      )
        .mul(2.0)
        .sub(1.0);
      const hashDir = normalize(vec3(hashX, hashY, hashZ)).toConst("hashDir");

      const spanX = cMax.x.sub(cMin.x);
      const spanY = cMax.y.sub(cMin.y);
      const spanZ = cMax.z.sub(cMin.z);
      const chamberDiag = cMax
        .sub(cMin)
        .length()
        .max(float(0.001))
        .toConst("chamberDiag");
      const chamberDepth = spanZ.max(float(0.001)).toConst("chamberDepth");
      const freezeSpan = freezeBoundsMax.sub(freezeBoundsMin).toConst("freezeSpan");
      const freezeHalfSpan = vec3(
        freezeSpan.x.mul(0.5).max(float(0.001)),
        freezeSpan.y.mul(0.5).max(float(0.001)),
        freezeSpan.z.mul(0.5).max(float(0.001)),
      ).toConst("freezeHalfSpan");
      const freezeLocal = vec3(
        monumentPosition.x.sub(freezeCenter.x).div(freezeHalfSpan.x),
        monumentPosition.y.sub(freezeCenter.y).div(freezeHalfSpan.y),
        monumentPosition.z.sub(freezeCenter.z).div(freezeHalfSpan.z),
      ).toConst("freezeLocal");
      const centerDistN = freezeLocal
        .length()
        .div(float(1.7320508))
        .clamp(0, 1)
        .toConst("centerDistN");
      const innerN = float(1).sub(centerDistN).toConst("innerN");
      const denseCoreT = float(1)
        .sub(smoothstep(float(0.18), float(0.42), centerDistN))
        .toConst("denseCoreT");
      const forwardPrivilege = smoothstep(float(0.22), float(0.88), innerN)
        .toConst("forwardPrivilege");
      const shellPrivilege = smoothstep(float(0.24), float(0.92), centerDistN)
        .toConst("shellPrivilege");
      const heroPrivilege = smoothstep(float(0.62), float(0.96), forwardPrivilege)
        .toConst("heroPrivilege");

      const clearForwardDir = vec3(0, 0, -1).toConst("clearForwardDir");
      const radialDir = normalize(
        monumentPosition.sub(freezeCenter).add(hashDir.mul(0.001)),
      ).toConst("radialDir");
      const chamberUp = vec3(0, 1, 0).toConst("chamberUp");
      const chamberRight = vec3(1, 0, 0).toConst("chamberRight");
      const tangentA = cross(radialDir, chamberUp).toConst("tangentA");
      const tangentB = cross(radialDir, chamberRight).toConst("tangentB");
      const tangentDir = normalize(
        mix(tangentB, tangentA, step(float(0.001), tangentA.length())).add(
          hashDir.mul(0.001),
        ),
      ).toConst("tangentDir");
      const peelDir = normalize(
        mix(radialDir, tangentDir, float(0.34)).add(hashDir.mul(0.03)),
      ).toConst("peelDir");

      const erosionWaveT = smoothstep(float(0.16), float(0.84), cMix).toConst(
        "erosionWaveT",
      );
      const releaseFront = erosionWaveT
        .sub(float(1).sub(centerDistN))
        .toConst("releaseFront");
      const particleReleaseT = smoothstep(
        float(-0.04),
        float(0.14),
        releaseFront,
      ).toConst("particleReleaseT");
      const heroPassT = smoothstep(float(0.68), float(0.94), cMix)
        .mul(denseCoreT)
        .toConst("heroPassT");
      const survivalEnd = mix(float(0.28), float(1.10), denseCoreT).toConst(
        "survivalEnd",
      );
      const particleAliveT = float(1)
        .sub(smoothstep(float(0.10), survivalEnd, releaseFront))
        .toConst("particleAliveT");

      const peelDistance = chamberDiag
        .mul(mix(float(0.03), float(0.16), shellPrivilege))
        .mul(particleReleaseT)
        .mul(smoothstep(float(0.14), float(0.36), cMix))
        .mul(float(1).sub(denseCoreT.mul(0.65)))
        .toConst("peelDistance");
      const lateralDistance = spanX
        .mul(0.05)
        .mul(shellPrivilege)
        .mul(particleReleaseT)
        .mul(float(1).sub(denseCoreT.mul(0.75)))
        .mul(hashY)
        .toConst("lateralDistance");
      const verticalDistance = spanY
        .mul(0.03)
        .mul(shellPrivilege)
        .mul(particleReleaseT)
        .mul(float(1).sub(denseCoreT.mul(0.75)))
        .mul(hashX)
        .toConst("verticalDistance");
      const baseForwardDistance = chamberDepth
        .mul(mix(float(0.04), float(0.52), forwardPrivilege))
        .mul(particleReleaseT)
        .toConst("baseForwardDistance");
      const heroForwardDistance = chamberDepth
        .mul(1.48)
        .mul(heroPassT)
        .toConst("heroForwardDistance");
      const forwardDistance = baseForwardDistance
        .add(heroForwardDistance)
        .toConst("forwardDistance");

      const renderPosition = monumentPosition
        .add(peelDir.mul(peelDistance))
        .add(tangentDir.mul(lateralDistance))
        .add(chamberUp.mul(verticalDistance))
        .add(clearForwardDir.mul(forwardDistance))
        .toConst("renderPosition");
      const frontTravel = cMin.z
        .sub(renderPosition.z)
        .max(float(0))
        .toConst("frontTravel");
      const nearZoneT = smoothstep(
        chamberDepth.mul(0.18),
        chamberDepth.mul(0.92),
        frontTravel,
      ).toConst("nearZoneT");
      const frontSurvival = mix(float(1).sub(nearZoneT), float(1), heroPrivilege)
        .toConst("frontSurvival");
      const quietFade = float(1)
        .sub(smoothstep(float(0.28), float(0.88), this.uniforms.quietChamber))
        .toConst("quietFade");
      const visibilityT = particleAliveT
        .mul(frontSurvival)
        .toConst("visibilityT");

      const erodedWidthTarget = mix(float(0.12), float(0.24), forwardPrivilege)
        .toConst("erodedWidthTarget");
      const erodedHeightTarget = mix(float(0.12), float(0.24), forwardPrivilege)
        .toConst("erodedHeightTarget");
      const erodedLengthTarget = mix(float(0.18), float(0.74), forwardPrivilege)
        .toConst("erodedLengthTarget");
      const clearWidth = mix(monumentWidth, erodedWidthTarget, particleReleaseT)
        .toConst("clearWidth");
      const clearHeight = mix(monumentHeight, erodedHeightTarget, particleReleaseT)
        .toConst("clearHeight");
      const clearLength = mix(monumentLength, erodedLengthTarget, particleReleaseT)
        .toConst("clearLength");
      const nearWidthMul = mix(
        float(1.0),
        mix(float(0.02), float(0.06), heroPrivilege),
        nearZoneT,
      ).toConst("nearWidthMul");
      const nearHeightMul = mix(
        float(1.0),
        mix(float(0.02), float(0.06), heroPrivilege),
        nearZoneT,
      ).toConst("nearHeightMul");
      const nearLengthMul = mix(
        float(1.0),
        mix(float(0.28), float(0.86), heroPrivilege),
        nearZoneT,
      ).toConst("nearLengthMul");
      const finalWidth = clearWidth
        .mul(nearWidthMul)
        .toConst("finalWidth");
      const finalHeight = clearHeight
        .mul(nearHeightMul)
        .toConst("finalHeight");
      const finalLength = clearLength
        .mul(nearLengthMul)
        .toConst("finalLength");

      const stretchedPos = vec3(
        localPos.x.mul(finalWidth),
        localPos.y.mul(finalHeight),
        localPos.z.mul(finalLength),
      );

      // ─── SCALE ──────────────────────────────────────
      const preloadScale = mix(float(1.0), float(1.08), preloadT).toConst(
        "preloadScale",
      );
      const releaseScaleTarget = mix(float(0.12), float(0.36), denseCoreT)
        .toConst("releaseScaleTarget");
      const clearScale = mix(float(1.0), releaseScaleTarget, particleReleaseT)
        .mul(visibilityT)
        .toConst("clearScale");
      const renderScale = mix(preloadScale, clearScale, particleReleaseT)
        .mul(quietFade)
        .toConst("renderScale");

      // ─── DIRECTION ──────────────────────────────────
      const travelBlendT = mix(float(0.20), float(0.96), forwardPrivilege)
        .toConst("travelBlendT");
      const travelDirection = normalize(
        mix(peelDir, clearForwardDir, travelBlendT)
          .add(hashDir.mul(float(0.01)).mul(float(1).sub(heroPrivilege))),
      ).toConst("travelDirection");
      const renderDirection = normalize(
        mix(particleDirection.xyz, travelDirection, particleReleaseT),
      ).toConst("renderDirection");

      const mat = calcLookAtMatrix(renderDirection);
      vAo.assign(particlePosition.z.div(64));
      vAo.assign(vAo.mul(vAo).oneMinus().add(monumentMix.mul(0.02)));
      return mat
        .mul(stretchedPos.mul(this.uniforms.size.mul(1.08)))
        .mul(
          mix(
            particleDensity.mul(0.28).add(0.72).clamp(0, 1),
            float(0.975),
            monumentMix,
          ),
        )
        .mul(renderScale)
        .add(renderPosition);
    })();
    const particleColor = particle.get("color");
    const particleHeat = particle.get("heat");
    const coal = vec3(0.012, 0.009, 0.008);
    const surfaceColor = particleColor.toConst("surfaceColor");
    const colorPosition = particle.get("position").xyz.toConst("colorPosition");
    const colorFreezeSpan = this.uniforms.freezeBoundsMax
      .sub(this.uniforms.freezeBoundsMin)
      .toConst("colorFreezeSpan");
    const colorFreezeHalfSpan = vec3(
      colorFreezeSpan.x.mul(0.5).max(float(0.001)),
      colorFreezeSpan.y.mul(0.5).max(float(0.001)),
      colorFreezeSpan.z.mul(0.5).max(float(0.001)),
    ).toConst("colorFreezeHalfSpan");
    const colorFreezeLocal = vec3(
      colorPosition.x
        .sub(this.uniforms.freezeCenter.x)
        .div(colorFreezeHalfSpan.x),
      colorPosition.y
        .sub(this.uniforms.freezeCenter.y)
        .div(colorFreezeHalfSpan.y),
      colorPosition.z
        .sub(this.uniforms.freezeCenter.z)
        .div(colorFreezeHalfSpan.z),
    ).toConst("colorFreezeLocal");
    const colorCenterDistN = colorFreezeLocal
      .length()
      .div(float(1.7320508))
      .clamp(0, 1)
      .toConst("colorCenterDistN");
    const colorDenseCoreT = float(1)
      .sub(smoothstep(float(0.18), float(0.42), colorCenterDistN))
      .toConst("colorDenseCoreT");
    const colorErosionWaveT = smoothstep(
      float(0.16),
      float(0.84),
      this.uniforms.collapseMix,
    ).toConst("colorErosionWaveT");
    const colorReleaseFront = colorErosionWaveT
      .sub(float(1).sub(colorCenterDistN))
      .toConst("colorReleaseFront");
    const colorParticleReleaseT = smoothstep(
      float(-0.04),
      float(0.14),
      colorReleaseFront,
    ).toConst("colorParticleReleaseT");
    const colorSurvivalEnd = mix(
      float(0.28),
      float(1.10),
      colorDenseCoreT,
    ).toConst("colorSurvivalEnd");
    const colorAliveT = float(1)
      .sub(smoothstep(float(0.10), colorSurvivalEnd, colorReleaseFront))
      .toConst("colorAliveT");
    const quietFadeColor = float(1)
      .sub(smoothstep(float(0.28), float(0.88), this.uniforms.quietChamber))
      .toConst("quietFadeColor");
    const colorVisibilityT = colorAliveT
      .mul(quietFadeColor)
      .toConst("colorVisibilityT");
    const collapseFade = smoothstep(
      float(0.04),
      float(0.16),
      this.uniforms.collapseMix,
    ).toConst("collapseFade");
    const heroHeatT = smoothstep(
      float(0.68),
      float(0.94),
      this.uniforms.collapseMix,
    )
      .mul(colorDenseCoreT)
      .mul(colorVisibilityT)
      .toConst("heroHeatT");

    const deepRed = vec3(0.1, 0.012, 0.0);
    const reignEmber = vec3(0.24, 0.035, 0.0);
    const fireGold = vec3(0.92, 0.42, 0.0);
    const debugHeatColor = vec3(particleHeat, particleHeat.mul(0.3), float(0));
    const dv = this.uniforms.debugVis;
    const debugMix = smoothstep(float(0.5), float(1.0), dv);
    const cooledSurface = mix(
      surfaceColor,
      deepRed,
      smoothstep(float(0.04), float(0.34), this.uniforms.collapseMix),
    ).toConst("cooledSurface");
    const shellAshT = smoothstep(float(0.10), float(0.54), colorReleaseFront)
      .mul(colorCenterDistN)
      .toConst("shellAshT");
    const shellColor = mix(cooledSurface, coal, shellAshT).toConst("shellColor");
    const remnantColor = mix(
      reignEmber,
      fireGold,
      smoothstep(float(0.74), float(0.96), this.uniforms.collapseMix),
    ).toConst("remnantColor");
    const collapsedColor = mix(
      surfaceColor,
      mix(
        shellColor,
        remnantColor,
        colorDenseCoreT.mul(
          smoothstep(float(0.52), float(0.90), this.uniforms.collapseMix),
        ),
      ).mul(mix(float(0.24), float(1.0), colorVisibilityT)),
      collapseFade,
    ).toConst("collapsedColor");
    this.material.colorNode = mix(collapsedColor, debugHeatColor, debugMix);
    const glowFactor = smoothstep(float(0.18), float(0.52), particleHeat);
    const ember = vec3(0.82, 0.12, 0.02);
    const emberLift = smoothstep(float(0.48), float(0.82), particleHeat).mul(
      0.06,
    );
    const preCollapseFade = float(1)
      .sub(smoothstep(float(0.0), float(0.05), this.uniforms.collapseMix))
      .toConst("preCollapseFade");
    const normalEmissive = surfaceColor
      .mul(glowFactor)
      .mul(0.34)
      .add(ember.mul(emberLift))
      .mul(preCollapseFade);
    const collapseEmissive = reignEmber
      .mul(heroHeatT.mul(0.08))
      .toConst("collapseEmissive");
    const finalEmissive = mix(
      normalEmissive,
      collapseEmissive,
      smoothstep(float(0.32), float(0.78), this.uniforms.collapseMix),
    );
    this.material.emissiveNode = mix(finalEmissive, vec3(0), debugMix);
    const heatBloom = smoothstep(float(0.62), float(0.82), particleHeat);
    this._bloomIntensityNode = heatBloom.max(heroHeatT.mul(0.04));
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

  setFreezeSnapshot(snapshot) {
    if (!snapshot) {
      this.freezeSnapshot = null;
      return;
    }

    this.freezeSnapshot = {
      center: snapshot.center.clone(),
      boundsMin: snapshot.boundsMin.clone(),
      boundsMax: snapshot.boundsMax.clone(),
    };
  }

  clearFreezeSnapshot() {
    this.freezeSnapshot = null;
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

    if (this.freezeSnapshot) {
      this.uniforms.freezeCenter.value.copy(this.freezeSnapshot.center);
      this.uniforms.freezeBoundsMin.value.copy(this.freezeSnapshot.boundsMin);
      this.uniforms.freezeBoundsMax.value.copy(this.freezeSnapshot.boundsMax);
    } else {
      this.uniforms.freezeCenter.value.copy(fallbackCenter);
      this.uniforms.freezeBoundsMin.value
        .copy(fallbackCenter)
        .sub(fallbackExtents);
      this.uniforms.freezeBoundsMax.value
        .copy(fallbackCenter)
        .add(fallbackExtents);
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
