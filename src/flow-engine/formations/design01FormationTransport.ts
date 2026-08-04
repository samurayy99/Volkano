type FormationBank = {
  positions: Float32Array;
  rotations: Float32Array;
  sizeScales: Float32Array;
  interactionBudgets: Float32Array;
  groups: Uint16Array;
};

type Bounds = {
  min: [number, number, number];
  span: [number, number, number];
};

const quantize = (value: number) =>
  Math.max(0, Math.min(1023, Math.round(value * 1023)));

const spread10 = (value: number) => {
  let result = value & 0x3ff;
  result = (result | (result << 16)) & 0x030000ff;
  result = (result | (result << 8)) & 0x0300f00f;
  result = (result | (result << 4)) & 0x030c30c3;
  result = (result | (result << 2)) & 0x09249249;
  return result >>> 0;
};
const bankBounds = (positions: Float32Array): Bounds => {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], positions[index + axis]);
      max[axis] = Math.max(max[axis], positions[index + axis]);
    }
  }
  return {
    min,
    span: min.map((value, axis) => Math.max(max[axis] - value, 1e-6)) as Bounds["span"],
  };
};

const mortonKey = (
  positions: Float32Array,
  index: number,
  bounds: Bounds,
) => {
  const x = quantize((positions[index * 3] - bounds.min[0]) / bounds.span[0]);
  const y = quantize((positions[index * 3 + 1] - bounds.min[1]) / bounds.span[1]);
  const z = quantize((positions[index * 3 + 2] - bounds.min[2]) / bounds.span[2]);
  return (spread10(x) | (spread10(y) << 1) | (spread10(z) << 2)) >>> 0;
};
const spatialOrder = (positions: Float32Array) => {
  const count = positions.length / 3;
  const bounds = bankBounds(positions);
  return Array.from({ length: count }, (_, index) => index).sort((left, right) => {
    const delta = mortonKey(positions, left, bounds) - mortonKey(positions, right, bounds);
    return delta || left - right;
  });
};

const copySlot = (
  source: FormationBank,
  sourceIndex: number,
  target: FormationBank,
  targetIndex: number,
) => {
  target.positions.set(
    source.positions.subarray(sourceIndex * 3, sourceIndex * 3 + 3),
    targetIndex * 3,
  );
  target.rotations.set(
    source.rotations.subarray(sourceIndex * 4, sourceIndex * 4 + 4),
    targetIndex * 4,
  );
  target.sizeScales[targetIndex] = source.sizeScales[sourceIndex];
  target.interactionBudgets[targetIndex] = source.interactionBudgets[sourceIndex];
  target.groups[targetIndex] = source.groups[sourceIndex];
};
export function spatiallyMatchFormationTarget(
  from: FormationBank,
  to: FormationBank,
): FormationBank {
  const count = from.positions.length / 3;
  if (to.positions.length / 3 !== count) {
    throw new Error("DESIGN 01 transport requires equal source and target populations.");
  }
  if (count === 0) return to;

  const fromOrder = spatialOrder(from.positions);
  const toOrder = spatialOrder(to.positions);
  const matched: FormationBank = {
    positions: new Float32Array(to.positions.length),
    rotations: new Float32Array(to.rotations.length),
    sizeScales: new Float32Array(to.sizeScales.length),
    interactionBudgets: new Float32Array(to.interactionBudgets.length),
    groups: new Uint16Array(to.groups.length),
  };

  for (let rank = 0; rank < count; rank += 1) {
    copySlot(to, toOrder[rank], matched, fromOrder[rank]);
  }
  return matched;
}

const subsetBounds = (
  positions: Float32Array,
  indices: readonly number[],
): Bounds => {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const index of indices) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[index * 3 + axis];
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
  }
  return {
    min,
    span: min.map((value, axis) => Math.max(max[axis] - value, 1e-6)) as Bounds["span"],
  };
};

const spatialOrderForIndices = (
  positions: Float32Array,
  indices: readonly number[],
) => {
  const bounds = subsetBounds(positions, indices);
  return [...indices].sort((left, right) => {
    const delta = mortonKey(positions, left, bounds) - mortonKey(positions, right, bounds);
    return delta || left - right;
  });
};
const groupIndices = (groups: Uint16Array) => {
  const cohorts = new Map<number, number[]>();
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    const cohort = cohorts.get(group);
    if (cohort) cohort.push(index);
    else cohorts.set(group, [index]);
  }
  return cohorts;
};

export function matchFormationTargetByGroup(
  from: FormationBank,
  to: FormationBank,
): FormationBank {
  const count = from.positions.length / 3;
  if (to.positions.length / 3 !== count) {
    throw new Error("DESIGN 01 grouped transport requires equal source and target populations.");
  }
  if (count === 0) return to;

  const fromGroups = groupIndices(from.groups);
  const toGroups = groupIndices(to.groups);
  const fromIds = [...fromGroups.keys()].sort((left, right) => left - right);
  const toIds = [...toGroups.keys()].sort((left, right) => left - right);
  if (fromIds.length !== toIds.length || fromIds.some((group, index) => group !== toIds[index])) {
    throw new Error("DESIGN 01 grouped transport requires identical cohort identifiers.");
  }
  const matched: FormationBank = {
    positions: new Float32Array(to.positions.length),
    rotations: new Float32Array(to.rotations.length),
    sizeScales: new Float32Array(to.sizeScales.length),
    interactionBudgets: new Float32Array(to.interactionBudgets.length),
    groups: new Uint16Array(to.groups.length),
  };

  for (const group of fromIds) {
    const fromIndices = fromGroups.get(group) ?? [];
    const toIndices = toGroups.get(group) ?? [];
    if (fromIndices.length !== toIndices.length) {
      throw new Error(`DESIGN 01 cohort ${group} has unequal source and target populations.`);
    }
    const fromOrder = spatialOrderForIndices(from.positions, fromIndices);
    const toOrder = spatialOrderForIndices(to.positions, toIndices);
    for (let rank = 0; rank < fromOrder.length; rank += 1) {
      copySlot(to, toOrder[rank], matched, fromOrder[rank]);
    }
  }
  return matched;
}
