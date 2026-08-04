import * as THREE from "three/webgpu";

/**
 * Opposing directional lights give stable large-scale shaping without a point
 * light's distance falloff — relevant here because the particle field is scaled
 * to 1/64 world units while the rig was authored at a different size.
 *
 * The previous pair were both `0x8b9daf` at intensity `0.07` with `decay 2`:
 * same colour from both sides, and too weak to survive the falloff. Final
 * colours and intensities are tuned against the living-surface material and the
 * tone-mapping pipeline, not taken from a reference.
 */
export const LIGHT_RIG = Object.freeze({
  /** Warm side. Reads as the key. */
  warmColor: 0xff7a3c,
  warmIntensity: 2.0,
  warmDirection: [-1.0, 0.55, 0.85],

  /** Cool side, opposite. Reads as the fill and separates silhouette from black. */
  coolColor: 0x4d7cff,
  coolIntensity: 1.7,
  coolDirection: [1.0, -0.25, 0.6],

  /**
   * Ambient has to stay low or it washes the colour contrast straight out —
   * this is the single value that decides whether the rig reads at all.
   */
  hemiIntensity: 0.1,
  /** The shadow-casting key. Reduced: the rim pair now carries the shaping. */
  keyIntensity: 1.05,
});

export class Lights {
  hemi = null;
  keyLight = null;
  /** Opposing coloured rim pair — [warm, cool]. */
  rimLights = [];
  /** @type {THREE.Object3D | null} */
  object = null;
  /** @type {THREE.Object3D | null} */
  _keyTarget = null;
  _baseKeyTarget = new THREE.Vector3(0.24, 0.46, 0.58);

  constructor() {
    this.object = new THREE.Object3D();
    const hemi = new THREE.HemisphereLight(0xc3c9cf, 0x080706, LIGHT_RIG.hemiIntensity);
    const light = new THREE.SpotLight(
      0xf2e6d4,
      LIGHT_RIG.keyIntensity,
      18,
      Math.PI * 0.38,
      1,
      0.72,
    );
    const lightTarget = new THREE.Object3D();
    light.position.set(0, 0.98, -1.08);
    lightTarget.position.copy(this._baseKeyTarget);
    light.target = lightTarget;

    const warm = new THREE.DirectionalLight(LIGHT_RIG.warmColor, LIGHT_RIG.warmIntensity);
    warm.position.set(...LIGHT_RIG.warmDirection);
    const cool = new THREE.DirectionalLight(LIGHT_RIG.coolColor, LIGHT_RIG.coolIntensity);
    cool.position.set(...LIGHT_RIG.coolDirection);
    this.rimLights = [warm, cool];

    this.object.add(hemi);
    this.object.add(light);
    this.object.add(lightTarget);
    this.object.add(warm);
    this.object.add(warm.target);
    this.object.add(cool);
    this.object.add(cool.target);

    light.castShadow = true;
    light.shadow.mapSize.width = 512 * 2;
    light.shadow.mapSize.height = 512 * 2;
    light.shadow.bias = -0.0038;
    light.shadow.camera.near = 0.35;
    light.shadow.camera.far = 5;

    this.hemi = hemi;
    this.keyLight = light;
    this._keyTarget = lightTarget;
  }

  /**
   * Live handle for finding the look on the real page instead of through a
   * rebuild per guess. Values mirror `LIGHT_RIG`; anything omitted is left alone.
   */
  setRig(spec = {}) {
    // A malformed array from the console would otherwise put NaN into a light
    // position, which is unrecoverable without a reload.
    const isFiniteVec3 = (value) => Array.isArray(value)
      && value.length === 3
      && value.every(Number.isFinite);

    const [warm, cool] = this.rimLights;
    if (warm) {
      if (Number.isFinite(spec.warmIntensity)) warm.intensity = spec.warmIntensity;
      if (Number.isFinite(spec.warmColor)) warm.color.setHex(spec.warmColor);
      if (isFiniteVec3(spec.warmDirection)) warm.position.set(...spec.warmDirection);
    }
    if (cool) {
      if (Number.isFinite(spec.coolIntensity)) cool.intensity = spec.coolIntensity;
      if (Number.isFinite(spec.coolColor)) cool.color.setHex(spec.coolColor);
      if (isFiniteVec3(spec.coolDirection)) cool.position.set(...spec.coolDirection);
    }
    if (this.hemi && Number.isFinite(spec.hemiIntensity)) {
      this.hemi.intensity = spec.hemiIntensity;
    }
    if (this.keyLight && Number.isFinite(spec.keyIntensity)) {
      this.keyLight.intensity = spec.keyIntensity;
    }
  }

  /** Current values, so the console handle can report what it is looking at. */
  readRig() {
    const [warm, cool] = this.rimLights;
    return {
      warmIntensity: warm?.intensity ?? 0,
      warmColor: warm ? `#${warm.color.getHexString()}` : null,
      coolIntensity: cool?.intensity ?? 0,
      coolColor: cool ? `#${cool.color.getHexString()}` : null,
      hemiIntensity: this.hemi?.intensity ?? 0,
      keyIntensity: this.keyLight?.intensity ?? 0,
    };
  }

  dispose() {
    this.hemi = null;
    this.keyLight = null;
    this.rimLights = [];
    this._keyTarget = null;
    this.object = null;
  }
}
