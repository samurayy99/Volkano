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
    const roundedBoxGeometry = createRoundedBox(0.7, 0.7, 3, 0.1);

    this.defaultIndexCount = roundedBoxGeometry.index.count;
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
    this.uniforms.convergenceFreeze = uniform(0);
    this.uniforms.convergenceShapeMix = uniform(0);
    this.uniforms.postFreezeLock = uniform(0);
    this.uniforms.postFreezeClearProgress = uniform(0);
    this.uniforms.debugVis = uniform(0);
    this.uniforms.freezeCenter = uniform(new THREE.Vector3());
    this.uniforms.freezeBoundsMin = uniform(new THREE.Vector3());
    this.uniforms.freezeBoundsMax = uniform(new THREE.Vector3());
    this.uniforms.chamberMin = uniform(new THREE.Vector3());
    this.uniforms.chamberMax = uniform(new THREE.Vector3());
    this._chamberMin = new THREE.Vector3();
    this._chamberMax = new THREE.Vector3();

    const particle = this.mlsMpmSim.particleBuffer.element(instanceIndex);

    this.material.positionNode = Fn(() => {
      const particlePosition = particle.get("position");
      const particleDensity = particle.get("density");
      const particleDirection = particle.get("direction");
      const localPos = attribute("position").xyz;
      const particleVelocity = particle.get("velocity");
      const speed = particleVelocity.length();

      const stretchT = smoothstep(float(1.2), float(3.5), speed);
      const stretch = stretchT.mul(1.2).add(1.0);
      const thinning = pow(stretch, -0.4);
      const crustCompression =
        this.uniforms.convergenceShapeMix.toConst("crustCompression");

      const monumentWidth = mix(
        thinning,
        float(1.04),
        crustCompression,
      ).toConst("monumentWidth");
      const monumentHeight = mix(
        thinning,
        float(1.89),
        crustCompression,
      ).toConst("monumentHeight");
      const monumentLength = mix(
        stretch,
        float(0.23),
        crustCompression,
      ).toConst("monumentLength");

      const monumentMix = this.uniforms.convergenceFreeze.toConst("monumentMix");
      const postFreezeLock =
        this.uniforms.postFreezeLock.toConst("postFreezeLock");
      const clearProgress = this.uniforms.postFreezeClearProgress
        .clamp(0, 1)
        .toConst("clearProgress");
      const freezeCenter = this.uniforms.freezeCenter;
      const freezeBoundsMin = this.uniforms.freezeBoundsMin;
      const freezeBoundsMax = this.uniforms.freezeBoundsMax;
      const cMin = this.uniforms.chamberMin;
      const cMax = this.uniforms.chamberMax;

      const basePosition = particlePosition.xyz.toConst("basePosition");
      const monumentPosition = basePosition.toConst("monumentPosition");

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
      const freezeSpan = freezeBoundsMax
        .sub(freezeBoundsMin)
        .toConst("freezeSpan");
      const freezeDiag = freezeSpan
        .length()
        .max(float(0.001))
        .toConst("freezeDiag");
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
      const frontReadT = freezeLocal.z
        .negate()
        .mul(0.5)
        .add(0.5)
        .clamp(0, 1)
        .toConst("frontReadT");
      const denseCoreT = float(1)
        .sub(smoothstep(float(0.18), float(0.42), centerDistN))
        .toConst("denseCoreT");
      const shellPrivilege = smoothstep(float(0.24), float(0.92), centerDistN)
        .toConst("shellPrivilege");
      const motionHash = hashX.mul(0.5).add(0.5).toConst("motionHash");
      const startOffset = shellPrivilege
        .mul(0.16)
        .add(frontReadT.mul(0.1))
        .add(motionHash.mul(0.05))
        .toConst("startOffset");
      const launchT = smoothstep(
        startOffset,
        startOffset.add(float(0.2)),
        clearProgress,
      )
        .mul(postFreezeLock)
        .toConst("launchT");
      const crossT = smoothstep(
        startOffset.add(float(0.08)),
        startOffset.add(float(0.42)),
        clearProgress,
      )
        .mul(postFreezeLock)
        .toConst("crossT");
      const leaveT = smoothstep(
        startOffset.add(float(0.34)),
        startOffset.add(float(0.7)),
        clearProgress,
      )
        .mul(postFreezeLock)
        .toConst("leaveT");
      const lateDeathT = smoothstep(
        startOffset.add(float(0.52)),
        startOffset.add(float(0.86)),
        clearProgress,
      )
        .mul(postFreezeLock)
        .toConst("lateDeathT");

      const clearForwardDir = vec3(0, 0, -1).toConst("clearForwardDir");
      const radialFromCenter = monumentPosition
        .sub(freezeCenter)
        .toConst("radialFromCenter");
      const radialDir = normalize(radialFromCenter.add(hashDir.mul(0.001))).toConst(
        "radialDir",
      );
      const chamberUp = vec3(0, 1, 0).toConst("chamberUp");
      const surfaceNormal = normalize(freezeLocal.add(hashDir.mul(0.001))).toConst(
        "surfaceNormal",
      );
      const facetDirection = normalize(
        surfaceNormal
          .mul(0.45)
          .add(radialDir.mul(0.48))
          .add(hashDir.mul(0.09)),
      ).toConst("facetDirection");
      const isRockT = crustCompression.toConst("isRockT");
      const clearStretch = mix(float(1), float(1.22), launchT)
        .mul(mix(float(1), float(1.08), crossT))
        .toConst("clearStretch");
      const clearThin = pow(clearStretch, float(-0.32)).toConst("clearThin");
      const sculptedWidth = monumentWidth.mul(clearThin).toConst("sculptedWidth");
      const sculptedHeight = monumentHeight.mul(clearThin).toConst(
        "sculptedHeight",
      );
      const sculptedLength = monumentLength.mul(clearStretch).toConst(
        "sculptedLength",
      );
      const stretchedPos = vec3(
        localPos.x.mul(sculptedWidth),
        localPos.y.mul(sculptedHeight),
        localPos.z.mul(sculptedLength),
      );

      const monumentDirection = normalize(
        mix(radialDir, facetDirection, shellPrivilege.mul(0.14).add(0.86))
          .add(radialDir.mul(denseCoreT.mul(0.16)))
          .add(hashDir.mul(0.006)),
      ).toConst("monumentDirection");

      const frontPlaneZ = cMin.z.toConst("frontPlaneZ");
      const frontBandDepth = chamberDepth
        .mul(0.14)
        .max(float(0.045))
        .toConst("frontBandDepth");
      const earlyFlightDir = normalize(
        radialDir
          .mul(float(0.18))
          .add(chamberUp.mul(freezeLocal.y.mul(0.04)))
          .add(clearForwardDir.mul(float(0.82)))
          .add(hashDir.mul(0.04)),
      ).toConst("earlyFlightDir");
      const lateFlightDir = normalize(
        clearForwardDir
          .mul(float(1.0))
          .add(vec3(hashX.mul(0.018), freezeLocal.y.mul(0.012), float(0))),
      ).toConst("lateFlightDir");
      const flightDirection = normalize(
        mix(earlyFlightDir, lateFlightDir, leaveT),
      ).toConst("flightDirection");

      const launchDistance = chamberDiag
        .mul(mix(float(0.06), float(0.12), shellPrivilege))
        .toConst("launchDistance");
      const earlyLateralOffset = vec3(
        radialDir.x.mul(freezeDiag.mul(0.12)).add(hashX.mul(freezeDiag.mul(0.018))),
        radialDir.y.mul(freezeDiag.mul(0.09)).add(hashY.mul(freezeDiag.mul(0.014))),
        float(0),
      ).toConst("earlyLateralOffset");
      const launchOffsetPosition = monumentPosition
        .add(earlyLateralOffset)
        .add(earlyFlightDir.mul(launchDistance))
        .toConst("launchOffsetPosition");
      const releasedPosition = mix(
        monumentPosition,
        launchOffsetPosition,
        launchT,
      ).toConst("releasedPosition");
      const distanceFromReleasedToFront = releasedPosition.z
        .sub(frontPlaneZ)
        .max(frontBandDepth.mul(0.45))
        .toConst("distanceFromReleasedToFront");
      const crossDistance = distanceFromReleasedToFront
        .add(frontBandDepth.mul(mix(float(0.75), float(1.1), shellPrivilege)))
        .add(freezeDiag.mul(0.06))
        .toConst("crossDistance");
      const leaveExtraDistance = chamberDepth
        .mul(mix(float(0.42), float(0.64), shellPrivilege))
        .add(float(0.38))
        .toConst("leaveExtraDistance");

      const launchLateralMemory = vec3(
        earlyLateralOffset.x,
        earlyLateralOffset.y,
        float(0),
      ).toConst("launchLateralMemory");
      const lateralDecayX = launchT
        .mul(mix(float(0.32), float(0.1), crossT))
        .mul(mix(float(1.0), float(0.06), leaveT))
        .toConst("lateralDecayX");
      const lateralDecayY = launchT
        .mul(mix(float(0.28), float(0.09), crossT))
        .mul(mix(float(1.0), float(0.05), leaveT))
        .toConst("lateralDecayY");
      const decayedLaunchLateralMemory = vec3(
        launchLateralMemory.x.mul(lateralDecayX),
        launchLateralMemory.y.mul(lateralDecayY),
        float(0),
      ).toConst("decayedLaunchLateralMemory");
      const tinyLateNoise = vec3(
        hashX.mul(0.006),
        hashY.mul(0.004).add(freezeLocal.y.mul(0.003)),
        hashZ.mul(0.003),
      )
        .mul(freezeDiag)
        .mul(crossT)
        .mul(float(1).sub(leaveT.mul(0.82)).clamp(0, 1))
        .toConst("tinyLateNoise");
      const forwardTransportDistance = crossDistance
        .mul(crossT)
        .add(leaveExtraDistance.mul(leaveT))
        .toConst("forwardTransportDistance");
      const forwardAdvance = flightDirection
        .mul(forwardTransportDistance)
        .toConst("forwardAdvance");
      const renderPosition = releasedPosition
        .add(decayedLaunchLateralMemory)
        .add(forwardAdvance)
        .add(tinyLateNoise)
        .toConst("renderPosition");
      const crossedFrontT = float(1)
        .sub(
          smoothstep(
            frontPlaneZ,
            frontPlaneZ.add(frontBandDepth.mul(0.35)),
            renderPosition.z,
          ),
        )
        .toConst("crossedFrontT");
      const deathScale = mix(float(1.0), float(0.04), lateDeathT.mul(crossedFrontT))
        .toConst("deathScale");
      const formedDirection = normalize(
        mix(
          mix(particleDirection.xyz, monumentDirection, isRockT),
          flightDirection,
          crossT.add(leaveT.mul(0.22)).clamp(0, 1),
        ),
      ).toConst("formedDirection");

      const mat = calcLookAtMatrix(formedDirection);
      vAo.assign(
        mix(float(0.92), float(0.6), centerDistN)
          .add(denseCoreT.mul(0.06))
          .clamp(0.5, 1.0),
      );
      return mat
        .mul(stretchedPos.mul(this.uniforms.size.mul(1.08)))
        .mul(
          mix(
            particleDensity.mul(0.28).add(0.72).clamp(0, 1),
            float(0.975),
            isRockT,
          ),
        )
        .mul(deathScale)
        .add(renderPosition);
    })();

    const particleColor = particle.get("color");
    const particleHeat = particle.get("heat");
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
    const colorShellPrivilege = smoothstep(
      float(0.24),
      float(0.92),
      colorCenterDistN,
    ).toConst("colorShellPrivilege");

    const frontReadT = colorFreezeLocal.z
      .negate()
      .mul(0.5)
      .add(0.5)
      .clamp(0, 1)
      .toConst("frontReadT");
    const viewNormal = normalize(transformNormalToView(normalLocal)).toConst(
      "viewNormal",
    );
    const viewFacingT = pow(viewNormal.z.mul(viewNormal.z), float(0.5))
      .clamp(0, 1)
      .toConst("viewFacingT");
    const readFocusT = mix(frontReadT, viewFacingT, float(0.68)).toConst(
      "readFocusT",
    );

    const debugHeatColor = vec3(particleHeat, particleHeat.mul(0.3), float(0));
    const dv = this.uniforms.debugVis;
    const debugMix = smoothstep(float(0.5), float(1.0), dv);
    const frozenMaterialT =
      this.uniforms.convergenceFreeze.toConst("frozenMaterialT");
    const shapeSupportT =
      this.uniforms.convergenceShapeMix.toConst("shapeSupportT");
    const clearMaterialProgress = this.uniforms.postFreezeClearProgress
      .clamp(0, 1)
      .toConst("clearMaterialProgress");
    const materialMotionHash = fract(
      sin(instanceIndex.toFloat().mul(127.1)).mul(43758.5453),
    ).toConst("materialMotionHash");
    const materialStartOffset = colorShellPrivilege
      .mul(0.16)
      .add(frontReadT.mul(0.1))
      .add(materialMotionHash.mul(0.05))
      .toConst("materialStartOffset");
    const materialLaunchT = smoothstep(
      materialStartOffset,
      materialStartOffset.add(float(0.2)),
      clearMaterialProgress,
    ).toConst("materialLaunchT");
    const materialCrossT = smoothstep(
      materialStartOffset.add(float(0.08)),
      materialStartOffset.add(float(0.42)),
      clearMaterialProgress,
    ).toConst("materialCrossT");
    const materialLeaveT = smoothstep(
      materialStartOffset.add(float(0.34)),
      materialStartOffset.add(float(0.7)),
      clearMaterialProgress,
    ).toConst("materialLeaveT");
    const frozenShapeT = frozenMaterialT
      .mul(mix(float(0.72), float(1.0), shapeSupportT))
      .toConst("frozenShapeT");
    const materialHoldT = frozenShapeT
      .mul(float(1).sub(materialCrossT))
      .mul(mix(float(1.0), float(0.92), materialLaunchT))
      .toConst("materialHoldT");
    const materialFamilyT = materialHoldT
      .mul(materialHoldT.mul(float(3).sub(materialHoldT.mul(2))))
      .toConst("materialFamilyT");
    const postFreezeMaterialLock =
      this.uniforms.postFreezeLock.toConst("postFreezeMaterialLock");
    const holdAutonomyT = smoothstep(
      float(0.56),
      float(0.82),
      materialFamilyT,
    )
      .mul(postFreezeMaterialLock)
      .mul(float(1).sub(materialCrossT.mul(0.78)))
      .toConst("holdAutonomyT");
    const colorCoreT = float(1)
      .sub(smoothstep(float(0.16), float(0.46), colorCenterDistN))
      .toConst("colorCoreT");
    const shellHoldT = colorShellPrivilege
      .mul(materialFamilyT)
      .toConst("shellHoldT");
    const innerBodyT = colorCoreT
      .mul(pow(float(1).sub(colorShellPrivilege), float(0.58)))
      .mul(mix(float(0.88), float(1.0), readFocusT.mul(0.24)))
      .mul(materialFamilyT)
      .toConst("innerBodyT");
    const emberPocketT = colorCoreT
      .mul(colorCoreT)
      .mul(float(1).sub(colorShellPrivilege.mul(0.72)))
      .mul(mix(float(0.72), float(1.0), readFocusT.mul(0.28)))
      .mul(materialFamilyT)
      .toConst("emberPocketT");
    const coalShell = vec3(0.016, 0.011, 0.011);
    const shellPressureTint = vec3(0.078, 0.016, 0.013);
    const pressureRed = vec3(0.108, 0.016, 0.007);
    const emberPocketColor = vec3(0.13, 0.02, 0.005);
    const heldShellColor = mix(
      shellPressureTint,
      coalShell,
      colorShellPrivilege.mul(0.26).add(shellHoldT.mul(0.46)).clamp(0, 1),
    ).toConst("heldShellColor");
    const shellSurface = mix(surfaceColor, heldShellColor, shellHoldT).toConst(
      "shellSurface",
    );
    const pressureBodyColor = mix(
      shellSurface,
      pressureRed,
      innerBodyT,
    ).toConst("pressureBodyColor");
    const pressureFamilyColor = mix(
      pressureBodyColor,
      emberPocketColor,
      emberPocketT.mul(0.16),
    )
      .toConst("pressureFamilyColor");
    const midBodyT = colorCoreT
      .mul(pow(float(1).sub(colorShellPrivilege), float(0.42)))
      .mul(mix(float(0.9), float(1.0), readFocusT.mul(0.18)))
      .mul(materialFamilyT)
      .toConst("midBodyT");
    const corePocketT = colorCoreT
      .mul(colorCoreT)
      .mul(float(1).sub(colorShellPrivilege.mul(0.82)))
      .mul(mix(float(0.8), float(1.0), readFocusT.mul(0.22)))
      .mul(materialFamilyT)
      .toConst("corePocketT");
    const holdShellAutonomousColor = mix(
      shellPressureTint,
      coalShell,
      colorShellPrivilege.mul(0.34).add(shellHoldT.mul(0.52)).clamp(0, 1),
    ).toConst("holdShellAutonomousColor");
    const holdBodyAutonomousColor = mix(
      holdShellAutonomousColor,
      pressureRed,
      midBodyT,
    ).toConst("holdBodyAutonomousColor");
    const autonomousHoldColor = mix(
      holdBodyAutonomousColor,
      emberPocketColor,
      corePocketT.mul(0.18),
    ).toConst("autonomousHoldColor");
    const finalPressureColor = mix(
      pressureFamilyColor,
      autonomousHoldColor,
      holdAutonomyT,
    ).toConst("finalPressureColor");
    this.material.colorNode = mix(finalPressureColor, debugHeatColor, debugMix);

    const roughnessNoise = fract(
      sin(instanceIndex.toFloat().mul(483.1)).mul(19847.3),
    )
      .mul(0.12)
      .sub(0.06)
      .toConst("roughnessNoise");
    const expositionBias = readFocusT
      .mul(colorShellPrivilege)
      .mul(-0.08)
      .toConst("expositionBias");
    const rockRoughness = float(0.94)
      .add(roughnessNoise)
      .add(expositionBias)
      .clamp(0.88, 0.98)
      .toConst("rockRoughness");
    const holdRoughness = rockRoughness
      .add(colorShellPrivilege.mul(materialFamilyT).mul(0.03))
      .sub(colorCoreT.mul(materialFamilyT).mul(0.014))
      .clamp(0.89, 0.99)
      .toConst("holdRoughness");
    this.material.roughnessNode = mix(
      float(0.96),
      holdRoughness,
      materialFamilyT,
    );

    const holdMetalness = mix(
      float(0.015),
      float(0.022),
      colorShellPrivilege.mul(materialFamilyT).mul(0.34),
    )
      .clamp(0.015, 0.03)
      .toConst("holdMetalness");
    this.material.metalnessNode = mix(
      float(0.015),
      holdMetalness,
      materialFamilyT,
    ).clamp(0.015, 0.03);

    const glowFactor = smoothstep(float(0.12), float(0.46), particleHeat);
    const ember = vec3(0.88, 0.16, 0.03);
    const emberLift = smoothstep(float(0.38), float(0.72), particleHeat).mul(
      0.14,
    );
    const baseEmissive = pressureRed
      .mul(glowFactor)
      .mul(emberPocketT)
      .mul(materialFamilyT)
      .mul(0.022)
      .toConst("baseEmissive");
    const holdEmissive = baseEmissive
      .mul(mix(float(0.2), float(0.08), colorShellPrivilege))
      .add(emberPocketColor.mul(emberPocketT.mul(0.03)))
      .add(ember.mul(emberLift.mul(emberPocketT).mul(0.06)))
      .toConst("holdEmissive");
    const emissive = mix(baseEmissive, holdEmissive, materialFamilyT).toConst(
      "emissive",
    );
    const autonomousHoldEmissive = pressureRed
      .mul(glowFactor)
      .mul(corePocketT)
      .mul(holdAutonomyT)
      .mul(0.016)
      .add(emberPocketColor.mul(corePocketT.mul(holdAutonomyT).mul(0.024)))
      .add(ember.mul(emberLift.mul(corePocketT).mul(holdAutonomyT).mul(0.04)))
      .toConst("autonomousHoldEmissive");
    const finalEmissive = mix(
      emissive,
      autonomousHoldEmissive,
      holdAutonomyT,
    ).toConst("finalEmissive");
    this.material.emissiveNode = mix(finalEmissive, vec3(0), debugMix);

    const emissivePeak = finalEmissive.r
      .max(finalEmissive.g)
      .max(finalEmissive.b)
      .toConst("emissivePeak");
    const emissiveBloomMask = smoothstep(
      float(0.028),
      float(0.16),
      emissivePeak,
    )
      .mul(glowFactor.mul(0.08))
      .mul(float(1).sub(colorShellPrivilege.mul(0.36)))
      .mul(emberPocketT.mul(0.8).add(0.2))
      .clamp(0, 1)
      .toConst("emissiveBloomMask");

    this._bloomIntensityNode = emissivePeak.mul(emissiveBloomMask).clamp(0, 1);
    const holdAo = vAo
      .mul(mix(float(1.0), float(0.86), shellHoldT))
      .add(colorCoreT.mul(materialFamilyT).mul(0.035))
      .clamp(0, 1)
      .toConst("holdAo");
    this.material.aoNode = mix(vAo, holdAo, materialFamilyT);
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
    this.uniforms.convergenceFreeze.value = conf.convergenceFreeze || 0;
    this.uniforms.convergenceShapeMix.value = conf.convergenceShapeMix || 0;
    this.uniforms.postFreezeLock.value = conf.postFreezeSimLock || 0;
    this.uniforms.postFreezeClearProgress.value =
      conf.postFreezeClearProgress || 0;
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
    const holdOwnerRequired = conf.postFreezeSimLock > 0.5;

    this.worldPointToSimulation(wallMin, this._chamberMin);
    this.worldPointToSimulation(wallMax, this._chamberMax);
    this.uniforms.chamberMin.value.copy(this._chamberMin);
    this.uniforms.chamberMax.value.copy(this._chamberMax);

    if (this.freezeSnapshot) {
      this.uniforms.freezeCenter.value.copy(this.freezeSnapshot.center);
      this.uniforms.freezeBoundsMin.value.copy(this.freezeSnapshot.boundsMin);
      this.uniforms.freezeBoundsMax.value.copy(this.freezeSnapshot.boundsMax);
    } else if (holdOwnerRequired) {
      throw new Error(
        "VOLKANO hold owner missing: explicit freeze-space owner required before entering hold.",
      );
    } else {
      this.worldPointToSimulation(
        monumentCenter,
        this.uniforms.freezeCenter.value,
      );
      this.uniforms.freezeBoundsMin.value.copy(this._chamberMin);
      this.uniforms.freezeBoundsMax.value.copy(this._chamberMax);
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
