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

import { forensicHoldReadIsolation } from "../post-enter/forensicPostEnter.js";

const COMPRESS_EASE_EDGE0 = 0.03;
const COMPRESS_EASE_EDGE1 = 0.94;

const PARTICLE_PROFILE_READ = Object.freeze({
  speedBandStart: 1.2,
  speedBandEnd: 3.5,
  stretchGain: 0.55,
  stretchBias: 0.82,
  thinningPower: -0.4,
  freezeBandStart: 0.18,
  freezeBandEnd: 0.82,
  frozenWidth: 1.0,
  frozenHeight: 1.45,
  frozenLength: 0.28,
  compressedWidth: 0.88,
  compressedHeight: 0.78,
  compressedLength: 0.46,
  densityLift: 0.28,
  densityBias: 0.72,
  frozenDensity: 0.975,
  compressedDensity: 1.12,
  instanceScale: 1.08,
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
  uniforms.compressT.clamp(0, 1).toConst("compressTVisualRead");

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

  return {
    structuralReleaseT,
    structuralSurvival,
  };
};

const buildMaterialSubordinationState = ({ uniforms }) => {
  const materialSubordinationT = smoothstep(
    float(0.16),
    float(0.82),
    uniforms.convergenceFreeze.clamp(0, 1).mul(uniforms.solverLockedFloat),
  ).toConst("materialSubordinationT");

  // Cleanup state: post-lock particles are material memory/feedstock only.
  // Role families may still affect texture/decay elsewhere, but they no longer
  // author competing V silhouettes through distinct macro-carrier lanes.
  const sizeTarget = float(0.84).toConst("materialSubordinationSizeTarget");
  const opacityTarget = float(0.9).toConst(
    "materialSubordinationOpacityTarget",
  );
  const emissiveTarget = float(0.96).toConst(
    "materialSubordinationEmissiveTarget",
  );

  return {
    sizeMul: mix(float(1), sizeTarget, materialSubordinationT).toConst(
      "materialSubordinationSizeMul",
    ),
    opacityMul: mix(float(1), opacityTarget, materialSubordinationT).toConst(
      "materialSubordinationOpacityMul",
    ),
    emissiveMul: mix(float(1), emissiveTarget, materialSubordinationT).toConst(
      "materialSubordinationEmissiveMul",
    ),
  };
};

const buildParticleProfileState = ({
  speed,
  particleDensity,
  convergenceFreeze,
  compressT,
  thinT,
}) => {
  const stretch = smoothstep(
    float(PARTICLE_PROFILE_READ.speedBandStart),
    float(PARTICLE_PROFILE_READ.speedBandEnd),
    speed,
  )
    .mul(PARTICLE_PROFILE_READ.stretchGain)
    .add(PARTICLE_PROFILE_READ.stretchBias)
    .toConst("stretch");

  const stretchLengthCapped = stretch
    .clamp(float(0.75), float(1.1))
    .toConst("stretchLengthCapped");

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
    stretchLengthCapped,
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

  const rodWidthBase = rodWidthCompressed
    .mul(float(1).sub(thinLocal.mul(float(WITHDRAW_READ.thinWidthReduction))))
    .toConst("rodWidthBase");

  const rodHeightBase = rodHeightCompressed
    .mul(float(1).sub(thinLocal.mul(float(WITHDRAW_READ.thinHeightReduction))))
    .toConst("rodHeightBase");

  const rodLengthBase = rodLengthCompressed
    .mul(float(1).sub(thinLocal.mul(float(WITHDRAW_READ.thinLengthReduction))))
    .toConst("rodLengthBase");

  const frozenDensity = mix(
    particleDensity
      .mul(PARTICLE_PROFILE_READ.densityLift)
      .add(PARTICLE_PROFILE_READ.densityBias)
      .clamp(0, 1),
    float(PARTICLE_PROFILE_READ.frozenDensity),
    freezeShapeT,
  ).toConst("frozenDensity");

  const densityScaleBase = mix(
    mix(
      frozenDensity,
      float(PARTICLE_PROFILE_READ.compressedDensity),
      compressEase.mul(float(0.65)),
    ).clamp(0, 1.08),
    float(0.08),
    thinLocal,
  ).toConst("densityScaleBase");

  const rodWidth = rodWidthBase.toConst("rodWidth");
  const rodHeight = rodHeightBase.toConst("rodHeight");
  const rodLength = rodLengthBase.toConst("rodLength");
  const densityScale = densityScaleBase.toConst("densityScale");

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
  const particleSpeed = particle
    .get("velocity")
    .length()
    .toConst("particleSpeed");
  const simPos = particle.get("position").xyz.toConst("materialSimPos");
  const lateRelease = buildLateReleaseState({ uniforms });
  const materialSubordination = buildMaterialSubordinationState({ uniforms });
  const viewNormal = normalize(vNormalView).toConst("viewNormal");
  const viewFacingT = viewNormal.z.abs().clamp(0, 1).toConst("viewFacingT");

  const viewThicknessT = vFacingThickness.clamp(0, 1).toConst("viewThicknessT");

  const roughNoise = fract(sin(instanceIndex.toFloat().mul(483.1)).mul(19847.3))
    .mul(0.05)
    .sub(0.025)
    .toConst("roughNoise");

  const defaultSurfaceRoughness = float(0.92)
    .add(roughNoise)
    .clamp(0.86, 0.96)
    .sub(viewThicknessT.mul(0.075))
    .sub(viewFacingT.mul(viewThicknessT).mul(0.02))
    .clamp(0.8, 0.96)
    .toConst("defaultSurfaceRoughness");

  const glowFactor = smoothstep(float(0.12), float(0.46), particleHeat).toConst(
    "glowFactor",
  );

  const postEnterMaterialT = smoothstep(
    float(0.0),
    float(0.55),
    uniforms.materialClaimT.clamp(0, 1),
  ).toConst("postEnterMaterialT");

  const postEnterFlightTGlobal = uniforms.postEnterFlightT
    .clamp(0, 1)
    .toConst("postEnterFlightTGlobal");

  const riftProximityT = float(1)
    .sub(smoothstep(float(4.5), float(18.0), simPos.x.sub(float(32.0)).abs()))
    .clamp(float(0), float(1))
    .toConst("riftProximityT");

  const massDimT = uniforms.massDimT.clamp(0, 1).toConst("massDimT");

  const decayProgress = particle
    .get("dissolveState")
    .y.clamp(0, 1)
    .toConst("decayProgress");
  const absorbOpacityT = smoothstep(
    float(0.04),
    float(0.22),
    decayProgress,
  ).toConst("absorbOpacityT");

  // dissolveState.x stays sim-owned for absorb/contact; broad material must not follow
  // per-particle ramps (staggered delays would read as a center-out material wave).
  // Broad X-band rift shaping: full before flight; fades with global postEnterFlightT.
  const broadRiftMaterialT = riftProximityT
    .mul(float(1).sub(postEnterFlightTGlobal))
    .toConst("broadRiftMaterialT");

  // Post-enter: basalt body with sparse internal ember veins.
  // No global copper/lava floor. The mass stays dark; heat appears only as
  // selective accents so the rod field does not become a painted carpet.
  const thermalRedT = particleColor.r
    .sub(particleColor.b.mul(float(0.45)))
    .clamp(float(0), float(1))
    .toConst("thermalRedT");

  const motionHeatT = smoothstep(float(0.55), float(2.8), particleSpeed)
    .mul(postEnterMaterialT)
    .mul(float(1).sub(postEnterFlightTGlobal))
    .toConst("motionHeatT");

  const heatReadT = glowFactor
    .mul(float(0.82))
    .add(thermalRedT.mul(float(0.74)))
    .add(motionHeatT.mul(float(0.18)))
    .add(viewThicknessT.mul(float(0.08)))
    .clamp(float(0), float(1))
    .toConst("heatReadT");

  // Tame heat to 42% at full material claim — dark identity, not dead grey.
  const riftHeatGateT = mix(
    float(1.0),
    float(0.42),
    postEnterMaterialT.clamp(0, 1),
  ).toConst("riftHeatGateT");
  const riftHeatT = heatReadT
    .mul(
      float(0.48)
        .add(broadRiftMaterialT.mul(float(0.72)))
        .clamp(float(0), float(1.16)),
    )
    .mul(riftHeatGateT)
    .clamp(float(0), float(1))
    .toConst("riftHeatT");

  const riftAuthorityT = smoothstep(
    float(0.22),
    float(0.92),
    broadRiftMaterialT.mul(postEnterMaterialT),
  ).toConst("riftAuthorityT");

  const outerSubordinationT = postEnterMaterialT
    .mul(float(1).sub(riftProximityT))
    .clamp(float(0), float(1))
    .toConst("outerSubordinationT");

  const outerSubordinationScoped = outerSubordinationT
    .mul(float(1).sub(postEnterFlightTGlobal))
    .toConst("outerSubordinationScoped");

  const emberHash = fract(
    sin(instanceIndex.toFloat().mul(137.17)).mul(43758.5453),
  ).toConst("emberHash");

  const emberVeinT = smoothstep(
    float(0.58),
    float(0.9),
    emberHash
      .add(heatReadT.mul(float(0.28)))
      .add(motionHeatT.mul(float(0.04)))
      .clamp(float(0), float(1.12)),
  )
    .mul(riftHeatT)
    .mul(postEnterMaterialT)
    .toConst("emberVeinT");

  const lowRedMemoryT = heatReadT
    .mul(postEnterMaterialT)
    .mul(
      float(0.06)
        .add(riftAuthorityT.mul(float(0.38)))
        .clamp(float(0), float(0.42)),
    )
    .mul(riftHeatGateT)
    .toConst("lowRedMemoryT");

  // Diffuse dark-red material floor — not emissive, not a cone. Identity of hot basalt.
  const basaltRedMemoryT = postEnterMaterialT
    .mul(float(0.22).add(thermalRedT.mul(float(0.34))))
    .clamp(float(0), float(0.42))
    .toConst("basaltRedMemoryT");

  const basaltSurface = particleColor
    .mul(vec3(0.68, 0.22, 0.16))
    .add(vec3(0.018, 0.006, 0.004).mul(postEnterMaterialT))
    .add(vec3(0.13, 0.018, 0.005).mul(basaltRedMemoryT))
    .add(vec3(0.055, 0.004, 0.001).mul(lowRedMemoryT))
    .toConst("basaltSurface");

  const deepRedDiffuse = vec3(0.9, 0.01, 0.002)
    .mul(emberVeinT)
    .mul(float(0.72).add(riftAuthorityT.mul(float(0.38))))
    .toConst("deepRedDiffuse");

  const hotCoreT = smoothstep(
    float(0.91),
    float(0.995),
    emberHash
      .add(glowFactor.mul(float(0.34)))
      .add(thermalRedT.mul(float(0.32)))
      .add(motionHeatT.mul(float(0.05)))
      .clamp(float(0), float(1.08)),
  )
    .mul(riftHeatT)
    .mul(postEnterMaterialT)
    .toConst("hotCoreT");

  const postEnterSurfaceRoughness = float(0.7)
    .add(roughNoise.mul(0.42))
    .sub(hotCoreT.mul(float(0.3)))
    .clamp(float(0.52), float(0.8))
    .sub(viewThicknessT.mul(0.075))
    .sub(viewFacingT.mul(viewThicknessT).mul(0.028))
    .clamp(float(0.48), float(0.84))
    .toConst("postEnterSurfaceRoughness");

  const hotRedOrangeDiffuse = vec3(1.0, 0.065, 0.008)
    .mul(hotCoreT)
    .mul(float(0.26))
    .toConst("hotRedOrangeDiffuse");

  const postEnterColor = basaltSurface
    .add(deepRedDiffuse)
    .add(hotRedOrangeDiffuse)
    .toConst("postEnterColor");

  const surfaceColorBase = mix(
    particleColor,
    postEnterColor,
    postEnterMaterialT.mul(float(0.72)),
  )
    .clamp(vec3(0), vec3(1))
    .toConst("surfaceColorBase");

  const surfaceRoughness = mix(
    defaultSurfaceRoughness,
    postEnterSurfaceRoughness.clamp(0.68, 0.86),
    postEnterMaterialT,
  )
    .clamp(0.52, 0.88)
    .toConst("surfaceRoughness");

  const baseThermalEmissive = vec3(0.36, 0.12, 0.03)
    .mul(glowFactor)
    .mul(float(0.018))
    .mul(mix(float(1.0), float(1.6), postEnterMaterialT))
    .toConst("baseThermalEmissive");

  const lowMemoryEmissive = vec3(0.85, 0.1, 0.018)
    .mul(lowRedMemoryT)
    .mul(float(0.022))
    .toConst("lowMemoryEmissive");

  const deepRedEmissive = vec3(1.0, 0.018, 0.0035)
    .mul(emberVeinT)
    .mul(float(0.18))
    .toConst("deepRedEmissive");

  const hotOrangeEmissive = vec3(1.0, 0.075, 0.01)
    .mul(hotCoreT)
    .mul(float(0.14))
    .toConst("hotOrangeEmissive");

  const yellowPinT = smoothstep(
    float(0.985),
    float(1.0),
    emberHash
      .add(glowFactor.mul(float(0.38)))
      .add(thermalRedT.mul(float(0.26)))
      .clamp(float(0), float(1.02)),
  )
    .mul(hotCoreT)
    .toConst("yellowPinT");

  const yellowPinEmissive = vec3(1.0, 0.34, 0.045)
    .mul(yellowPinT)
    .mul(float(0.08))
    .toConst("yellowPinEmissive");

  const surfaceEmissiveBase = baseThermalEmissive
    .add(lowMemoryEmissive)
    .add(deepRedEmissive)
    .add(hotOrangeEmissive)
    .add(yellowPinEmissive)
    .mul(materialSubordination.emissiveMul)
    .toConst("surfaceEmissiveBase");

  const surfaceAo = mix(float(1.0), float(0.94), viewThicknessT)
    .add(viewThicknessT.mul(0.016))
    .clamp(0, 1)
    .toConst("surfaceAo");

  const opacityEffective = float(1)
    .sub(uniforms.opacityT.clamp(0, 1))
    .mul(lateRelease.structuralSurvival)
    .mul(float(1).sub(massDimT.mul(float(0.92))))
    .mul(float(1).sub(absorbOpacityT))
    .mul(materialSubordination.opacityMul)
    .mul(
      float(1)
        .sub(outerSubordinationScoped.mul(float(0.12)))
        .add(riftAuthorityT.mul(float(0.03)))
        .clamp(float(0.78), float(1.0)),
    )
    .clamp(0, 1)
    .toConst("opacityEffective");

  const surfaceColor = surfaceColorBase.toConst("surfaceColor");

  const surfaceEmissive = surfaceEmissiveBase.toConst("surfaceEmissive");

  const bloomSource = yellowPinEmissive.r
    .max(hotOrangeEmissive.r.mul(float(0.34)).mul(riftAuthorityT))
    .max(deepRedEmissive.r.mul(float(0.12)).mul(riftAuthorityT))
    .toConst("particleBloomSource");

  material.colorNode = surfaceColor;
  material.roughnessNode = surfaceRoughness;
  material.metalnessNode = mix(
    float(0.02),
    mix(
      float(0.06),
      float(0.15),
      hotCoreT
        .mul(float(0.55))
        .add(emberVeinT.mul(float(0.2)))
        .clamp(float(0), float(1)),
    ),
    postEnterMaterialT,
  );
  material.emissiveNode = surfaceEmissive;
  material.aoNode = surfaceAo;
  material.opacityNode = opacityEffective;

  material.mrtNode = mrt({
    bloomIntensity: smoothstep(float(0.026), float(0.09), bloomSource)
      .mul(bloomSource)
      .mul(float(0.72))
      .mul(opacityEffective)
      .mul(postEnterMaterialT)
      .clamp(float(0), float(1)),
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

    const positionPostEnterMaterialT = smoothstep(
      float(0.0),
      float(0.22),
      uniforms.materialClaimT.clamp(0, 1),
    ).toConst("positionPostEnterMaterialT");

    const positionPostEnterFlightT = uniforms.postEnterFlightT
      .clamp(0, 1)
      .toConst("positionPostEnterFlightT");

    // Per-particle flight: dissolveState.x = activation ramp; y = absorb progress.
    const positionFlightActiveT = particle
      .get("dissolveState")
      .x.clamp(0, 1)
      .toConst("positionFlightActiveT");
    const positionAbsorbT = particle
      .get("dissolveState")
      .y.clamp(0, 1)
      .toConst("positionAbsorbT");
    const positionContactStreakT = smoothstep(
      float(0.035),
      float(0.16),
      positionAbsorbT,
    )
      .mul(float(1).sub(smoothstep(float(0.16), float(0.28), positionAbsorbT)))
      .toConst("positionContactStreakT");

    const positionRiftProximityT = float(1)
      .sub(smoothstep(float(4.5), float(18.0), simPos.x.sub(float(32.0)).abs()))
      .clamp(float(0), float(1))
      .toConst("positionRiftProximityT");

    const positionBroadRiftT = positionRiftProximityT
      .mul(float(1).sub(positionPostEnterFlightT))
      .toConst("positionBroadRiftT");

    const positionRiftAuthorityT = smoothstep(
      float(0.22),
      float(0.92),
      positionBroadRiftT.mul(positionPostEnterMaterialT),
    ).toConst("positionRiftAuthorityT");

    const positionOuterSubordinationT = positionPostEnterMaterialT
      .mul(float(1).sub(positionRiftProximityT))
      .clamp(float(0), float(1))
      .toConst("positionOuterSubordinationT");

    const positionOuterSubordinationScoped = positionOuterSubordinationT
      .mul(float(1).sub(positionPostEnterFlightT))
      .toConst("positionOuterSubordinationScoped");

    // Outer subordination: keep rift hierarchy but avoid post-enter “fine dust”
    // read (was −30% / −44% silhouette + length with hard floors 0.66 / 0.48).
    const outerSilhouetteScale = float(1)
      .sub(positionOuterSubordinationScoped.mul(float(0.14)))
      .add(positionRiftAuthorityT.mul(float(0.01)))
      .clamp(float(0.84), float(1.0))
      .toConst("outerSilhouetteScale");

    const outerLengthScale = float(1)
      .sub(positionOuterSubordinationScoped.mul(float(0.2)))
      .add(positionRiftAuthorityT.mul(float(0.008)))
      .clamp(float(0.74), float(1.0))
      .toConst("outerLengthScale");

    const compressTVisualRead = buildCompressTVisualRead(uniforms);

    const particleProfile = buildParticleProfileState({
      speed,
      particleDensity,
      convergenceFreeze: uniforms.convergenceFreeze,
      compressT: compressTVisualRead,
      thinT: uniforms.thinT,
    });

    const shapeHash = fract(
      sin(instanceIndex.toFloat().mul(91.71)).mul(43758.5453),
    ).toConst("shapeHash");
    const flatHash = fract(
      sin(instanceIndex.toFloat().mul(171.31)).mul(24634.6345),
    ).toConst("flatHash");
    const shardFamilyT = smoothstep(
      float(0.22),
      float(0.92),
      shapeHash,
    ).toConst("shardFamilyT");

    const widthJitter = mix(float(0.78), float(1.22), shapeHash).toConst(
      "widthJitter",
    );
    const heightJitter = mix(float(0.72), float(1.12), flatHash).toConst(
      "heightJitter",
    );
    const lengthJitter = mix(float(0.72), float(1.28), shardFamilyT).toConst(
      "lengthJitter",
    );

    const needleT = smoothstep(float(0.88), float(0.98), shapeHash)
      .mul(smoothstep(float(0.18), float(0.7), speed))
      .toConst("needleT");

    const finalRodLengthZ = particleProfile.rodLength
      .mul(lengthJitter)
      .mul(mix(float(1.0), float(1.85), needleT))
      .toConst("finalRodLengthZ");

    const flightSpeedT = smoothstep(float(0.22), float(1.85), speed).toConst(
      "flightSpeedT",
    );

    const openFlightStretchT = positionFlightActiveT
      .mul(float(1).sub(smoothstep(float(0.035), float(0.18), positionAbsorbT)))
      .toConst("openFlightStretchT");

    const flightStretchFactor = float(1)
      .add(
        flightSpeedT.mul(
          openFlightStretchT
            .mul(float(0.22))
            .add(positionContactStreakT.mul(float(1.05))),
        ),
      )
      .toConst("flightStretchFactor");
    const flightThinFactor = float(1)
      .sub(
        flightStretchFactor
          .sub(1)
          .mul(float(0.24))
          .clamp(float(0), float(0.32)),
      )
      .toConst("flightThinFactor");

    const formedDir = normalize(particleDirection.xyz).toConst("formedDir");
    const shapedPos = vec3(
      localPos.x
        .mul(particleProfile.rodWidth)
        .mul(outerSilhouetteScale)
        .mul(widthJitter)
        .mul(flightThinFactor),
      localPos.y
        .mul(particleProfile.rodHeight)
        .mul(outerSilhouetteScale)
        .mul(heightJitter)
        .mul(flightThinFactor),
      localPos.z
        .mul(outerLengthScale)
        .mul(finalRodLengthZ)
        .mul(flightStretchFactor),
    ).toConst("shapedPos");

    const lateRelease = buildLateReleaseState({ uniforms });
    const materialSubordination = buildMaterialSubordinationState({ uniforms });
    const structureScale = lateRelease.structuralSurvival
      .mul(materialSubordination.sizeMul)
      .toConst("structureScale");

    const viewState = buildParticleViewState({
      formedDir,
      speed,
      vNormalView,
      vFacingThickness,
    });

    return viewState.mat
      .mul(shapedPos.mul(structureScale))
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

/**
 * Chunky pre-enter shard: same topology as rounded box, light vertex shear so
 * instances do not read as one uniform extrusion.
 */
const createShardGeometry = () => {
  const geom = createRoundedBox(0.82, 0.52, 1.18, 0.08);
  const pos = geom.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const h1 = Math.sin(i * 12.9898 + x * 78.233) * 43758.5453;
    const f1 = h1 - Math.floor(h1);
    const h2 = Math.sin(i * 93.989 + y * 12.4) * 23421.123;
    const f2 = h2 - Math.floor(h2);
    const h3 = Math.sin(i * 45.1 + z * 33.7) * 91234.56;
    const f3 = h3 - Math.floor(h3);
    pos.setX(i, x + (f1 - 0.5) * 0.07);
    pos.setY(i, y + (f2 - 0.5) * 0.055);
    pos.setZ(i, z + (f3 - 0.5) * 0.08);
  }
  geom.computeVertexNormals();
  return geom;
};

let particleGeometryTemplate = null;
export const getParticleGeometryTemplate = () =>
  particleGeometryTemplate ??
  (particleGeometryTemplate = createShardGeometry());

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
    solverLocked: false,
    materialClaimT: 0,
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
    this.uniforms.thinT = uniform(0);
    this.uniforms.opacityT = uniform(0);
    this.uniforms.solverLockedFloat = uniform(0);
    this.uniforms.materialClaimT = uniform(0);
    this.uniforms.postEnterFlightT = uniform(0);

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
    // Conversation-layer envelope channels (sourceChamberDrive); default 0
    // keeps idle and post-enter rendering byte-identical.
    this.uniforms.massDimT.value = this.runtime.massDimT ?? 0;
    this.uniforms.compressT.value = this.runtime.compressT ?? 0;
    this.uniforms.thinT.value = this.runtime.thinT ?? 0;
    this.uniforms.opacityT.value = this.runtime.opacityT ?? 0;
    this.uniforms.solverLockedFloat.value = this.runtime.solverLocked ? 1 : 0;
    this.uniforms.materialClaimT.value = this.runtime.materialClaimT ?? 0;
    this.uniforms.postEnterFlightT.value = this.runtime.postEnterFlightT ?? 0;
    this.material.envMapIntensity = 0.12;

    const lockedDissolve = false;
    const holdIsolationMode = this.runtime.postEnterActive
      ? forensicHoldReadIsolation()
      : null;
    const hideRods = holdIsolationMode === "crackOnly";
    this.material.transparent = true;
    this.material.depthWrite = !lockedDissolve;

    if (this._particleBodyMesh) {
      this._particleBodyMesh.castShadow = !lockedDissolve;
      this._particleBodyMesh.visible = !hideRods;
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
