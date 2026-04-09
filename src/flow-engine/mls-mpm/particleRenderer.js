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

const buildFreezeSpaceMetrics = ({
  position,
  center,
  boundsMin,
  boundsMax,
  spanName,
  halfName,
  localName,
  centerDistName,
  frontName,
}) => {
  const span = boundsMax.sub(boundsMin).toConst(spanName);
  const half = vec3(
    span.x.mul(0.5).max(float(0.001)),
    span.y.mul(0.5).max(float(0.001)),
    span.z.mul(0.5).max(float(0.001)),
  ).toConst(halfName);
  const local = vec3(
    position.x.sub(center.x).div(half.x),
    position.y.sub(center.y).div(half.y),
    position.z.sub(center.z).div(half.z),
  ).toConst(localName);
  const centerDist = local.length()
    .div(float(1.7320508))
    .clamp(0, 1)
    .toConst(centerDistName);
  const frontT = local.z
    .negate()
    .mul(0.5)
    .add(0.5)
    .clamp(0, 1)
    .toConst(frontName);

  return { span, half, local, centerDist, frontT };
};

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

let particleGeometryTemplate = null;

const getParticleGeometryTemplate = () => {
  if (particleGeometryTemplate) return particleGeometryTemplate;

  const boxGeometry = BufferGeometryUtils.mergeVertices(
    new THREE.BoxGeometry(7, 7, 30),
    3.0,
  );
  boxGeometry.attributes.position.array =
    boxGeometry.attributes.position.array.map((v) => v * 0.1);

  const roundedBoxGeometry = createRoundedBox(0.7, 0.7, 3, 0.1);
  const defaultIndexCount = roundedBoxGeometry.index.count;
  const geometry = BufferGeometryUtils.mergeGeometries([
    roundedBoxGeometry,
    boxGeometry,
  ]);

  particleGeometryTemplate = { defaultIndexCount, geometry };
  return particleGeometryTemplate;
};

class ParticleRenderer {
  mlsMpmSim = null;
  object = null;
  bloom = false;
  hasFreezeSpace = false;
  uniforms = {};

  constructor(mlsMpmSim) {
    this.mlsMpmSim = mlsMpmSim;

    // ── Geometry ────────────────────────────────────────────────────────────
    // Built once at module scope, copied per renderer instance so draw-range
    // and instance-count remain instance-local.
    const { defaultIndexCount, geometry } = getParticleGeometryTemplate();
    this.defaultIndexCount = defaultIndexCount;
    this.geometry = new THREE.InstancedBufferGeometry().copy(geometry);
    this.geometry.setDrawRange(0, this.defaultIndexCount);
    this.geometry.instanceCount = this.mlsMpmSim.numParticles;

    this.material = new THREE.MeshStandardNodeMaterial({
      metalness: 0.015,
      roughness: 0.92,
    });

    // ── Uniforms ─────────────────────────────────────────────────────────────
    this.uniforms.size = uniform(1);

    // Convergence signals (driven by convergence-controller)
    this.uniforms.convergenceFreeze = uniform(0); // 0→1 as mass freezes
    this.uniforms.holdShapeMix = uniform(0); // 0→1 rod→hold-body morph

    // Post-freeze signals (driven by engineBridge post-freeze timer)
    this.uniforms.postFreezeLock          = uniform(0); // gate: 1 = sim locked, renderer owns all animation
    this.uniforms.postFreezeClearProgress = uniform(0); // 0→1 clear-flight progress

    // Freeze-space reference — set from live snapshot at freeze moment
    // Defines the spatial centroid and bounds of the frozen mass
    this.uniforms.freezeCenter    = uniform(new THREE.Vector3());
    this.uniforms.freezeBoundsMin = uniform(new THREE.Vector3());
    this.uniforms.freezeBoundsMax = uniform(new THREE.Vector3());

    // Chamber bounds (world-to-sim converted from PREENTER_VESSEL)
    this.uniforms.chamberMin = uniform(new THREE.Vector3());
    this.uniforms.chamberMax = uniform(new THREE.Vector3());

    this._chamberMin = new THREE.Vector3();
    this._chamberMax = new THREE.Vector3();
    this._wallMin = new THREE.Vector3();
    this._wallMax = new THREE.Vector3();
    this._monumentCenter = new THREE.Vector3();
    this._worldQuaternion = new THREE.Quaternion();
    this._worldScale = new THREE.Vector3();

    // vAo: AO intensity computed in positionNode (vertex), consumed in colorNode (fragment)
    const vAo = varying(0, "vAo");

    const particle = this.mlsMpmSim.particleBuffer.element(instanceIndex);

    // ════════════════════════════════════════════════════════════════════════
    // POSITION NODE
    // Runs per-vertex. Handles rod shape + clear-flight animation.
    //
    // Zone A — Play-state shape: velocity-driven stretch/thinning
    //           + holdShapeMix morphs rods toward the held body
    // Zone B — Clear-flight: particles fly toward rift back wall, shrink, vanish
    // ════════════════════════════════════════════════════════════════════════
    this.material.positionNode = Fn(() => {
      // Particle data
      const pos              = particle.get("position").xyz.toConst("pos");
      const particleDensity  = particle.get("density");
      const particleDirection = particle.get("direction");
      const localPos         = attribute("position").xyz;
      const speed            = particle.get("velocity").length();

      // ── Zone A: Play-state rod shape ────────────────────────────────────
      // Velocity stretch: fast-moving rods elongate along travel axis
      const stretchT  = smoothstep(float(1.2), float(3.5), speed);
      const stretch   = stretchT.mul(1.2).add(1.0);
      const thinning  = pow(stretch, -0.4);

      // holdShapeMix morphs rod dims toward the held body at freeze
      const shapeMix      = this.uniforms.holdShapeMix.toConst("shapeMix");
      const rodWidth      = mix(thinning, float(1.04), shapeMix).toConst("rodWidth");
      const rodHeight     = mix(thinning, float(1.89), shapeMix).toConst("rodHeight");
      const rodLength     = mix(stretch,  float(0.23), shapeMix).toConst("rodLength");

      // ── Zone B: Clear-flight setup ───────────────────────────────────────
      const postFreezeLock  = this.uniforms.postFreezeLock.toConst("postFreezeLock");
      const clearProgress   = this.uniforms.postFreezeClearProgress.clamp(0, 1).toConst("clearProgress");
      const freezeCenter    = this.uniforms.freezeCenter;
      const freezeBoundsMin = this.uniforms.freezeBoundsMin;
      const freezeBoundsMax = this.uniforms.freezeBoundsMax;
      const cMin            = this.uniforms.chamberMin;
      const cMax            = this.uniforms.chamberMax;

      // Per-particle stable hash — no temporal flicker, pure instance-index function
      const hashX   = fract(sin(instanceIndex.toFloat().mul(127.1)).mul(43758.5453)).mul(2.0).sub(1.0);
      const hashY   = fract(sin(instanceIndex.toFloat().mul(269.5)).mul(18642.3721)).mul(2.0).sub(1.0);
      const hashZ   = fract(sin(instanceIndex.toFloat().mul(419.2)).mul(29517.8134)).mul(2.0).sub(1.0);
      const hashDir = normalize(vec3(hashX, hashY, hashZ)).toConst("hashDir");

      // Chamber geometry references
      const chamberDepth = cMax.z.sub(cMin.z).max(float(0.001)).toConst("chamberDepth");
      const chamberDiag  = cMax.sub(cMin).length().max(float(0.001)).toConst("chamberDiag");

      // Freeze-space: normalize pos relative to frozen centroid & bounds
      // Result: fLocal in [-1..1] per axis, centerDist in [0..1]
      // 0 = centroid (core), 1 = bounds edge (shell)
      const {
        span: fSpan,
        half: fHalf,
        local: fLocal,
        centerDist,
        frontT: frontFaceT,
      } = buildFreezeSpaceMetrics({
        position: pos,
        center: freezeCenter,
        boundsMin: freezeBoundsMin,
        boundsMax: freezeBoundsMax,
        spanName: "fSpan",
        halfName: "fHalf",
        localName: "fLocal",
        centerDistName: "centerDist",
        frontName: "frontFaceT",
      });
      const fDiag       = fSpan.length().max(float(0.001)).toConst("fDiag");

      // Shell/core masks
      const denseCore   = float(1).sub(smoothstep(float(0.18), float(0.42), centerDist)).toConst("denseCore");
      const shellEdge   = smoothstep(float(0.24), float(0.92), centerDist).toConst("shellEdge");

      // Staggered clear-launch timing
      // Shell launches first (higher startOffset), front-facing launches first
      const motionHash  = hashX.mul(0.5).add(0.5).toConst("motionHash");
      const clearOffset = shellEdge.mul(0.16).add(frontFaceT.mul(0.1)).add(motionHash.mul(0.05)).toConst("clearOffset");

      const launchT   = smoothstep(clearOffset,                   clearOffset.add(float(0.20)), clearProgress).mul(postFreezeLock).toConst("launchT");
      const crossT    = smoothstep(clearOffset.add(float(0.08)),  clearOffset.add(float(0.42)), clearProgress).mul(postFreezeLock).toConst("crossT");
      const leaveT    = smoothstep(clearOffset.add(float(0.34)),  clearOffset.add(float(0.70)), clearProgress).mul(postFreezeLock).toConst("leaveT");
      const lateDeathT = smoothstep(clearOffset.add(float(0.52)), clearOffset.add(float(0.86)), clearProgress).mul(postFreezeLock).toConst("lateDeathT");

      // Radial direction from freeze centroid (used for rod orientation + lateral kick)
      const radialDir   = normalize(pos.sub(freezeCenter).add(hashDir.mul(0.001))).toConst("radialDir");
      const chamberUp   = vec3(0, 1, 0).toConst("chamberUp");

      // Monument orientation: per-particle radial + facet jitter
      const surfaceNormal = normalize(fLocal.add(hashDir.mul(0.001))).toConst("surfaceNormal");
      const facetDir      = normalize(
        surfaceNormal.mul(0.45).add(radialDir.mul(0.48)).add(hashDir.mul(0.09))
      ).toConst("facetDir");
      const monumentDir   = normalize(
        mix(radialDir, facetDir, shellEdge.mul(0.14).add(0.86))
          .add(radialDir.mul(denseCore.mul(0.16)))
          .add(hashDir.mul(0.006))
      ).toConst("monumentDir");

      // Rod shape during flight: stretches along travel axis, thins laterally
      const clearStretch  = mix(float(1), float(1.22), launchT).mul(mix(float(1), float(1.08), crossT)).toConst("clearStretch");
      const clearThin     = pow(clearStretch, float(-0.32)).toConst("clearThin");
      const stretchedPos  = vec3(
        localPos.x.mul(rodWidth.mul(clearThin)),
        localPos.y.mul(rodHeight.mul(clearThin)),
        localPos.z.mul(rodLength.mul(clearStretch)),
      );

      // Direction C: toward the rift (back wall center)
      const riftTarget    = vec3(
        cMin.x.add(cMax.x).mul(0.5),
        cMin.y.add(cMax.y).mul(0.5),
        cMax.z,
      ).toConst("riftTarget");
      const toRiftDir     = normalize(riftTarget.sub(pos).add(hashDir.mul(0.001))).toConst("toRiftDir");

      // Early flight: mostly rift-directed, slight radial spread and hash scatter
      const earlyFlightDir = normalize(
        toRiftDir.mul(float(0.84))
          .add(radialDir.mul(float(0.08)))
          .add(chamberUp.mul(fLocal.y.mul(0.04)))
          .add(hashDir.mul(0.04))
      ).toConst("earlyFlightDir");

      // Late flight: tightens to rift axis with minor per-particle spread
      const lateFlightDir  = normalize(
        toRiftDir.mul(float(1.0))
          .add(vec3(hashX.mul(0.018), fLocal.y.mul(0.012), float(0)))
      ).toConst("lateFlightDir");

      const flightDir      = normalize(mix(earlyFlightDir, lateFlightDir, leaveT)).toConst("flightDir");

      // ── Flight position computation ──────────────────────────────────────
      // Phase 1 (launchT): particle kicks slightly outward + forward from rest pos
      const launchDist    = chamberDiag.mul(mix(float(0.06), float(0.12), shellEdge)).toConst("launchDist");
      const lateralKick   = vec3(
        radialDir.x.mul(fDiag.mul(0.12)).add(hashX.mul(fDiag.mul(0.018))),
        radialDir.y.mul(fDiag.mul(0.09)).add(hashY.mul(fDiag.mul(0.014))),
        float(0),
      ).toConst("lateralKick");
      const launchPos     = pos.add(lateralKick).add(earlyFlightDir.mul(launchDist)).toConst("launchPos");
      const releasedPos   = mix(pos, launchPos, launchT).toConst("releasedPos");

      // Phase 2 (crossT): travels toward rift; phase 3 (leaveT): extra push through wall
      const distToRift    = cMax.z.sub(releasedPos.z).max(chamberDepth.mul(0.05)).toConst("distToRift");
      const crossDist     = distToRift
        .add(chamberDepth.mul(mix(float(0.06), float(0.12), shellEdge)))
        .add(fDiag.mul(0.06))
        .toConst("crossDist");
      const leaveDist     = chamberDepth
        .mul(mix(float(0.08), float(0.14), shellEdge))
        .add(float(0.02))
        .toConst("leaveDist");

      // Lateral kick decays as particles converge toward rift axis
      const latDecayX     = launchT.mul(mix(float(0.32), float(0.10), crossT)).mul(mix(float(1.0), float(0.06), leaveT)).toConst("latDecayX");
      const latDecayY     = launchT.mul(mix(float(0.28), float(0.09), crossT)).mul(mix(float(1.0), float(0.05), leaveT)).toConst("latDecayY");
      const decayedLateral = vec3(
        lateralKick.x.mul(latDecayX),
        lateralKick.y.mul(latDecayY),
        float(0),
      ).toConst("decayedLateral");

      // Small per-particle jitter mid-flight, fades at leave
      const lateNoise     = vec3(
        hashX.mul(0.006),
        hashY.mul(0.004).add(fLocal.y.mul(0.003)),
        hashZ.mul(0.003),
      )
        .mul(fDiag)
        .mul(crossT)
        .mul(float(1).sub(leaveT.mul(0.82)).clamp(0, 1))
        .toConst("lateNoise");

      const forwardDist   = crossDist.mul(crossT).add(leaveDist.mul(leaveT)).toConst("forwardDist");
      const renderPos     = releasedPos
        .add(decayedLateral)
        .add(flightDir.mul(forwardDist))
        .add(lateNoise)
        .toConst("renderPos");

      // Death: particles vanish as they reach/cross the rift back wall
      const riftClaimT    = smoothstep(
        cMax.z.sub(chamberDepth.mul(0.14)),
        cMax.z.add(chamberDepth.mul(0.02)),
        renderPos.z,
      ).toConst("riftClaimT");
      const deathScale    = mix(float(1.0), float(0.04), lateDeathT.mul(riftClaimT).clamp(0, 1)).toConst("deathScale");

      // Final orientation: sim direction → monument facet → flight direction
      const formedDir     = normalize(
        mix(
          mix(particleDirection.xyz, monumentDir, shapeMix),
          flightDir,
          crossT.add(leaveT.mul(0.22)).clamp(0, 1),
        )
      ).toConst("formedDir");

      const mat = calcLookAtMatrix(formedDir);

      // AO: tighter at core (core occluded), looser at shell (shell exposed)
      vAo.assign(
        mix(float(0.92), float(0.60), centerDist).add(denseCore.mul(0.06)).clamp(0.5, 1.0)
      );

      // Density-driven size scale (play state only; locked at 0.975 during freeze)
      const densityScale = mix(
        particleDensity.mul(0.28).add(0.72).clamp(0, 1),
        float(0.975),
        shapeMix,
      );

      return mat
        .mul(stretchedPos.mul(this.uniforms.size.mul(1.08)))
        .mul(densityScale)
        .mul(deathScale)
        .add(renderPos);
    })();

    // ════════════════════════════════════════════════════════════════════════
    // COLOR NODE
    // Runs per-fragment.
    //
    // Two clean zones:
    //   Play:  surfaceColor from the simulation (heat-driven, source-driven)
    //   Hold:  amber ember palette, built independently, gated by materialFamilyT
    //
    // Gate:  materialFamilyT = 0 → play color, 1 → hold palette, fades out at clear
    // Tune:  holdOuter/holdRim/holdBody/holdInner/holdCore palette colors below
    // ════════════════════════════════════════════════════════════════════════
    const particleColor  = particle.get("color");
    const particleHeat   = particle.get("heat");
    const surfaceColor   = particleColor.toConst("surfaceColor");
    const colorPos       = particle.get("position").xyz.toConst("colorPos");

    // View-facing: front-facing rod facets read brighter (exposition)
    const viewNormal     = normalize(transformNormalToView(normalLocal)).toConst("viewNormal");
    const viewFacingT    = pow(viewNormal.z.mul(viewNormal.z), float(0.5)).clamp(0, 1).toConst("viewFacingT");

    // ── Hold-space classifiers ───────────────────────────────────────────────
    // Mirror of positionNode freeze-space, computed independently for fragment stage.
    // holdCenterDist: 0 = mass centroid (core), 1 = mass edge (shell)
    const {
      local: holdLocal,
      centerDist: holdCenterDist,
      frontT: holdFrontT,
    } = buildFreezeSpaceMetrics({
      position: colorPos,
      center: this.uniforms.freezeCenter,
      boundsMin: this.uniforms.freezeBoundsMin,
      boundsMax: this.uniforms.freezeBoundsMax,
      spanName: "holdFSpan",
      halfName: "holdFHalf",
      localName: "holdLocal",
      centerDistName: "holdCenterDist",
      frontName: "holdFrontT",
    });
    const holdShell      = smoothstep(float(0.24), float(0.92), holdCenterDist).toConst("holdShell");  // 0=core 1=shell
    const holdCore       = float(1).sub(smoothstep(float(0.16), float(0.46), holdCenterDist)).toConst("holdCore"); // 1=core 0=shell
    const readFocusT     = mix(holdFrontT, viewFacingT, float(0.68)).toConst("readFocusT");

    // ── materialFamilyT: the main gate for all hold material properties ──────
    // 0 = fully play state, 1 = fully hold state
    // convergenceFreeze drives it up; matLeaveT drives it back down during clear
    const clearMatProgress = this.uniforms.postFreezeClearProgress.clamp(0, 1).toConst("clearMatProgress");
    const matHash          = fract(sin(instanceIndex.toFloat().mul(127.1)).mul(43758.5453)).toConst("matHash");
    const matOffset        = holdShell.mul(0.16).add(holdFrontT.mul(0.1)).add(matHash.mul(0.05)).toConst("matOffset");
    const matLeaveT        = smoothstep(
      matOffset.add(float(0.34)),
      matOffset.add(float(0.70)),
      clearMatProgress,
    ).toConst("matLeaveT");
    const frozenT          = this.uniforms.convergenceFreeze.toConst("frozenT");
    const shapeSupportT    = this.uniforms.holdShapeMix.toConst("shapeSupportT");
    // Apply shape-support bonus: full freeze with shape mix reaches 1.0, without reaches 0.72
    const materialHoldT    = frozenT
      .mul(mix(float(0.72), float(1.0), shapeSupportT))
      .mul(float(1).sub(matLeaveT))
      .toConst("materialHoldT");
    // S-curve smoothing for crisp in/out
    const materialFamilyT  = materialHoldT
      .mul(materialHoldT.mul(float(3).sub(materialHoldT.mul(2))))
      .toConst("materialFamilyT");

    // ── Hold palette ─────────────────────────────────────────────────────────
    // Five stops from outer shell → hot core. Linear RGB. Tune freely.
    // Keep body values modest (0.1–0.6); emissive handles the visible glow.
    const palOuter  = vec3(0.048, 0.016, 0.005); // outer: near-dark dim ember
    const palRim    = vec3(0.18,  0.065, 0.013); // rim: warm amber
    const palBody   = vec3(0.38,  0.15,  0.028); // body: amber
    const palInner  = vec3(0.58,  0.26,  0.048); // inner: bright amber
    const palCore   = vec3(0.74,  0.40,  0.072); // core: hot amber (NOT near-white)

    // Gradient: outer → inner → core using holdCenterDist (1=outer, 0=core)
    // innerDist: 0=outer, 1=core (inverted for intuitive mixing)
    const innerDist     = float(1).sub(holdCenterDist).toConst("innerDist");
    const outerToBody   = mix(palOuter, palBody, smoothstep(float(0.0), float(0.75), innerDist)).toConst("outerToBody");
    const bodyToCore    = mix(palInner, palCore,  smoothstep(float(0.5), float(0.85), innerDist)).toConst("bodyToCore");
    // Blend rim in the outer-to-body transition
    const rimBlend      = mix(palRim, outerToBody, smoothstep(float(0.15), float(0.45), innerDist)).toConst("rimBlend");
    const baseGradient  = mix(rimBlend, bodyToCore, smoothstep(float(0.40), float(0.72), innerDist)).toConst("baseGradient");
    // View-facing bonus: front-facing core particles mix toward palCore (no additive overflow)
    const holdPalette   = mix(
      baseGradient,
      palCore,
      holdCore.mul(readFocusT).mul(float(0.24)).clamp(0, 1),
    ).toConst("holdPalette");

    // ── Color: clean gate between play and hold ───────────────────────────────
    const finalColor    = mix(surfaceColor, holdPalette, materialFamilyT);
    this.material.colorNode = finalColor;

    // ── Roughness ────────────────────────────────────────────────────────────
    // Play: rough volcanic rock. Hold: ember surface, slightly less rough at core.
    const roughNoise    = fract(sin(instanceIndex.toFloat().mul(483.1)).mul(19847.3)).mul(0.12).sub(0.06).toConst("roughNoise");
    const playRoughness = float(0.92).add(roughNoise).clamp(0.86, 0.96).toConst("playRoughness");
    const holdRoughness = float(0.86).add(roughNoise)
      .sub(holdCore.mul(materialFamilyT).mul(0.06)) // core slightly smoother
      .clamp(0.78, 0.92)
      .toConst("holdRoughness");
    this.material.roughnessNode = mix(playRoughness, holdRoughness, materialFamilyT);

    // ── Metalness ────────────────────────────────────────────────────────────
    // Ember is dielectric — keep metalness near-zero throughout.
    this.material.metalnessNode = float(0.015);

    // ── Emissive ─────────────────────────────────────────────────────────────
    // Two contributions:
    //   heatEmissive:  always-on, driven by particle heat (hot particles glow orange)
    //   holdEmissive:  hold-state only, amber core glow from materialFamilyT
    //                  core glows, shell stays dark → contrast reads as depth
    //
    // Tune holdEmissiveScale to control glow brightness without touching colors.
    const glowFactor     = smoothstep(float(0.12), float(0.46), particleHeat);
    const heatEmissive   = palInner.mul(glowFactor).mul(float(0.044)).toConst("heatEmissive");

    // Hold emissive: concentrated at core, suppressed at shell
    // holdCore=1 at centroid, holdShell=0 at centroid → product peaks at core
    const holdEmissiveStr  = holdCore
      .mul(float(1).sub(holdShell.mul(0.82)))    // core-only mask
      .mul(readFocusT.mul(0.36).add(0.64))        // view-facing bonus
      .mul(materialFamilyT)                        // gated by hold state
      .toConst("holdEmissiveStr");
    const holdEmissiveScale = float(0.12);         // ← tune this for glow brightness
    const holdEmissive    = palCore.mul(holdEmissiveStr).mul(holdEmissiveScale).toConst("holdEmissive");

    const emissive = heatEmissive.add(holdEmissive).toConst("emissive");
    this.material.emissiveNode = emissive;

    // Bloom mask (bloom off by default, preserved for debug/enable)
    const emissivePeak       = emissive.r.max(emissive.g).max(emissive.b).toConst("emissivePeak");
    const emissiveBloomMask  = smoothstep(float(0.028), float(0.16), emissivePeak)
      .mul(glowFactor.mul(0.08))
      .mul(float(1).sub(holdShell.mul(0.36)))
      .clamp(0, 1)
      .toConst("emissiveBloomMask");
    this._bloomIntensityNode = emissivePeak.mul(emissiveBloomMask).clamp(0, 1);

    // ── AO ───────────────────────────────────────────────────────────────────
    // Hold: core particles gain slight AO relief, shell particles darken slightly
    const holdShellHoldT = holdShell.mul(materialFamilyT).toConst("holdShellHoldT");
    const holdAo         = vAo
      .mul(mix(float(1.0), float(0.86), holdShellHoldT))
      .add(holdCore.mul(materialFamilyT).mul(0.035))
      .clamp(0, 1)
      .toConst("holdAo");
    this.material.aoNode = mix(vAo, holdAo, materialFamilyT);

    // ── Mesh ─────────────────────────────────────────────────────────────────
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
    return this.applyWorldDirectionToSimulation(worldDirection, target);
  }

  applyWorldDirectionToSimulation(worldDirection, target) {
    const worldQuaternion = this.object.getWorldQuaternion(this._worldQuaternion);
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

  setFreezeSnapshot(snapshot) {
    if (!snapshot) {
      this.clearFreezeSnapshot();
      return;
    }
    this.uniforms.freezeCenter.value.copy(snapshot.center);
    this.uniforms.freezeBoundsMin.value.copy(snapshot.boundsMin);
    this.uniforms.freezeBoundsMax.value.copy(snapshot.boundsMax);
    this.hasFreezeSpace = true;
  }

  clearFreezeSnapshot() {
    this.hasFreezeSpace = false;
  }

  updateRuntimeUniforms() {
    this.uniforms.size.value = conf.actualSize;
    this.uniforms.convergenceFreeze.value = conf.convergenceFreeze || 0;
    this.uniforms.holdShapeMix.value = conf.holdShapeMix || 0;
    this.uniforms.postFreezeLock.value = conf.postFreezeSimLock || 0;
    this.uniforms.postFreezeClearProgress.value =
      conf.postFreezeClearProgress || 0;
  }

  updateChamberBounds() {
    const v = PREENTER_VESSEL;
    const wallMin = this._wallMin.set(
      v.centerX - v.apertureWidth / 2,
      v.centerY - v.apertureHeight / 2,
      v.centerZ,
    );
    const wallMax = this._wallMax.set(
      v.centerX + v.apertureWidth / 2,
      v.centerY + v.apertureHeight / 2,
      v.centerZ + v.depth,
    );

    this.worldPointToSimulation(wallMin, this._chamberMin);
    this.worldPointToSimulation(wallMax, this._chamberMax);
    this.uniforms.chamberMin.value.copy(this._chamberMin);
    this.uniforms.chamberMax.value.copy(this._chamberMax);
  }

  applyFallbackFreezeSpace() {
    const v = PREENTER_VESSEL;
    const src = PREENTER_SOURCE_ANCHOR.originLocal;
    const monumentCenter = this._monumentCenter.set(
      v.centerX + src.x,
      v.centerY + src.y,
      v.centerZ + src.z,
    );

    this.worldPointToSimulation(monumentCenter, this.uniforms.freezeCenter.value);
    this.uniforms.freezeBoundsMin.value.copy(this._chamberMin);
    this.uniforms.freezeBoundsMax.value.copy(this._chamberMax);
  }

  updateFreezeSpace() {
    const holdOwnerRequired = conf.postFreezeSimLock > 0.5;

    if (this.hasFreezeSpace) {
      return;
    }

    if (holdOwnerRequired) {
      throw new Error(
        "VOLKANO hold owner missing: explicit freeze-space owner required before entering hold.",
      );
    }

    this.applyFallbackFreezeSpace();
  }

  updateBloomState(nextBloom) {
    if (nextBloom === this.bloom) {
      return;
    }

    this.bloom = nextBloom;
    if (nextBloom) {
      this.material.mrtNode = mrt({
        bloomIntensity: this._bloomIntensityNode,
      });
    } else {
      this.material.mrtNode = null;
    }
  }

  dispose() {
    if (this.object?.parent) {
      this.object.parent.remove(this.object);
    }
    this.object = null;
    this.geometry?.dispose?.();
    this.material?.dispose?.();
    this.geometry = null;
    this.material = null;
    this.mlsMpmSim = null;
    this.uniforms = {};
    this.hasFreezeSpace = false;
  }

  update() {
    this.updateRuntimeUniforms();
    this.updateChamberBounds();
    this.updateFreezeSpace();
    this.geometry.instanceCount = conf.particles;
    this.updateBloomState(conf.bloom);
  }
}

export default ParticleRenderer;
