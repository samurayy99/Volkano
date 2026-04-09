import * as THREE from "three/webgpu";

export const PREENTER_VESSEL = Object.freeze({
  aspect: 16 / 9,
  apertureWidth: 1.84,
  apertureHeight: 1.84 / (16 / 9),
  frameSide: 0.18,
  frameTop: 0.11,
  frameDepth: 0.11,
  linerThickness: 0.066,
  linerDepth: 0.22,
  depth: 1.18,
  centerX: 0,
  centerY: 0.43,
  centerZ: 0.02,
  lookAtX: 0,
  lookAtY: 0.44,
  lookAtZ: 0.46,
});

// Explicit chamber-local source anchor. This preserves the current effective
// source placement while breaking the old backplate/crater ownership chain.
export const PREENTER_SOURCE_ANCHOR = Object.freeze({
  originLocal: new THREE.Vector3(-0.02208, 0.22149, 1.132),
  axisLocal: new THREE.Vector3(0.012, 0.978, -0.208).normalize(),
  radiiLocal: new THREE.Vector3(0.042, 0.066, 0.024),
});

