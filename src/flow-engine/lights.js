import * as THREE from "three/webgpu";

export class Lights {
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

        this.object.add(hemi);
        this.object.add(light);
        this.object.add(lightTarget);
        this.object.add(rimLight);
        //this.object.add(new THREE.SpotLightHelper(light));

        light.castShadow = true; // default false
        light.shadow.mapSize.width = 512*2; // default
        light.shadow.mapSize.height = 512*2; // default
        light.shadow.bias = -0.0038;
        light.shadow.camera.near = 0.35; // default
        light.shadow.camera.far = 5;

    }

    update(elapsed) {

    }
}
