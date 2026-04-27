import * as THREE from "three/webgpu";

export class Lights {
  hemi = null;
  keyLight = null;
  /** Symmetric fill lights (±X); combined intensity matches former single rim. */
  rimLights = [];
  /** @type {THREE.Object3D | null} */
  object = null;
  /** @type {THREE.Object3D | null} */
  _keyTarget = null;
  _baseKeyTarget = new THREE.Vector3(0.24, 0.46, 0.58);

  constructor() {
    this.object = new THREE.Object3D();
    const hemi = new THREE.HemisphereLight(0xc3c9cf, 0x080706, 0.42);
    const light = new THREE.SpotLight(0xf2e6d4, 1.85, 18, Math.PI * 0.38, 1, 0.72);
    const lightTarget = new THREE.Object3D();
    light.position.set(0, 0.98, -1.08);
    lightTarget.position.copy(this._baseKeyTarget);
    light.target = lightTarget;

    const rimHalf = 0.07;
    const rimL = new THREE.PointLight(0x8b9daf, rimHalf, 5.5, 2);
    rimL.position.set(-0.96, 0.6, 0.46);
    const rimR = new THREE.PointLight(0x8b9daf, rimHalf, 5.5, 2);
    rimR.position.set(0.96, 0.6, 0.46);
    this.rimLights = [rimL, rimR];

    this.object.add(hemi);
    this.object.add(light);
    this.object.add(lightTarget);
    this.object.add(rimL);
    this.object.add(rimR);

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

  dispose() {
    this.hemi = null;
    this.keyLight = null;
    this.rimLights = [];
    this._keyTarget = null;
    this.object = null;
  }
}
