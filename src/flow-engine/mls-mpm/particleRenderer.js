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
  min,
} from "three/tsl";
import { PREENTER_VESSEL } from "../vesselDescriptors";
import {
  buildRiftAndExitFromChamberSim,
  computeChamberBoundsSimFromParticleObject,
  POST_ENTER_FREEZE_SPACE_FRAC,
} from "../post-enter/postEnterChamberBasis";

const _idleExitScratch = new THREE.Vector3();
const _idleRiftP0 = new THREE.Vector3();
const _idleRiftP1 = new THREE.Vector3();
const _idleFreezeCenter = new THREE.Vector3();
const _idleFreezeHalf = new THREE.Vector3();

const POST_ENTER_MATERIAL = Object.freeze({
  cavityTint: [0.08, 0.034, 0.018],
  bodyTint: [0.18, 0.074, 0.034],
  ridgeTint: [0.28, 0.118, 0.05],
  emissiveTint: [0.36, 0.13, 0.048],
  ridgeStrength: 0.32,
  emissiveStrength: 0.022,
  roughness: 0.88,
  roughnessVariance: 0.09,
  facingLift: 0.04,
});

const POST_ENTER_SURFACE_READ = Object.freeze({
  bodyBandWeight: 0.28,
  bodyCoreWeight: 0.2,
  bodyBias: 0.24,
  bodyMax: 0.7,
  ridgeCoreWeight: 0.24,
  ridgeBandWeight: 0.1,
  ridgeFacingWeight: 0.08,
  ridgeMax: 0.42,
  emissiveRidgeWeight: 0.35,
  emissiveBodyWeight: 0.16,
});

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
  densityLift: 0.28,
  densityBias: 0.72,
  frozenDensity: 0.975,
  instanceScale: 1.08,
  preEnterSpeedStart: 0.16,
  preEnterSpeedEnd: 1.32,
  preEnterThicknessGain: 0.72,
  preEnterThicknessBias: 0.28,
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

const buildFreezeSpaceState = ({
  position,
  center,
  boundsMin,
  boundsMax,
  name,
}) => {
  const span = boundsMax.sub(boundsMin).toConst(`${name}Span`);
  const half = vec3(
    span.x.mul(0.5).max(float(0.001)),
    span.y.mul(0.5).max(float(0.001)),
    span.z.mul(0.5).max(float(0.001)),
  ).toConst(`${name}Half`);

  const local = vec3(
    position.x.sub(center.x).div(half.x),
    position.y.sub(center.y).div(half.y),
    position.z.sub(center.z).div(half.z),
  ).toConst(`${name}Local`);

  const centerDist = local
    .length()
    .div(float(1.7320508))
    .clamp(0, 1)
    .toConst(`${name}CenterDist`);

  const band = float(1)
    .sub(
      smoothstep(
        float(0.1),
        float(0.72),
        local.y.abs().add(local.x.abs().mul(0.22)),
      ),
    )
    .mul(float(1).sub(smoothstep(float(0.82), float(1.06), local.z.abs())))
    .clamp(0, 1)
    .toConst(`${name}Band`);

  const core = float(1)
    .sub(smoothstep(float(0.18), float(0.56), centerDist))
    .toConst(`${name}Core`);

  const diag = span.length().max(float(0.001)).toConst(`${name}Diag`);

  return { band, core, local, centerDist, diag };
};

const buildParticleProfileState = ({
  speed,
  particleDensity,
  convergenceFreeze,
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

  const rodWidth = mix(
    thinning,
    float(PARTICLE_PROFILE_READ.frozenWidth),
    freezeShapeT,
  ).toConst("rodWidth");

  const rodHeight = mix(
    thinning,
    float(PARTICLE_PROFILE_READ.frozenHeight),
    freezeShapeT,
  ).toConst("rodHeight");

  const rodLength = mix(
    stretch,
    float(PARTICLE_PROFILE_READ.frozenLength),
    freezeShapeT,
  ).toConst("rodLength");

  const densityScale = mix(
    particleDensity
      .mul(PARTICLE_PROFILE_READ.densityLift)
      .add(PARTICLE_PROFILE_READ.densityBias)
      .clamp(0, 1),
    float(PARTICLE_PROFILE_READ.frozenDensity),
    freezeShapeT,
  ).toConst("densityScale");

  return { rodWidth, rodHeight, rodLength, densityScale };
};

const buildParticleViewState = ({
  formedDir,
  speed,
  vNormalView,
  vPreEnterThickness,
}) => {
  const mat = calcLookAtMatrix(formedDir);

  const orientedNormalView = normalize(
    transformNormalToView(mat.mul(normalLocal)),
  ).toConst("orientedNormalView");

  const preEnterThickness = orientedNormalView.z
    .abs()
    .oneMinus()
    .mul(
      smoothstep(
        float(PARTICLE_PROFILE_READ.preEnterSpeedStart),
        float(PARTICLE_PROFILE_READ.preEnterSpeedEnd),
        speed,
      )
        .toConst("preEnterSpeedT")
        .mul(PARTICLE_PROFILE_READ.preEnterThicknessGain)
        .add(PARTICLE_PROFILE_READ.preEnterThicknessBias),
    )
    .clamp(0, 1)
    .toConst("preEnterThickness");

  vNormalView.assign(orientedNormalView);
  vPreEnterThickness.assign(preEnterThickness);

  return { mat };
};

const buildParticleDrawState = ({
  simPos,
  particleDirection,
  flight,
  localPos,
  rodWidth,
  rodHeight,
  rodLength,
  uniforms,
  vNearIntakePanel,
  vNearSpineAxis,
}) => {
  const flightPhaseT = step(float(0.5), flight.get("flightPhase")).toConst(
    "flightPhaseT",
  );

  const captureWeight = flight
    .get("captureWeight")
    .clamp(0, 1)
    .toConst("captureWeight");

  const dissolveT = flight.get("dissolve").clamp(0, 1).toConst("dissolveT");

  const flightPhaseRaw = flight.get("flightPhase");
  /** Flight `dead` phase is 4 — zero footprint so gate/renderer semantics match. */
  const deadT = step(float(3.99), flightPhaseRaw).toConst("flightDeadT");

  const transportPos = flight.get("transportPos").xyz.toConst("transportPos");

  /** Renderer consumes transport truth. It does not clamp or re-author it. */
  const worldCenter = mix(simPos, transportPos, flightPhaseT).toConst(
    "worldCenter",
  );

  const loR = uniforms.chamberMin;
  const hiR = uniforms.chamberMax;
  const chamberDepthR = hiR.z
    .sub(loR.z)
    .max(float(0.01))
    .toConst("riftChamberDepth");
  const r0d = uniforms.riftSlitP0;
  const r1d = uniforms.riftSlitP1;
  const rminx = min(r0d.x, r1d.x);
  const rmaxx = max(r0d.x, r1d.x);
  const rminy = min(r0d.y, r1d.y);
  const rmaxy = max(r0d.y, r1d.y);
  const zRiftDraw = r0d.z.add(r1d.z).mul(float(0.5));
  /** Closest point on intake **panel** (axis-aligned rect on wall). */
  const closestPanel = vec3(
    worldCenter.x.clamp(rminx, rmaxx),
    worldCenter.y.clamp(rminy, rmaxy),
    zRiftDraw,
  ).toConst("riftClosestPanel");
  const distPanel = worldCenter
    .sub(closestPanel)
    .length()
    .max(float(1e-6))
    .toConst("distPanelDraw");
  const distNormPanel = distPanel.div(chamberDepthR).toConst("distNormPanelDraw");
  /** Wider band: on-wall / through-wall read (not slit center). */
  const nearIntakePanelT = float(1)
    .sub(smoothstep(float(0.022), float(0.26), distNormPanel))
    .mul(flightPhaseT)
    .toConst("nearIntakePanelT");

  /** Vertical **spine** line: center X of slit, Y clamped to slit span (true 1D axis). */
  const spineXDraw = rminx.add(rmaxx).mul(float(0.5)).toConst("spineXDraw");
  const spineYOnAxis = worldCenter.y.clamp(rminy, rmaxy).toConst("spineYOnAxis");
  const closestSpineAxis = vec3(
    spineXDraw,
    spineYOnAxis,
    zRiftDraw,
  ).toConst("riftClosestSpineAxis");
  const distSpineAxis = worldCenter
    .sub(closestSpineAxis)
    .length()
    .max(float(1e-6))
    .toConst("distSpineAxisDraw");
  const distNormSpineAxis = distSpineAxis.div(chamberDepthR).toConst(
    "distNormSpineAxisDraw",
  );
  /** Narrow band: slit center / read-protect only. */
  const nearSpineAxisT = float(1)
    .sub(smoothstep(float(0.0045), float(0.055), distNormSpineAxis))
    .mul(flightPhaseT)
    .toConst("nearSpineAxisT");

  vNearIntakePanel.assign(nearIntakePanelT);
  vNearSpineAxis.assign(nearSpineAxisT);

  /** Surface identity stays anchored to the freeze commit, not moving world position. */
  const surfaceAnchor = mix(
    simPos,
    flight.get("commitPos").xyz,
    flightPhaseT,
  ).toConst("surfaceAnchor");

  const commitDirRaw = mix(
    particleDirection.xyz,
    flight.get("commitDir").xyz,
    flightPhaseT,
  ).toConst("commitDirRaw");

  const transportVelRaw = flight
    .get("transportVel")
    .xyz.toConst("transportVelRaw");

  const transportVelLen = transportVelRaw
    .length()
    .max(float(1e-5))
    .toConst("transportVelLen");

  const transportDir = transportVelRaw
    .div(transportVelLen)
    .toConst("transportDir");

  const gpuMotionBias = smoothstep(
    float(0.02),
    float(0.18),
    transportVelRaw.length(),
  ).toConst("gpuMotionBias");
  const motionBias = gpuMotionBias.clamp(0, 1).toConst("motionBias");

  const formedDir = normalize(
    mix(commitDirRaw, transportDir, motionBias),
  ).toConst("formedDir");

  const spineSlim = nearSpineAxisT
    .mul(smoothstep(float(0.06), float(0.88), captureWeight))
    .toConst("spineSlim");

  const panelSlim = nearIntakePanelT
    .mul(smoothstep(float(0.12), float(0.92), captureWeight))
    .toConst("panelSlim");

  const widthScale = float(1)
    .sub(captureWeight.mul(float(0.18)))
    .sub(dissolveT.mul(float(0.3)))
    .mul(mix(float(1), float(0.38), spineSlim))
    .mul(mix(float(1), float(0.58), panelSlim))
    .clamp(0.32, 1)
    .toConst("widthScale");

  const heightScale = float(1)
    .sub(captureWeight.mul(float(0.1)))
    .sub(dissolveT.mul(float(0.22)))
    .mul(mix(float(1), float(0.45), spineSlim))
    .mul(mix(float(1), float(0.52), panelSlim))
    .clamp(0.36, 1)
    .toConst("heightScale");

  const lengthScale = float(1)
    .sub(captureWeight.mul(float(0.22)))
    .sub(dissolveT.mul(float(0.5)))
    .mul(mix(float(1), float(0.55), spineSlim.mul(smoothstep(float(0.12), float(0.95), dissolveT))))
    .mul(mix(float(1), float(0.62), panelSlim.mul(smoothstep(float(0.15), float(0.9), dissolveT))))
    .clamp(0.24, 1)
    .toConst("lengthScale");

  const shapedPos = vec3(
    localPos.x.mul(rodWidth.mul(widthScale)),
    localPos.y.mul(rodHeight.mul(heightScale)),
    localPos.z.mul(rodLength.mul(lengthScale)),
  )
    .mul(float(1).sub(deadT))
    .toConst("shapedPos");

  /** Panel = broad on-wall fade; spine axis = extra collapse in the slit. */
  const intakeOpacityFeather = nearIntakePanelT
    .mul(smoothstep(float(0.04), float(0.68), captureWeight))
    .mul(
      mix(
        float(0.42),
        float(1),
        smoothstep(float(0.06), float(0.5), dissolveT),
      ),
    )
    .mul(
      mix(
        float(1),
        float(0.28),
        nearSpineAxisT.mul(smoothstep(float(0.08), float(0.82), captureWeight)),
      ),
    )
    .toConst("intakeOpacityFeather");

  const opacityMul = mix(
    float(1),
    float(1).sub(dissolveT).clamp(0, 1),
    flightPhaseT,
  )
    .mul(mix(float(1), float(0.14), intakeOpacityFeather))
    .mul(float(1).sub(deadT))
    .clamp(0, 1)
    .toConst("opacityMul");

  return {
    worldCenter,
    surfaceAnchor,
    formedDir,
    shapedPos,
    opacityMul,
    captureWeight,
    dissolveT,
    flightPhaseT,
  };
};

const buildUnifiedParticleSurfaceNodes = ({
  particle,
  flight,
  uniforms,
  material,
  vNormalView,
  vPreEnterThickness,
  vOpacityMul,
  vSurfaceAnchor,
  vNearIntakePanel,
  vNearSpineAxis,
}) => {
  const particleHeat = particle.get("heat");
  const particleColor = particle.get("color").toConst("particleColor");
  const viewNormal = normalize(vNormalView).toConst("viewNormal");
  const viewFacingT = viewNormal.z.abs().clamp(0, 1).toConst("viewFacingT");

  const arrestStep = uniforms.postEnterLockMix
    .clamp(0, 1)
    .toConst("arrestStep");
  const extractStep = uniforms.postEnterExtractMix
    .clamp(0, 1)
    .toConst("extractStep");

  const quietStep = uniforms.postEnterQuietMix.clamp(0, 1).toConst("quietStep");

  const flightPhaseT = step(float(0.5), flight.get("flightPhase")).toConst(
    "surfaceFlightPhaseT",
  );

  const captureWeight = flight
    .get("captureWeight")
    .clamp(0, 1)
    .toConst("surfaceCaptureWeight");

  const dissolveT = flight
    .get("dissolve")
    .clamp(0, 1)
    .toConst("surfaceDissolve");

  const flightPhaseRaw = flight.get("flightPhase");

  /** Lock / intake look: arrest + extract + flight + quiet beat (no clearMix flip-flop). */
  const postEnterActive = step(
    float(1e-5),
    arrestStep
      .add(extractStep)
      .add(flightPhaseT.mul(float(0.001)))
      .add(quietStep.mul(float(0.85))),
  ).toConst("postEnterActive");

  /** Locked mineral look is GPU-owned (captureWeight + flight phase intake). */
  const captureLockedT = smoothstep(
    float(0.1),
    float(0.78),
    captureWeight,
  ).toConst("captureLockedT");
  const intakePhaseT = smoothstep(
    float(1.35),
    float(2.65),
    flightPhaseRaw,
  ).toConst("intakePhaseT");
  const spineReadProtect = vNearSpineAxis
    .mul(smoothstep(float(0.08), float(0.82), captureWeight))
    .clamp(0, 1)
    .toConst("spineReadProtect");

  const lockedDriver = max(captureLockedT, intakePhaseT)
    .mul(postEnterActive)
    .mul(mix(float(1), float(0.36), spineReadProtect))
    .clamp(0, 1)
    .toConst("lockedDriver");

  const albedoToLockedT = lockedDriver.toConst("albedoToLockedT");

  const openT = float(1).sub(arrestStep).toConst("openT");
  const viewThicknessT = vPreEnterThickness
    .mul(openT)
    .clamp(0, 1)
    .toConst("viewThicknessT");

  const freezeSpace = buildFreezeSpaceState({
    position: vSurfaceAnchor.toConst("surfaceAnchor"),
    center: uniforms.freezeCenter,
    boundsMin: uniforms.freezeBoundsMin,
    boundsMax: uniforms.freezeBoundsMax,
    name: "freezeSurface",
  });

  const cavityTint = vec3(...POST_ENTER_MATERIAL.cavityTint);
  const bodyTint = vec3(...POST_ENTER_MATERIAL.bodyTint);
  const ridgeTint = vec3(...POST_ENTER_MATERIAL.ridgeTint);
  const emissiveTint = vec3(...POST_ENTER_MATERIAL.emissiveTint);

  const bodyShape = freezeSpace.band
    .mul(POST_ENTER_SURFACE_READ.bodyBandWeight)
    .add(freezeSpace.core.mul(POST_ENTER_SURFACE_READ.bodyCoreWeight))
    .add(POST_ENTER_SURFACE_READ.bodyBias)
    .clamp(0, POST_ENTER_SURFACE_READ.bodyMax)
    .toConst("bodyShape");

  const ridgeShape = freezeSpace.core
    .mul(POST_ENTER_SURFACE_READ.ridgeCoreWeight)
    .add(freezeSpace.band.mul(POST_ENTER_SURFACE_READ.ridgeBandWeight))
    .add(viewFacingT.mul(POST_ENTER_SURFACE_READ.ridgeFacingWeight))
    .clamp(0, POST_ENTER_SURFACE_READ.ridgeMax)
    .toConst("ridgeShape");

  const lockedAlbedo = mix(cavityTint, bodyTint, bodyShape)
    .add(ridgeTint.mul(ridgeShape.mul(POST_ENTER_MATERIAL.ridgeStrength)))
    .toConst("lockedAlbedo");

  const lockedRoughness = float(POST_ENTER_MATERIAL.roughness)
    .sub(bodyShape.mul(POST_ENTER_MATERIAL.roughnessVariance))
    .sub(viewFacingT.mul(POST_ENTER_MATERIAL.facingLift))
    .clamp(0.72, 0.96)
    .toConst("lockedRoughness");

  const lockedEmissive = emissiveTint
    .mul(
      ridgeShape
        .mul(POST_ENTER_SURFACE_READ.emissiveRidgeWeight)
        .add(bodyShape.mul(POST_ENTER_SURFACE_READ.emissiveBodyWeight)),
    )
    .mul(POST_ENTER_MATERIAL.emissiveStrength)
    .mul(float(1).sub(dissolveT))
    .toConst("lockedEmissive");

  const roughNoise = fract(sin(instanceIndex.toFloat().mul(483.1)).mul(19847.3))
    .mul(0.12)
    .sub(0.06)
    .toConst("roughNoise");

  const openRoughness = float(0.92)
    .add(roughNoise)
    .clamp(0.86, 0.96)
    .sub(viewThicknessT.mul(0.075))
    .sub(viewFacingT.mul(viewThicknessT).mul(0.02))
    .clamp(0.8, 0.96)
    .toConst("openRoughness");

  const glowFactor = smoothstep(float(0.12), float(0.46), particleHeat).toConst(
    "glowFactor",
  );

  const openEmissive = vec3(0.36, 0.12, 0.03)
    .mul(glowFactor)
    .mul(float(0.01))
    .mul(float(1).sub(albedoToLockedT))
    .mul(float(1).sub(dissolveT))
    .toConst("openEmissive");

  const surfaceColor = mix(
    particleColor,
    lockedAlbedo,
    albedoToLockedT,
  ).toConst("surfaceColor");

  const roughToLockedT = albedoToLockedT.toConst("roughToLockedT");

  const surfaceRoughness = mix(openRoughness, lockedRoughness, roughToLockedT)
    .clamp(0.82, 0.98)
    .toConst("surfaceRoughness");

  const surfaceEmissive = mix(
    openEmissive,
    lockedEmissive,
    albedoToLockedT,
  ).toConst("surfaceEmissive");

  const cavityOcclusion = float(1)
    .sub(bodyShape.mul(float(0.12)))
    .clamp(0.62, 1)
    .toConst("cavityOcclusion");

  const aoOpen = mix(float(1.0), float(0.92), viewThicknessT)
    .add(viewThicknessT.mul(0.02))
    .clamp(0, 1)
    .toConst("aoOpen");

  const surfaceAo = mix(aoOpen, cavityOcclusion, roughToLockedT)
    .clamp(0, 1)
    .toConst("surfaceAo");

  const opacityGate = max(
    postEnterActive,
    flightPhaseT,
    smoothstep(float(0.04), float(0.55), dissolveT),
  ).toConst("opacityGate");

  const deadSurfaceT = step(float(3.99), flightPhaseRaw).toConst("deadSurfaceT");

  const opacityEffective = mix(float(1), vOpacityMul, opacityGate)
    .mul(mix(float(1), float(0.96), quietStep))
    .mul(
      mix(
        float(1),
        float(0.14),
        vNearIntakePanel.mul(
          smoothstep(float(0.06), float(0.72), captureWeight),
        ),
      ),
    )
    .mul(
      mix(
        float(1),
        float(0.2),
        vNearSpineAxis.mul(smoothstep(float(0.04), float(0.68), captureWeight)),
      ),
    )
    .mul(float(1).sub(deadSurfaceT))
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
  flight,
  uniforms,
  sizeUniform,
  vNormalView,
  vPreEnterThickness,
  vOpacityMul,
  vSurfaceAnchor,
  vNearIntakePanel,
  vNearSpineAxis,
}) =>
  Fn(() => {
    const simPos = particle.get("position").xyz.toConst("simPos");
    const particleDensity = particle.get("density");
    const particleDirection = particle.get("direction");
    const localPos = attribute("position").xyz;
    const speed = particle.get("velocity").length();

    const arrestT = uniforms.postEnterLockMix.clamp(0, 1).toConst("arrestT");
    const extractT = uniforms.postEnterExtractMix
      .clamp(0, 1)
      .toConst("extractT");
    const clearT = uniforms.postEnterClearMix.clamp(0, 1).toConst("clearT");
    const quietT = uniforms.postEnterQuietMix.clamp(0, 1).toConst("quietT");

    const dissolveFromFlight = flight.get("dissolve").clamp(0, 1);

    const postEnterLife = arrestT
      .add(extractT)
      .add(max(clearT, dissolveFromFlight))
      .add(quietT.mul(float(0.22)))
      .clamp(0, 1)
      .toConst("postEnterLife");

    const particleProfile = buildParticleProfileState({
      speed,
      particleDensity,
      convergenceFreeze: uniforms.convergenceFreeze.max(postEnterLife),
    });

    const drawState = buildParticleDrawState({
      simPos,
      particleDirection,
      flight,
      localPos,
      rodWidth: particleProfile.rodWidth,
      rodHeight: particleProfile.rodHeight,
      rodLength: particleProfile.rodLength,
      uniforms,
      vNearIntakePanel,
      vNearSpineAxis,
    });

    const viewState = buildParticleViewState({
      formedDir: drawState.formedDir,
      speed,
      vNormalView,
      vPreEnterThickness,
    });

    vOpacityMul.assign(drawState.opacityMul);
    vSurfaceAnchor.assign(drawState.surfaceAnchor);

    const vertexDensityScale = mix(
      particleProfile.densityScale,
      float(1),
      step(float(1e-5), postEnterLife),
    ).toConst("vertexDensityScale");

    return viewState.mat
      .mul(
        drawState.shapedPos.mul(
          sizeUniform.mul(PARTICLE_PROFILE_READ.instanceScale),
        ),
      )
      .mul(vertexDensityScale)
      .add(drawState.worldCenter);
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
const getParticleGeometryTemplate = () =>
  particleGeometryTemplate ??
  (particleGeometryTemplate = createRoundedBox(0.7, 0.7, 3, 0.1));

class ParticleRenderer {
  mlsMpmSim = null;
  postEnterFlightSystem = null;
  object = null;
  geometry = null;
  material = null;
  uniforms = {};

  runtime = {
    particles: 8192 * 4,
    actualSize: (1.6 / Math.pow(4, 1 / 3)) * 0.68,
    convergenceFreeze: 0,
  };

  constructor(mlsMpmSim, postEnterFlightSystem) {
    this.mlsMpmSim = mlsMpmSim;
    this.postEnterFlightSystem = postEnterFlightSystem;

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
    this.uniforms.postEnterLockMix = uniform(0);
    this.uniforms.postEnterExtractMix = uniform(0);
    this.uniforms.postEnterClearMix = uniform(0);
    this.uniforms.postEnterQuietMix = uniform(0);
    this.uniforms.chamberMin = uniform(new THREE.Vector3());
    this.uniforms.chamberMax = uniform(new THREE.Vector3());
    this.uniforms.riftSlitP0 = uniform(new THREE.Vector3());
    this.uniforms.riftSlitP1 = uniform(new THREE.Vector3());
    this.uniforms.freezeCenter = uniform(new THREE.Vector3());
    this.uniforms.freezeBoundsMin = uniform(new THREE.Vector3());
    this.uniforms.freezeBoundsMax = uniform(new THREE.Vector3());

    this._chamberMin = new THREE.Vector3();
    this._chamberMax = new THREE.Vector3();
    this._worldQuaternion = new THREE.Quaternion();
    this._worldScale = new THREE.Vector3();

    const vNormalView = varying(vec3(0), "vNormalView");
    const vPreEnterThickness = varying(0, "vPreEnterThickness");
    const vOpacityMul = varying(1, "vOpacityMul");
    const vSurfaceAnchor = varying(vec3(0), "vSurfaceAnchor");
    const vNearIntakePanel = varying(0, "vNearIntakePanel");
    const vNearSpineAxis = varying(0, "vNearSpineAxis");

    const particle = this.mlsMpmSim.particleBuffer.element(instanceIndex);
    const flight = this.postEnterFlightSystem.flightBuffer.buffer.element(
      instanceIndex,
    );

    this.material.positionNode = buildParticlePositionNode({
      particle,
      flight,
      uniforms: this.uniforms,
      sizeUniform: this.uniforms.size,
      vNormalView,
      vPreEnterThickness,
      vOpacityMul,
      vSurfaceAnchor,
      vNearIntakePanel,
      vNearSpineAxis,
    });

    buildUnifiedParticleSurfaceNodes({
      particle,
      flight,
      uniforms: this.uniforms,
      material: this.material,
      vNormalView,
      vPreEnterThickness,
      vOpacityMul,
      vSurfaceAnchor,
      vNearIntakePanel,
      vNearSpineAxis,
    });

    this.object = new THREE.Mesh(this.geometry, this.material);
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

  applyPostEnterFrame(derived, context) {
    this.uniforms.postEnterLockMix.value = derived?.lockMix ?? 0;
    this.uniforms.postEnterExtractMix.value = derived?.extractMix ?? 0;
    this.uniforms.postEnterClearMix.value = derived?.clearMix ?? 0;
    this.uniforms.postEnterQuietMix.value = derived?.quietMix ?? 0;

    // Idle: rift/freeze refresh in `updateChamberBounds` (no stale post-enter uniforms).
    if (!context) return;

    this.uniforms.chamberMin.value.copy(context.chamberBoundsSim.min);
    this.uniforms.chamberMax.value.copy(context.chamberBoundsSim.max);
    this.uniforms.riftSlitP0.value.copy(context.riftSlitP0Sim);
    this.uniforms.riftSlitP1.value.copy(context.riftSlitP1Sim);
    this.uniforms.freezeCenter.value.copy(context.freezeSpaceSim.center);
    this.uniforms.freezeBoundsMin.value.copy(context.freezeSpaceSim.boundsMin);
    this.uniforms.freezeBoundsMax.value.copy(context.freezeSpaceSim.boundsMax);
  }

  applyRuntime(runtime) {
    if (runtime) this.runtime = runtime;
  }

  updateRuntimeUniforms() {
    this.uniforms.size.value = this.runtime.actualSize;
    this.uniforms.convergenceFreeze.value = this.runtime.convergenceFreeze;
    this.material.envMapIntensity = 0.12;

    // Stable policy: keep depthWrite on to reduce layer mush with transparency.
    this.material.transparent = true;
    this.material.depthWrite = true;

    this.object.castShadow = true;
    this.object.receiveShadow = true;
    this.object.visible = true;
  }

  /**
   * Idle path: chamber drives rift + freeze so uniforms never keep stale post-enter values.
   */
  syncIdleSpatialUniformsFromChamber() {
    const cmin = this._chamberMin;
    const cmax = this._chamberMax;
    if (
      ![
        cmin.x,
        cmin.y,
        cmin.z,
        cmax.x,
        cmax.y,
        cmax.z,
      ].every(Number.isFinite)
    ) {
      return;
    }
    if (
      !buildRiftAndExitFromChamberSim(
        cmin,
        cmax,
        _idleExitScratch,
        _idleRiftP0,
        _idleRiftP1,
      )
    ) {
      return;
    }
    this.uniforms.riftSlitP0.value.copy(_idleRiftP0);
    this.uniforms.riftSlitP1.value.copy(_idleRiftP1);

    _idleFreezeCenter.addVectors(cmin, cmax).multiplyScalar(0.5);
    _idleFreezeHalf
      .subVectors(cmax, cmin)
      .multiplyScalar(0.5 * POST_ENTER_FREEZE_SPACE_FRAC);
    this.uniforms.freezeCenter.value.copy(_idleFreezeCenter);
    this.uniforms.freezeBoundsMin.value
      .copy(_idleFreezeCenter)
      .sub(_idleFreezeHalf);
    this.uniforms.freezeBoundsMax.value
      .copy(_idleFreezeCenter)
      .add(_idleFreezeHalf);
  }

  updateChamberBounds() {
    computeChamberBoundsSimFromParticleObject(
      this.object,
      PREENTER_VESSEL,
      this._chamberMin,
      this._chamberMax,
    );
    this.uniforms.chamberMin.value.copy(this._chamberMin);
    this.uniforms.chamberMax.value.copy(this._chamberMax);
    this.syncIdleSpatialUniformsFromChamber();
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
    this.postEnterFlightSystem = null;
    this.uniforms = {};
  }

  update() {
    const lock = this.uniforms.postEnterLockMix?.value ?? 0;
    const ext = this.uniforms.postEnterExtractMix?.value ?? 0;
    const clr = this.uniforms.postEnterClearMix?.value ?? 0;
    const quiet = this.uniforms.postEnterQuietMix?.value ?? 0;

    if (lock < 1e-4 && ext < 1e-4 && clr < 1e-4 && quiet < 1e-4) {
      this.updateChamberBounds();
    }

    this.updateRuntimeUniforms();
    this.geometry.instanceCount = this.runtime.particles;
  }
}

export default ParticleRenderer;
