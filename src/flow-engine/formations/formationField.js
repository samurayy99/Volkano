import {
  cos,
  cross,
  float,
  mix,
  sin,
  smoothstep,
  step,
  vec3,
  vec4,
} from "three/tsl";

export const normalizeFormationQuaternion = (quaternion) => {
  const magnitude = quaternion.length().toConst();
  return mix(
    vec4(0, 0, 0, 1),
    quaternion.div(magnitude.max(float(0.0001))),
    step(float(0.0001), magnitude),
  );
};

export const multiplyFormationQuaternions = (left, right) => vec4(
  left.w.mul(right.x).add(left.x.mul(right.w)).add(left.y.mul(right.z)).sub(left.z.mul(right.y)),
  left.w.mul(right.y).sub(left.x.mul(right.z)).add(left.y.mul(right.w)).add(left.z.mul(right.x)),
  left.w.mul(right.z).add(left.x.mul(right.y)).sub(left.y.mul(right.x)).add(left.z.mul(right.w)),
  left.w.mul(right.w).sub(left.x.mul(right.x)).sub(left.y.mul(right.y)).sub(left.z.mul(right.z)),
);

export const rotateByFormationQuaternion = (value, quaternion) => {
  const q = normalizeFormationQuaternion(quaternion);
  const twiceCross = cross(q.xyz, value).mul(float(2));
  return value.add(twiceCross.mul(q.w)).add(cross(q.xyz, twiceCross));
};

const safeNormalizeDirection = (value, fallback) => {
  const magnitude = value.length();
  return mix(
    fallback,
    value.div(magnitude.max(float(0.0001))),
    step(float(0.0001), magnitude),
  );
};

const fallbackDirection = (index) => safeNormalizeDirection(
  vec3(
    sin(index.toFloat().mul(12.9898).add(0.31)),
    sin(index.toFloat().mul(78.233).add(1.17)),
    sin(index.toFloat().mul(37.719).add(2.41)),
  ),
  vec3(1, 0, 0),
);

/**
 * Shared TSL macro geometry. The compute resolve owns the one scroll/pointer
 * base and the one quaternion used later by both the solver and renderer.
 */
export function buildFormationState(buffer, index, progress, uniforms) {
  const data = buffer.element(index);
  const fromPosition = data.get("fromPosition");
  const toPosition = data.get("toPosition");
  const fromRotation = data.get("fromRotation");
  const toRotation = data.get("toRotation");
  const route = data.get("route");
  const params = data.get("params");
  const p = progress.clamp(0, 1);
  const authoredTransportT = float(1).sub(step(float(0.8), route.w))
    .toConst("formationAuthoredTransportT");
  const heroTransportT = float(1).sub(step(float(0.4), route.w))
    .toConst("formationHeroTransportT");
  const triAxisTransportT = step(float(0.4), route.w)
    .mul(float(1).sub(step(float(0.5), route.w)))
    .toConst("formationTriAxisTransportT");
  const vectorLoomTransportT = step(float(0.6), route.w)
    .mul(float(1).sub(step(float(0.7), route.w)))
    .toConst("formationVectorLoomTransportT");
  const forwardVectorTransportT = step(float(0.7), route.w)
    .mul(float(1).sub(step(float(0.8), route.w)))
    .toConst("formationForwardVectorTransportT");
  const standardQ = smoothstep(params.x.mul(0.22), float(1), p);
  const baseAuthoredStart = params.x.mul(mix(float(0.78), float(0.82), heroTransportT));
  const stagedStart = mix(baseAuthoredStart, params.x.mul(float(0.74)), triAxisTransportT);
  const loomStart = mix(stagedStart, params.x.mul(float(0.72)), vectorLoomTransportT);
  const authoredStart = mix(loomStart, params.x.mul(float(0.7)), forwardVectorTransportT);
  const stagedWindow = mix(
    mix(float(0.14), float(0.12), heroTransportT),
    float(0.16),
    triAxisTransportT,
  );
  const loomWindow = mix(stagedWindow, float(0.12), vectorLoomTransportT);
  const authoredWindow = mix(loomWindow, float(0.075), forwardVectorTransportT);
  const authoredQ = smoothstep(authoredStart, authoredStart.add(authoredWindow), p);
  const q = mix(standardQ, authoredQ, authoredTransportT)
    .toConst("formationSlotProgress");
  const arc = route.xyz
    .mul(sin(q.mul(Math.PI)))
    .mul(params.y)
    .toConst("formationArc");
  const formationCenter = mix(
    uniforms.formationFromCenter,
    uniforms.formationToCenter,
    q,
  ).toConst("formationInteractionCenter");
  const slotFallback = fallbackDirection(index).toConst("formationSlotFallback");
  const fromOffset = fromPosition.xyz.sub(uniforms.formationFromCenter);
  const toOffset = toPosition.xyz.sub(uniforms.formationToCenter);
  const fromDirection = safeNormalizeDirection(fromOffset, slotFallback);
  const toDirection = safeNormalizeDirection(toOffset, fromDirection);
  const shellDirection = safeNormalizeDirection(
    mix(fromDirection, toDirection, q),
    fromDirection,
  );
  const shellBase = formationCenter
    .add(shellDirection.mul(mix(fromOffset.length(), toOffset.length(), q)))
    .toConst("formationShellBase");
  const linearBase = mix(fromPosition.xyz, toPosition.xyz, q)
    .toConst("formationLinearBase");
  const settlePhase = smoothstep(float(0.72), float(1), q);
  const overshootStrength = heroTransportT.mul(float(0.16))
    .add(triAxisTransportT.mul(float(0.1)))
    .add(vectorLoomTransportT.mul(float(0.12)))
    .add(forwardVectorTransportT.mul(float(0.08)));
  const controlledOvershoot = sin(settlePhase.mul(Math.PI))
    .mul(overshootStrength)
    .toConst("formationControlledOvershoot");
  const shellTransportT = authoredTransportT
    .mul(float(1).sub(triAxisTransportT))
    .mul(float(1).sub(forwardVectorTransportT));
  const scrollBase = mix(linearBase, shellBase, shellTransportT)
    .add(arc)
    .add(toPosition.xyz.sub(fromPosition.xyz).mul(controlledOvershoot))
    .toConst("formationScrollBase");
  const sizeScale = mix(fromPosition.w, toPosition.w, q)
    .max(float(0.01))
    .toConst("formationSizeScale");
  const graphiteT = uniforms.formationGraphiteT.clamp(0, 1)
    .toConst("formationGraphiteInteractionT");
  const interactionBudget = params.z
    .min(mix(float(0.9), float(2.2), graphiteT))
    .max(float(0.01))
    .toConst("formationInteractionBudget");

  const blendedRotation = mix(fromRotation, toRotation, q);
  const scrollRotation = normalizeFormationQuaternion(blendedRotation)
    .toConst("formationScrollRotation");

  const rayDirection = safeNormalizeDirection(
    uniforms.mouseRayDirection,
    vec3(0, 0, -1),
  )
    .toConst("formationPointerRayDirection");
  const fromRayOrigin = scrollBase.sub(uniforms.mouseRayOrigin)
    .toConst("formationPointerFromOrigin");
  const closestOnRay = uniforms.mouseRayOrigin
    .add(rayDirection.mul(fromRayOrigin.dot(rayDirection)))
    .toConst("formationPointerClosest");
  const rawOutward = scrollBase.sub(closestOnRay)
    .toConst("formationPointerRawOutward");
  const rayDistance = rawOutward.length().toConst("formationPointerDistance");
  const fallback = fallbackDirection(index).toConst("formationPointerFallback");
  const safeOutward = mix(
    fallback,
    rawOutward.div(rayDistance.max(float(0.0001))),
    step(float(0.0001), rayDistance),
  );
  const rawRadial = scrollBase.sub(formationCenter);
  const radialLength = rawRadial.length();
  const radial = mix(
    vec3(0, 1, 0),
    rawRadial.div(radialLength.max(float(0.0001))),
    step(float(0.0001), radialLength),
  );
  const voidProtection = float(1).sub(graphiteT)
    .toConst("formationVoidProtection");
  const withoutInward = safeOutward
    .sub(
      radial
        .mul(safeOutward.dot(radial).min(float(0)))
        .mul(voidProtection),
    )
    .toConst("formationPointerWithoutInward");
  const withoutInwardLength = withoutInward.length();
  const sideFallback = cross(rayDirection, radial);
  const sideFallbackLength = sideFallback.length();
  const resolvedFallback = mix(
    fallback,
    sideFallback.div(sideFallbackLength.max(float(0.0001))),
    step(float(0.0001), sideFallbackLength),
  );
  const outward = mix(
    resolvedFallback,
    withoutInward.div(withoutInwardLength.max(float(0.0001))),
    step(float(0.0001), withoutInwardLength),
  ).toConst("formationPointerOutward");
  const pointerKernel = float(1).sub(smoothstep(float(2.5), float(9), rayDistance))
    .mul(uniforms.formationPointerEnergy.clamp(0, 1))
    .clamp(0, 1)
    .toConst("formationPointerKernel");
  const pointerOffset = outward
    .mul(interactionBudget)
    .mul(uniforms.formationPointerScale.max(float(0)))
    .mul(pointerKernel)
    .toConst("formationPointerOffset");
  const base = scrollBase.add(pointerOffset).toConst("formationBasePosition");

  const forward = rotateByFormationQuaternion(vec3(0, 0, 1), scrollRotation);
  const rawTiltAxis = cross(forward, outward);
  const tiltAxisLength = rawTiltAxis.length();
  const tiltFallback = cross(forward, rayDirection);
  const tiltFallbackLength = tiltFallback.length();
  const safeTiltFallback = mix(
    vec3(0, 1, 0),
    tiltFallback.div(tiltFallbackLength.max(float(0.0001))),
    step(float(0.0001), tiltFallbackLength),
  );
  const tiltAxis = mix(
    safeTiltFallback,
    rawTiltAxis.div(tiltAxisLength.max(float(0.0001))),
    step(float(0.0001), tiltAxisLength),
  );
  const maxTilt = mix(
    float(10 * Math.PI / 180),
    float(18 * Math.PI / 180),
    graphiteT,
  );
  const halfTilt = maxTilt.mul(pointerKernel).mul(float(0.5));
  const tiltRotation = vec4(
    tiltAxis.mul(sin(halfTilt)),
    cos(halfTilt),
  );
  const rotation = normalizeFormationQuaternion(
    multiplyFormationQuaternions(tiltRotation, scrollRotation),
  ).toConst("formationRotation");

  return {
    base,
    rotation,
    q,
    sizeScale,
    interactionBudget,
    pointerKernel,
    residualScale: route.w.max(float(0.05)),
  };
}

/** Read the once-per-particle state produced by the formation resolve kernel. */
export function readResolvedFormationState(buffer, index) {
  const data = buffer.element(index);
  const base = data.get("base");
  const state = data.get("state");
  return {
    base: base.xyz,
    residualScale: base.w.max(float(0.05)),
    rotation: data.get("rotation"),
    progress: state.x.clamp(0, 1),
    sizeScale: state.y.max(float(0.01)),
    interactionBudget: state.z.max(float(0.01)),
    pointerKernel: state.w.clamp(0, 1),
  };
}
