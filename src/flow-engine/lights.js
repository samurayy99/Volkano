import * as THREE from "three/webgpu";
import { conf } from "./conf";

export class Lights {
    hemi = null;
    keyLight = null;
    rimLight = null;
    frontVolumeLight = null;

    constructor() {
        this.object = new THREE.Object3D();
        const hemi = new THREE.HemisphereLight(0xc3c9cf, 0x080706, 0.42);
        const light = new THREE.SpotLight(0xf2e6d4, 1.85, 18, Math.PI * 0.38, 1, 0.72);
        const lightTarget = new THREE.Object3D();
        light.position.set(-0.58, 0.98, -1.08);
        lightTarget.position.set(0.24, 0.46, 0.58);
        light.target = lightTarget;

        const rimLight = new THREE.PointLight(0x8b9daf, 0.14, 5.5, 2);
        rimLight.position.set(0.96, 0.6, 0.46);
        const frontVolumeLight = new THREE.PointLight(0xbcb6ae, 0.0, 3.6, 2);
        frontVolumeLight.position.set(0.02, 0.54, -0.36);

        this.object.add(hemi);
        this.object.add(light);
        this.object.add(lightTarget);
        this.object.add(rimLight);
        this.object.add(frontVolumeLight);

        light.castShadow = true; // default false
        light.shadow.mapSize.width = 512*2; // default
        light.shadow.mapSize.height = 512*2; // default
        light.shadow.bias = -0.0038;
        light.shadow.camera.near = 0.35; // default
        light.shadow.camera.far = 5;

        this.hemi = hemi;
        this.keyLight = light;
        this.rimLight = rimLight;
        this.frontVolumeLight = frontVolumeLight;
    }

    update(elapsed) {
        const clearFieldMix = conf.clearFieldMix || 0;

        if (this.hemi) {
            this.hemi.intensity = THREE.MathUtils.lerp(0.42, 0.35, clearFieldMix);
        }

        if (this.keyLight) {
            this.keyLight.intensity = THREE.MathUtils.lerp(1.85, 1.36, clearFieldMix);
        }

        if (this.rimLight) {
            this.rimLight.intensity = THREE.MathUtils.lerp(0.14, 0.22, clearFieldMix);
        }

        if (this.frontVolumeLight) {
            this.frontVolumeLight.intensity = THREE.MathUtils.lerp(0.0, 0.18, clearFieldMix);
        }
    }
}
