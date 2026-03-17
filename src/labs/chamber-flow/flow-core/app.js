import * as THREE from "three/webgpu";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls"
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import {Lights} from "./lights";
const hdri = "/flow-assets/autumn_field_puresky_1k.hdr";

import { float, Fn, mrt, output, pass, vec3, vec4 } from "three/tsl";
import {conf} from "./conf";
import MlsMpmSimulator from "./mls-mpm/mlsMpmSimulator";
import ParticleRenderer from "./mls-mpm/particleRenderer";
import ChamberVessel, { VESSEL } from "./chamberVessel";
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';
import PointRenderer from "./mls-mpm/pointRenderer.js";

const loadHdr = async (file) => {
    const texture = await new Promise(resolve => {
        new RGBELoader().load(file, result => {
            result.mapping = THREE.EquirectangularReflectionMapping;
            result.colo
            resolve(result);
        });
    });
    return texture;
}

class App {
    renderer = null;

    camera = null;

    scene = null;

    controls = null;

    lights = null;

    constructor(renderer, container) {
        this.renderer = renderer;
        this.container = container;
    }

    async init(progressCallback) {
        conf.init();

        const w = Math.max(64, this.container.clientWidth);
        const h = Math.max(64, this.container.clientHeight);
        this.camera = new THREE.PerspectiveCamera(48, w / h, 0.01, 7.5);

        this.scene = new THREE.Scene();

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.applyCameraFraming(w, h);
        this.controls.enableDamping = true;
        this.controls.enablePan = false;
        this.controls.touches = {
            TWO: THREE.TOUCH.DOLLY_ROTATE,
        }
        // Disabled by default to prevent the lab from behaving neutrally like a demo playground
        this.controls.enabled = false;
        
        this.controls.maxDistance = 2.0;
        this.controls.minPolarAngle = 0.2 * Math.PI;
        this.controls.maxPolarAngle = 0.8 * Math.PI;
        this.controls.minAzimuthAngle = 0.7 * Math.PI;
        this.controls.maxAzimuthAngle = 1.3 * Math.PI;

        await progressCallback(0.1)

        const hdriTexture = await loadHdr(hdri);

        // Transparent background so the CSS chamber and rear wall remain visible
        this.scene.background = null;
        // this.scene.backgroundRotation = new THREE.Euler(0,2.15,0);
        this.scene.environment = hdriTexture;
        this.scene.environmentRotation = new THREE.Euler(0,-2.15,0);
        this.scene.environmentIntensity = 0.22;
        this.renderer.toneMappingExposure = 0.6;

        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        await progressCallback(0.5)

        this.mlsMpmSim = new MlsMpmSimulator(this.renderer);
        await this.mlsMpmSim.init();
        this.particleRenderer = new ParticleRenderer(this.mlsMpmSim);
        this.scene.add(this.particleRenderer.object);
        this.pointRenderer = new PointRenderer(this.mlsMpmSim);
        this.scene.add(this.pointRenderer.object);

        this.lights = new Lights();
        this.scene.add(this.lights.object);

        this.vessel = new ChamberVessel();
        await this.vessel.init();
        this.scene.add(this.vessel.object);

        const scenePass = pass(this.scene, this.camera);
        scenePass.setMRT( mrt( {
            output,
            bloomIntensity: float( 0 ) // default bloom intensity
        } ) );
        const outputPass = scenePass.getTextureNode();
        const bloomIntensityPass = scenePass.getTextureNode( 'bloomIntensity' );
        const bloomPass = bloom( bloomIntensityPass );
        const postProcessing = new THREE.PostProcessing(this.renderer);
        postProcessing.outputColorTransform = false;
        postProcessing.outputNode = Fn(() => {
            const sceneColor = outputPass.rgb;
            const sceneAlpha = outputPass.a;
            const bloomColor = bloomPass.rgb;
            const combinedColor = sceneColor.add(bloomColor).clamp(0, 1);
            const bloomLuma = bloomColor.r.max(bloomColor.g).max(bloomColor.b);
            const finalAlpha = sceneAlpha.max(bloomLuma.mul(1.5)).clamp(0, 1);
            return vec4(combinedColor, finalAlpha);
        })().renderOutput();

        this.postProcessing = postProcessing;
        this.bloomPass = bloomPass;
        this.bloomPass.threshold.value = 0.14;
        this.bloomPass.strength.value = 0.16;
        this.bloomPass.radius.value = 0.42;


        this.raycaster = new THREE.Raycaster();
        this.plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.2);
        this.renderer.domElement.addEventListener("pointermove", (event) => { this.onMouseMove(event); });

        await progressCallback(1.0, 100);
    }

    resize(width, height) {
        this.camera.aspect = width / height;
        this.applyCameraFraming(width, height);
    }

    applyCameraFraming(width, height) {
        if (!this.camera) return;
        const aspect = width / Math.max(height, 1);

        const { apertureWidth, apertureHeight, frameSide, frameTop, frameDepth, lookAtX, lookAtY, lookAtZ, centerZ } = VESSEL;
        const outerW = apertureWidth + frameSide * 2;
        const outerH = apertureHeight + frameTop * 2;
        const fov = aspect < 0.88 ? 51 : aspect < 1.2 ? 48 : 46;
        const fillH = aspect > 1.55 ? 0.8 : aspect > 1.18 ? 0.76 : 0.72;
        const fillW = aspect > 1.55 ? 0.86 : aspect > 1.18 ? 0.88 : 0.9;
        const fovRad = THREE.MathUtils.degToRad(fov);
        const distH = outerH / (2 * Math.tan(fovRad * 0.5) * fillH);
        const distW = outerW / (2 * Math.tan(fovRad * 0.5) * aspect * fillW);
        const distance = Math.max(distH, distW);
        const cameraY = lookAtY + (aspect < 0.88 ? 0.074 : 0.04);

        this.camera.fov = fov;
        this.camera.position.set(lookAtX + 0.008, cameraY, lookAtZ - distance);
        this.camera.lookAt(lookAtX, lookAtY, lookAtZ);
        if (this.controls) {
            this.controls.target.set(lookAtX, lookAtY, lookAtZ);
        }
        this.camera.updateProjectionMatrix();
    }

    onMouseMove(event) {
        const w = Math.max(64, this.container.clientWidth);
        const h = Math.max(64, this.container.clientHeight);
        const pointer = new THREE.Vector2();
        pointer.x = (event.offsetX / w) * 2 - 1;
        pointer.y = -(event.offsetY / h) * 2 + 1;
        this.raycaster.setFromCamera(pointer, this.camera);
        const intersect = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(this.plane, intersect);
        if (intersect) {
            this.mlsMpmSim.setMouseRay(this.raycaster.ray.origin, this.raycaster.ray.direction, intersect);
        }
    }


    async update(delta, elapsed) {
        conf.begin();

        this.particleRenderer.object.visible = !conf.points;
        this.pointRenderer.object.visible = conf.points;

        this.controls.update(delta);
        this.lights.update(elapsed);
        this.particleRenderer.update();
        this.pointRenderer.update();

        await this.mlsMpmSim.update(delta,elapsed);

        if (conf.bloom) {
            await this.postProcessing.renderAsync();
        } else {
            await this.renderer.renderAsync(this.scene, this.camera);
        }

        conf.end();
    }
}
export default App;
