/*
 * Derived from holtsetio/flow — https://github.com/holtsetio/flow
 * MIT License, Copyright (c) 2025 Holtsetio. Full text: ./LICENSE.upstream
 *
 * The instanced particle renderer base is from the upstream project;
 * the surrounding material and formation systems are ours.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in the
 * Software without restriction, subject to the conditions in LICENSE.upstream. THE
 * SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
 */
import * as THREE from "three/webgpu";
import {
  Fn,
  attribute,
  vec2,
  vec3,
  vec4,
  float,
  varying,
  instanceIndex,
  mix,
  normalize,
  cross,
  mat3,
  normalLocal,
  normalView,
  transformNormalToView,
  mrt,
  uniform,
  smoothstep,
  pow,
  fract,
  sin,
  step,
  time,
  positionWorld,
  cameraWorldMatrix,
  modelWorldMatrix,
  modelWorldMatrixInverse,
} from "three/tsl";

import { forensicHoldReadIsolation } from "../post-enter/forensicPostEnter.js";
import {
  readResolvedFormationState,
  rotateByFormationQuaternion,
} from "../formations/formationField.js";
import { buildFormationShardGeometryData } from "../formations/formationShardGeometry.js";

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

// Half the shortest authored shard dimension (0.52 / 2), including the
// instance profile. Residual authority is measured against this radius rather
// than the unrelated global size scalar.
const SHARD_SHORT_RADIUS = 0.26 * PARTICLE_PROFILE_READ.instanceScale;

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

  return { mat, orientedNormalView };
};

const buildUnifiedParticleSurfaceNodes = ({
  particle,
  material,
  vNormalView,
  vFacingThickness,
  vFormationEnergy,
  uniforms,
  formationUniforms,
  settleW,
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

  // Lenox void look: silver body with cyan energy read driven by speed.
  const lenoxTintT = uniforms.lenoxTintT.clamp(0, 1).toConst("lenoxTintT");
  // Role bands from settle target w: 0 shell · 0.3 aura · 0.6 lid · 1 focal.
  const lenoxRoleW = settleW.clamp(0, 1).toConst("lenoxRoleW");
  const lenoxFocalT = smoothstep(float(0.85), float(0.98), lenoxRoleW)
    .mul(lenoxTintT)
    .toConst("lenoxFocalT");
  const lenoxLidT = smoothstep(float(0.5), float(0.62), lenoxRoleW)
    .mul(float(1).sub(lenoxFocalT))
    .mul(lenoxTintT)
    .toConst("lenoxLidT");
  const lenoxAuraT = smoothstep(float(0.18), float(0.3), lenoxRoleW)
    .mul(float(1).sub(smoothstep(float(0.5), float(0.62), lenoxRoleW)))
    .mul(lenoxTintT)
    .toConst("lenoxAuraT");

  // Legacy scenes still read solver velocity. Formation scenes instead use
  // the scroll-owned, per-slot activity authored in the position stage. This
  // decouples the material from slow MLS-MPM settling: a completed formation is
  // silver immediately, while its bounded pointer residual can still react.
  const formationActive = formationUniforms.formationActive
    .clamp(0, 1)
    .toConst("formationMaterialActive");
  const design01HeroT = uniforms.design01HeroT
    .clamp(0, 1)
    .toConst("design01HeroMaterialT");
  const solverEnergyT = smoothstep(float(0.24), float(1.9), particleSpeed)
    .mul(float(0.85))
    .toConst("solverEnergyT");
  const lenoxEnergyT = mix(
    solverEnergyT,
    vFormationEnergy.clamp(0, 1),
    formationActive,
  )
    .mul(uniforms.lenoxEnergyMul.clamp(0, 1))
    .clamp(float(0), float(1))
    .toConst("lenoxEnergyT");
  // Metal albedo IS the reflection tint (F0), so silver must sit bright;
  // the old 0.5-band read as fog once metalness went up.
  const lenoxSilverGain = uniforms.lenoxSilverGain.toConst("lenoxSilverGain");
  const lenoxSilver = vec3(0.74, 0.78, 0.83)
    .mul(lenoxSilverGain)
    .clamp(vec3(0), vec3(1));
  const lenoxSilverLift = vec3(0.88, 0.91, 0.95)
    .mul(lenoxSilverGain)
    .clamp(vec3(0), vec3(1));
  const lenoxCyan = vec3(0.24, 0.86, 1.0);
  const lenoxBody = mix(lenoxSilver, lenoxCyan, lenoxEnergyT.mul(float(0.08)))
    .toConst("lenoxBodyBase");
  const lenoxBodyLid = mix(lenoxBody, lenoxSilverLift, lenoxLidT.mul(0.5))
    .toConst("lenoxBodyLid");
  // Attention nodes get only a restrained cyan cast, never a glowing blob.
  const lenoxBodyFinal = mix(lenoxBodyLid, lenoxCyan, lenoxFocalT.mul(0.32))
    .toConst("lenoxBody");
  const graphiteT = formationUniforms.formationGraphiteT
    .clamp(0, 1)
    .toConst("formationGraphiteT");
  const allotropBody = mix(
    lenoxBodyFinal,
    vec3(0.055, 0.065, 0.078),
    graphiteT.mul(float(0.9)),
  ).toConst("allotropBody");

  const gravityT = uniforms.gravityT.clamp(0, 1).toConst("gravityMaterialT");
  const gravityColor = mix(vec3(0.3, 0.35, 0.42), particleColor, float(0.82))
    .toConst("gravityParticleColor");
  // Phase field: one substance tint over the finished colour. `substanceT` is 0
  // everywhere except in the phase-field lab, so every existing path renders
  // byte-identically. This is the ONLY change to the silver law — the material
  // question is answered by morphology and environment, not by more shader.
  const surfaceColorTinted = mix(
    mix(
      mix(surfaceColorBase, allotropBody, lenoxTintT),
      gravityColor,
      gravityT,
    ),
    uniforms.substanceColor,
    uniforms.substanceT.clamp(0, 1),
  ).toConst("surfaceColorTinted");

  // A.1a debug only: paint the coherent cohort so recruitment and release are
  // visible while tuning. Off by default and not a material feature — A.1c is
  // where coherence earns a real material response.
  const particleCoherence = particle.get("coherence").clamp(0, 1);
  const coherenceMaterialT = uniforms.coherenceMaterialT
    .clamp(0, 1)
    .toConst("coherenceMaterialT");
  const heroFieldMaterialT = uniforms.heroFieldMaterialT
    .clamp(0, 1)
    .toConst("heroFieldMaterialT");
  const heroFieldOrder = smoothstep(
    float(0.3),
    float(0.82),
    particleCoherence,
  ).toConst("heroFieldOrder");
  // Magenta, not cyan: the engine's own kinetic law already tints moving matter
  // cyan, so a cyan debug marker is indistinguishable from the base look — the
  // first version of this instrument could not measure what it was built for.
  const debugSurfaceColor = mix(
    surfaceColorTinted,
    vec3(1.0, 0.0, 0.55),
    particleCoherence.mul(uniforms.coherenceDebugT.clamp(0, 1)),
  );
  const heroToneHash = fract(
    sin(instanceIndex.toFloat().mul(51.73)).mul(43758.5453),
  );
  const heroPearl = mix(
    vec3(0.32, 0.38, 0.48),
    vec3(0.78, 0.86, 0.96),
    smoothstep(float(0.18), float(0.88), heroToneHash),
  );
  const heroSurface = mix(
    heroPearl,
    lenoxCyan,
    lenoxEnergyT.mul(float(0.34)),
  ).toConst("design01HeroSurface");
  // Disorder is black lacquer/graphite, not black metal. Its low metalness
  // preserves dark diffuse shape and the dielectric Fresnel highlight; only
  // coherence removes diffuse response and resolves into restrained silver.
  const heroFieldSurface = mix(
    vec3(0.055, 0.064, 0.078),
    vec3(0.5, 0.55, 0.62),
    heroFieldOrder,
  ).toConst("heroFieldSurface");
  const surfaceColor = mix(
    mix(debugSurfaceColor, heroSurface, design01HeroT),
    heroFieldSurface,
    heroFieldMaterialT,
  ).toConst("surfaceColor");

  // Die Front streift die Materie: ein schmales Gauss-Band um den Radius
  // lässt genau die Partikel aufleuchten, die die Kante gerade passiert —
  // die einzige Ausnahme vom "Cyan ist nur Kinetik"-Gesetz, und sie IST
  // Kinetik: die Welle trägt die Energie.
  const scanDist = positionWorld
    .sub(uniforms.scanOrigin)
    .length()
    .sub(uniforms.scanR)
    .div(float(0.5))
    .toConst("lenoxScanDist");
  const scanFlare = scanDist
    .mul(scanDist)
    .negate()
    .exp()
    .mul(uniforms.scanRim)
    .mul(lenoxTintT)
    .toConst("lenoxScanFlare");

  // No static emissive floor: resting silver emits nothing (color law);
  // cyan glow follows kinetic energy and the focal signal only.
  const lenoxEmissive = lenoxCyan
    .mul(
      lenoxEnergyT
        .mul(float(0.12))
        .add(lenoxFocalT.mul(uniforms.lenoxFocalBoost.mul(float(0.5))))
        .add(scanFlare.mul(float(0.55))),
    )
    .toConst("lenoxEmissive");
  const gravityEmissive = particleColor
    .mul(particleHeat)
    .mul(float(0.22))
    .toConst("gravityEmissive");
  const heroEmissive = heroSurface
    .mul(float(0.028))
    .add(lenoxCyan.mul(lenoxEnergyT).mul(float(0.18)))
    .mul(design01HeroT);
  const surfaceEmissive = mix(
    mix(surfaceEmissiveBase, lenoxEmissive, lenoxTintT),
    gravityEmissive,
    gravityT,
  ).add(heroEmissive).toConst("surfaceEmissive");

  const bloomSource = yellowPinEmissive.r
    .max(hotOrangeEmissive.r.mul(float(0.34)).mul(riftAuthorityT))
    .max(deepRedEmissive.r.mul(float(0.12)).mul(riftAuthorityT))
    .max(
      lenoxEnergyT
        .mul(float(0.09))
        .add(lenoxFocalT.mul(float(0.4)).mul(uniforms.lenoxFocalBoost))
        .mul(lenoxTintT),
    )
    .max(particleHeat.mul(float(0.18)).mul(gravityT))
    .max(lenoxEnergyT.mul(design01HeroT).mul(float(0.22)))
    .toConst("particleBloomSource");

  // Premium silver = one coherent sheen: per-particle roughness variation
  // stays minimal (strong variation reads as glitter, not liquid metal);
  // kinetic particles get only a slight wet-gloss lift.
  const lenoxSurfaceRoughness = uniforms.lenoxRoughness
    .add(roughNoise.mul(float(0.03)))
    .sub(lenoxEnergyT.mul(float(0.025)))
    .add(graphiteT.mul(float(0.08)))
    .clamp(float(0.05), float(0.92))
    .toConst("lenoxSurfaceRoughness");
  const phaseSurfaceRoughness = mix(
    lenoxSurfaceRoughness,
    lenoxSurfaceRoughness.mul(float(0.62)),
    particleCoherence,
  ).toConst("phaseSurfaceRoughness");
  const heroFieldRoughness = mix(
    float(0.34),
    uniforms.lenoxRoughness,
    heroFieldOrder,
  ).toConst("heroFieldRoughness");

  const chamberMetalness = mix(
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
  ).toConst("chamberMetalness");

  material.colorNode = surfaceColor;
  material.normalNode = mix(
    normalView,
    normalize(vNormalView),
    uniforms.orientedParticleNormalT
      .clamp(0, 1)
      .max(uniforms.primitiveT.clamp(0, 1)),
  );
  material.roughnessNode = mix(
    surfaceRoughness,
    mix(
      mix(lenoxSurfaceRoughness, phaseSurfaceRoughness, coherenceMaterialT),
      heroFieldRoughness,
      heroFieldMaterialT,
    ),
    lenoxTintT,
  );
  /** Hero Field only: dielectric graphite resolves into silver metal. */
  const heroFieldMetalness = mix(
    float(0.06),
    uniforms.lenoxMetalness,
    heroFieldOrder,
  ).toConst("heroFieldMetalness");

  material.metalnessNode = mix(
    chamberMetalness,
    mix(
      uniforms.lenoxMetalness,
      heroFieldMetalness,
      heroFieldMaterialT,
    ),
    lenoxTintT,
  );
  material.emissiveNode = mix(surfaceEmissive, vec3(0), heroFieldMaterialT);
  material.aoNode = surfaceAo;
  // Aura fog reads sparse and dim (Lenox); chamber path unchanged (auraT=0).
  const billboardUv = attribute("uv").mul(float(2)).sub(float(1));
  const billboardRadiusSq = billboardUv.dot(billboardUv);
  const billboardAlpha = smoothstep(float(0.72), float(1), billboardRadiusSq)
    .oneMinus()
    .clamp(0, 1);
  const legacyOpacity = opacityEffective
    .mul(mix(float(1), float(0.3), lenoxAuraT))
    .mul(mix(float(1), billboardAlpha, uniforms.primitiveT.clamp(0, 1)));
  const formationOpacity = mix(legacyOpacity, float(1), formationActive);
  const heroOpacity = billboardAlpha
    .mul(mix(float(0.72), float(0.98), lenoxEnergyT));
  material.opacityNode = mix(
    formationOpacity,
    heroOpacity,
    design01HeroT,
  );
  const formationAlphaTest = mix(
    mix(
      float(0),
      float(0.28),
      uniforms.primitiveT.clamp(0, 1),
    ),
    float(0),
    formationActive,
  );
  material.alphaTestNode = mix(
    formationAlphaTest,
    float(0.035),
    design01HeroT,
  );

  material.mrtNode = mrt({
    bloomIntensity: smoothstep(float(0.026), float(0.09), bloomSource)
      .mul(bloomSource)
      .mul(float(0.72))
      .mul(opacityEffective)
      .mul(postEnterMaterialT.max(lenoxTintT))
      .mul(heroFieldMaterialT.oneMinus())
      .clamp(float(0), float(1)),
  });
};

const buildParticlePositionNode = ({
  particle,
  uniforms,
  resolvedFormationBuffer,
  design01FlowBuffer,
  formationUniforms,
  sizeUniform,
  vNormalView,
  vFacingThickness,
  vFormationEnergy,
  settleW,
}) =>
  Fn(() => {
    const simPos = particle.get("position").xyz.toConst("simPos");
    const formationState = readResolvedFormationState(
      resolvedFormationBuffer,
      instanceIndex,
    );
    const formationActive = formationUniforms.formationActive
      .clamp(0, 1)
      .toConst("formationActive");
    const formationResidualEnvelope = sin(
      formationUniforms.formationProgress.clamp(0, 1).mul(Math.PI),
    )
      .max(float(0))
      .toConst("formationResidualEnvelope");
    const formationResidualRadius = sizeUniform
      .mul(float(SHARD_SHORT_RADIUS))
      .mul(mix(float(0.35), float(0.8), formationResidualEnvelope))
      .mul(formationState.residualScale)
      .toConst("formationResidualRadius");
    const formationResidual = simPos
      .sub(formationState.base)
      .toConst("formationResidual");
    const formationResidualLength = formationResidual
      .length()
      .toConst("formationResidualLength");
    const boundedFormationResidual = formationResidual
      .mul(
        formationResidualRadius
          .div(formationResidualLength.max(float(0.0001)))
          .min(float(1)),
      )
      .toConst("boundedFormationResidual");
    // Macro activity is a deterministic function of the same slot progress as
    // the geometry. Pointer energy comes from the bounded shared pointer field,
    // never from unbounded solver velocity. Both are exactly zero at a quiet
    // formation endpoint.
    const slotMorphActivity = formationState.progress
      .mul(float(1).sub(formationState.progress))
      .mul(float(4))
      .clamp(0, 1)
      .toConst("formationSlotMorphActivity");
    const pointerResidualActivity = formationState.pointerKernel
      .toConst("formationPointerResidualActivity");
    const design01HeroT = uniforms.design01HeroT
      .clamp(0, 1)
      .toConst("design01HeroT");
    const design01Flow = design01FlowBuffer
      .element(instanceIndex)
      .get("offset")
      .toConst("design01FlowState");
    vFormationEnergy.assign(
      slotMorphActivity
        .mul(float(0.3))
        .max(pointerResidualActivity.mul(float(0.58)))
        .max(design01Flow.w.mul(float(0.9)).mul(design01HeroT))
        .mul(formationActive),
    );

    const formationCenter = mix(
      formationUniforms.formationFromCenter,
      formationUniforms.formationToCenter,
      formationState.progress,
    ).toConst("design01FormationCenter");
    const centeredFormation = formationState.base
      .sub(formationCenter)
      .toConst("design01CenteredFormation");
    const driftAngle = sin(time.mul(float(0.19)))
      .mul(float(0.065))
      .add(sin(time.mul(float(0.11)).add(float(1.7))).mul(float(0.025)));
    const driftedFormation = vec3(
      centeredFormation.x.add(centeredFormation.z.mul(driftAngle)),
      centeredFormation.y,
      centeredFormation.z.sub(centeredFormation.x.mul(driftAngle)),
    );
    const breath = float(1).add(
      sin(time.mul(float(2.4))).mul(float(0.012)),
    );
    const idleHash = fract(
      sin(instanceIndex.toFloat().mul(63.17)).mul(43758.5453),
    );
    const idleCohort = smoothstep(float(0.84), float(0.98), idleHash);
    const radial = centeredFormation.div(
      centeredFormation.length().max(float(0.0001)),
    );
    const tangent = cross(radial, vec3(0, 1, 0));
    const circulation = tangent
      .mul(sin(time.mul(float(0.72)).add(idleHash.mul(Math.PI * 2))))
      .mul(idleCohort)
      .mul(float(0.16));
    const heroBase = formationCenter
      .add(driftedFormation.mul(breath))
      .add(circulation)
      .add(design01Flow.xyz)
      .toConst("design01HeroBase");
    const authoredFormationBase = mix(
      formationState.base,
      heroBase,
      design01HeroT,
    );
    const renderedSimPos = mix(
      simPos,
      authoredFormationBase.add(boundedFormationResidual),
      formationActive,
    ).toConst("renderedSimPos");
    const particleDensity = particle.get("density");
    const particleDirection = particle.get("direction");
    const localPos = attribute("position").xyz;
    const speed = particle.get("velocity").length();
    const particleCoherence = particle.get("coherence").clamp(0, 1);

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

    const physicalDirection = particleDirection.xyz
      .div(particleDirection.xyz.length().max(float(0.0001)))
      .toConst("physicalDirection");
    const formedDir = physicalDirection.toConst("formedDir");
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
    const formationNormalView = normalize(
      transformNormalToView(
        rotateByFormationQuaternion(normalLocal, formationState.rotation),
      ),
    ).toConst("formationNormalView");
    vNormalView.assign(
      mix(viewState.orientedNormalView, formationNormalView, formationActive),
    );

    const cameraRightWorld = cameraWorldMatrix[0].xyz.normalize();
    const cameraUpWorld = cameraWorldMatrix[1].xyz.normalize();
    const cameraRightLocal = modelWorldMatrixInverse
      .mul(vec4(cameraRightWorld, 0))
      .xyz.normalize();
    const cameraUpLocal = modelWorldMatrixInverse
      .mul(vec4(cameraUpWorld, 0))
      .xyz.normalize();
    const particleDirectionWorld = modelWorldMatrix
      .mul(vec4(particleDirection.xyz, 0))
      .xyz;
    const projectedDirection = vec2(
      particleDirectionWorld.dot(cameraRightWorld),
      particleDirectionWorld.dot(cameraUpWorld),
    );
    const projectedLength = projectedDirection.length();
    const screenDirection = mix(
      vec2(0, 1),
      projectedDirection.div(projectedLength.max(float(0.0001))),
      step(float(0.001), projectedLength),
    ).toConst("billboardScreenDirection");
    const screenAcross = vec2(screenDirection.y, screenDirection.x.negate());
    const alongLocal = cameraRightLocal
      .mul(screenDirection.x)
      .add(cameraUpLocal.mul(screenDirection.y));
    const acrossLocal = cameraRightLocal
      .mul(screenAcross.x)
      .add(cameraUpLocal.mul(screenAcross.y));
    const billboardOffset = acrossLocal
      .mul(localPos.x)
      .mul(particleProfile.rodWidth)
      .mul(widthJitter)
      .add(
        alongLocal
          .mul(localPos.y)
          .mul(finalRodLengthZ)
          .mul(float(1.16)),
      )
      .toConst("billboardOffset");
    const billboardDisc = attribute("uv").mul(float(2)).sub(float(1));
    const billboardNormalZ = float(1)
      .sub(billboardDisc.dot(billboardDisc))
      .max(float(0))
      .sqrt();
    const billboardNormalView = vec3(
      screenAcross.x
        .mul(billboardDisc.x)
        .add(screenDirection.x.mul(billboardDisc.y)),
      screenAcross.y
        .mul(billboardDisc.x)
        .add(screenDirection.y.mul(billboardDisc.y)),
      billboardNormalZ,
    ).normalize();
    vNormalView.assign(
      mix(vNormalView, billboardNormalView, uniforms.primitiveT.clamp(0, 1)),
    );
    vFacingThickness.assign(
      mix(vFacingThickness, float(0.46), uniforms.primitiveT.clamp(0, 1)),
    );

    // Lenox role scale: aura fog finer, focal glint tighter (0 in chamber).
    const posRoleW = settleW.clamp(0, 1).toConst("posRoleW");
    const posLenoxT = uniforms.lenoxTintT.clamp(0, 1).toConst("posLenoxT");
    const posAuraT = smoothstep(float(0.18), float(0.3), posRoleW)
      .mul(float(1).sub(smoothstep(float(0.5), float(0.62), posRoleW)))
      .mul(posLenoxT)
      .toConst("posAuraT");
    const posFocalT = smoothstep(float(0.85), float(0.98), posRoleW)
      .mul(posLenoxT)
      .toConst("posFocalT");
    const lenoxRoleScale = mix(float(1), float(0.68), posAuraT)
      .mul(mix(float(1), float(0.78), posFocalT))
      .toConst("lenoxRoleScale");

    const orientedShardShape = mix(
      viewState.mat.mul(shapedPos),
      rotateByFormationQuaternion(shapedPos, formationState.rotation),
      formationActive,
    ).toConst("orientedShardShape");
    const heroParticleHash = fract(
      sin(instanceIndex.toFloat().mul(27.91)).mul(43758.5453),
    );
    const heroParticleScale = mix(float(0.78), float(1.12), heroParticleHash);
    const heroBillboardOffset = cameraRightLocal
      .mul(localPos.x)
      .add(cameraUpLocal.mul(localPos.y).mul(float(0.78)))
      .mul(heroParticleScale)
      .toConst("design01HeroBillboardOffset");
    const primitiveShape = mix(
      mix(
        orientedShardShape,
        billboardOffset,
        uniforms.primitiveT.clamp(0, 1),
      ),
      heroBillboardOffset,
      design01HeroT,
    );
    const coherenceSize = mix(
      float(1),
      mix(float(1), float(1.14), particleCoherence),
      uniforms.coherenceMaterialT.clamp(0, 1),
    );

    return primitiveShape
      .mul(structureScale)
      .mul(
        sizeUniform
          .mul(PARTICLE_PROFILE_READ.instanceScale)
          .mul(uniforms.bodyScaleMul)
          .mul(lenoxRoleScale)
          .mul(coherenceSize),
      )
      .mul(mix(float(1), formationState.sizeScale, formationActive))
      .mul(particleProfile.densityScale)
      .add(renderedSimPos);
  })();

const createShardGeometry = () => {
  const data = buildFormationShardGeometryData();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(data.normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(data.uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  return geometry;
};

let particleGeometryTemplate = null;
export const getParticleGeometryTemplate = () =>
  particleGeometryTemplate ??
  (particleGeometryTemplate = createShardGeometry());

let billboardGeometryTemplate = null;
const getBillboardGeometryTemplate = () =>
  billboardGeometryTemplate ??
  (billboardGeometryTemplate = new THREE.PlaneGeometry(0.92, 1.18, 1, 1));

class ParticleRenderer {
  mlsMpmSim = null;
  object = null;
  geometry = null;
  material = null;
  uniforms = {};
  /** Dev (lenox proof): hide the particle body regardless of runtime state. */
  forceHidden = false;
  shadowsEnabled = true;
  formationOpaque = false;

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

    this._shardGeometry = new THREE.InstancedBufferGeometry().copy(
      getParticleGeometryTemplate(),
    );
    this._billboardGeometry = new THREE.InstancedBufferGeometry().copy(
      getBillboardGeometryTemplate(),
    );
    this.geometry = this._shardGeometry;
    this._shardGeometry.instanceCount = this.mlsMpmSim.numParticles;
    this._billboardGeometry.instanceCount = this.mlsMpmSim.numParticles;

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
    /** 1 = Lenox void look (silver/cyan, no ember read); 0 = chamber thermal look. */
    this.uniforms.lenoxTintT = uniform(0);
    /** Phase-field substance tint; 0 strength leaves every existing path intact. */
    this.uniforms.substanceColor = uniform(new THREE.Color(0xffffff));
    this.uniforms.substanceT = uniform(0);
    /** A.1a debug tint for the coherent cohort; 0 in every production path. */
    this.uniforms.coherenceDebugT = uniform(0);
    /** Hero Field: coherence drives the complete black/silver PBR law. */
    this.uniforms.heroFieldMaterialT = uniform(0);
    /** A.1c material range and A.1d primitive switch; both 0 elsewhere. */
    this.uniforms.coherenceMaterialT = uniform(0);
    /** Correct authored particle rotation on both sides of the A.1c comparison. */
    this.uniforms.orientedParticleNormalT = uniform(0);
    this.uniforms.primitiveT = uniform(0);
    this.uniforms.design01HeroT = uniform(0);
    /** Focal glint emissive gain (Lenox mode). */
    this.uniforms.lenoxFocalBoost = uniform(1);
    // Lenox silver-material channel — only blended in where lenoxTintT
    // masks it, so the chamber/post-enter material path stays byte-identical.
    this.uniforms.lenoxMetalness = uniform(0.85);
    this.uniforms.lenoxRoughness = uniform(0.3);
    this.uniforms.lenoxSilverGain = uniform(1);
    /** 0 silences kinetic cyan (wake handoff); 1 = normal energy read. */
    this.uniforms.lenoxEnergyMul = uniform(1);
    /** GRAVITY owns particle colour after First Contact. */
    this.uniforms.gravityT = uniform(0);
    /**
     * Rekonstruktions-Front (Rescue): dieselbe Welt-Radius-Prüfung wie im
     * Backdrop, damit die Materie an der Kante aufleuchtet WÄHREND die Kante
     * sie passiert — nicht global per Environment-Pop (peer-review trap #1).
     */
    this.uniforms.scanOrigin = uniform(new THREE.Vector3(0, 0, 0));
    this.uniforms.scanR = uniform(0);
    this.uniforms.scanRim = uniform(0);

    this._worldQuaternion = new THREE.Quaternion();
    this._worldScale = new THREE.Vector3();

    const vNormalView = varying(vec3(0), "vNormalView");
    const vFacingThickness = varying(0, "vFacingThickness");
    const vFormationEnergy = varying(0, "vFormationEnergy");
    const particle = this.mlsMpmSim.particleBuffer.element(instanceIndex);
    // Lenox role channel (settle target w); constant 0 for chamber authors.
    const settleW = this.mlsMpmSim.settleTargetBuffer
      .element(instanceIndex)
      .get("settleTarget").w;

    this.material.positionNode = buildParticlePositionNode({
      particle,
      uniforms: this.uniforms,
      resolvedFormationBuffer: this.mlsMpmSim.resolvedFormationBuffer,
      design01FlowBuffer: this.mlsMpmSim.design01FlowBuffer,
      formationUniforms: this.mlsMpmSim.uniforms,
      sizeUniform: this.uniforms.size,
      vNormalView,
      vFacingThickness,
      vFormationEnergy,
      settleW,
    });

    buildUnifiedParticleSurfaceNodes({
      particle,
      material: this.material,
      vNormalView,
      vFacingThickness,
      vFormationEnergy,
      uniforms: this.uniforms,
      formationUniforms: this.mlsMpmSim.uniforms,
      settleW,
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

  /**
   * Phase-field lab only. `strength` 0 restores the untouched silver law, so
   * the studio page and every other caller are unaffected by this uniform.
   */
  setCoherenceDebug(enabled) {
    if (!this.uniforms?.coherenceDebugT) return;
    this.uniforms.coherenceDebugT.value = enabled ? 1 : 0;
  }

  setCoherenceMaterial(enabled) {
    if (!this.uniforms?.coherenceMaterialT) return;
    this.uniforms.orientedParticleNormalT.value = 1;
    this.uniforms.coherenceMaterialT.value = enabled ? 1 : 0;
  }

  /** Hero Field only. Separate gate so no other experience is affected. */
  setHeroFieldMaterial(enabled) {
    if (!this.uniforms?.heroFieldMaterialT) return;
    this.uniforms.orientedParticleNormalT.value = 1;
    this.uniforms.heroFieldMaterialT.value = enabled ? 1 : 0;
  }

  setPrimitive(primitive) {
    if (!this._particleBodyMesh || !this.uniforms?.primitiveT) return;
    const billboard = primitive === "billboard";
    this.geometry = billboard ? this._billboardGeometry : this._shardGeometry;
    this._particleBodyMesh.geometry = this.geometry;
    this.uniforms.primitiveT.value = billboard ? 1 : 0;
  }

  setShadowsEnabled(enabled) {
    this.shadowsEnabled = enabled !== false;
    if (!this._particleBodyMesh) return;
    this._particleBodyMesh.castShadow = this.shadowsEnabled;
    this._particleBodyMesh.receiveShadow = this.shadowsEnabled;
  }

  setSubstance(hexColor, strength) {
    if (!this.uniforms?.substanceColor) return;
    this.uniforms.substanceColor.value.setHex(hexColor);
    this.uniforms.substanceT.value = Math.min(1, Math.max(0, strength));
  }

  applyRuntime(runtime) {
    if (runtime) this.runtime = runtime;
  }

  /**
   * Rekonstruktions-Front (Rescue): Welt-Radius + Kantenstärke, dieselben
   * Werte, die auch der Backdrop bekommt — EIN Ursprung, EINE Front.
   * origin ist optional (der Standard bleibt der einmal gesetzte Ursprung).
   */
  setScanFront(radius, rim, origin) {
    this.uniforms.scanR.value = Math.max(radius ?? 0, 0);
    this.uniforms.scanRim.value = Math.max(Math.min(rim ?? 0, 1), 0);
    if (origin) this.uniforms.scanOrigin.value.copy(origin);
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
    this.uniforms.lenoxTintT.value = this.runtime.lenoxTintT ?? 0;
    this.uniforms.design01HeroT.value = this.runtime.design01HeroActive ? 1 : 0;
    this.uniforms.lenoxFocalBoost.value = this.runtime.lenoxFocalBoost ?? 1;
    this.uniforms.lenoxMetalness.value = this.runtime.lenoxMetalness ?? 0.85;
    this.uniforms.lenoxRoughness.value = this.runtime.lenoxRoughness ?? 0.3;
    this.uniforms.lenoxSilverGain.value = this.runtime.lenoxSilverGain ?? 1;
    this.uniforms.lenoxEnergyMul.value = this.runtime.lenoxEnergyMul ?? 1;
    this.uniforms.gravityT.value =
      this.runtime.gravityCreationActive || this.runtime.gravityLivingActive ? 1 : 0;
    // Chamber stays at exactly 0.12; the silver mass needs the HDRI to have
    // something to mirror, so Lenox lerps the env up with lenoxTintT.
    const envLenoxT = Math.min(1, Math.max(0, this.runtime.lenoxTintT ?? 0));
    const envLenox = this.runtime.lenoxEnvIntensity ?? 1.35;
    this.material.envMapIntensity = 0.12 + (envLenox - 0.12) * envLenoxT;

    const lockedDissolve = false;
    const holdIsolationMode = this.runtime.postEnterActive
      ? forensicHoldReadIsolation()
      : null;
    const hideRods = holdIsolationMode === "crackOnly";
    const formationOpaque = this.runtime.formationOpaque === true;
    if (formationOpaque !== this.formationOpaque) {
      this.formationOpaque = formationOpaque;
      this.material.transparent = !formationOpaque;
      this.material.needsUpdate = true;
    }
    this.material.depthWrite = formationOpaque || !lockedDissolve;
    this.material.depthTest = true;
    this.material.alphaTest = 0;
    this.material.opacity = 1;

    if (this._particleBodyMesh) {
      this._particleBodyMesh.castShadow = this.shadowsEnabled && !lockedDissolve;
      this._particleBodyMesh.receiveShadow = this.shadowsEnabled;
      this._particleBodyMesh.visible = !hideRods && !this.forceHidden;
    }
  }

  dispose() {
    if (this.object?.parent) {
      this.object.parent.remove(this.object);
    }

    this._particleBodyMesh = null;
    this.object = null;
    this._shardGeometry?.dispose?.();
    this._billboardGeometry?.dispose?.();
    this.material?.dispose?.();
    this.geometry = null;
    this._shardGeometry = null;
    this._billboardGeometry = null;
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
