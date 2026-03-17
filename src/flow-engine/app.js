import * as THREE from "three/webgpu";
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import {Lights} from "./lights";

import { float, Fn, mrt, output, pass, vec4 } from "three/tsl";
import {conf} from "./conf";
import {Info} from "./info";
import MlsMpmSimulator from "./mls-mpm/mlsMpmSimulator";
import ParticleRenderer from "./mls-mpm/particleRenderer";
import BackgroundGeometry, { PREENTER_VESSEL } from "./backgroundGeometry";
import TransitionParticles from "./transitionParticles";
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';

const HDRI_URL = "/flow-assets/autumn_field_puresky_1k.hdr";

const loadHdr = async (file) => {
    const texture = await new Promise(resolve => {
        new RGBELoader().load(file, result => {
            result.mapping = THREE.EquirectangularReflectionMapping;
            resolve(result);
        });
    });
    return texture;
}

class App {
    renderer = null;

    camera = null;

    scene = null;

    lights = null;
    backgroundGeometry = null;
    pointerSample = null;
    pointerNdc = new THREE.Vector2();
    pointerIntersect = new THREE.Vector3();
    debugView = "composite";
    sourceFieldAnchorOffsets = null;
    startupSourceFieldAnchorOffsets = null;
    mode = "idle";
    idleParticlePresentation = "active";

    constructor(renderer) {
        this.renderer = renderer;
    }

    async init(progressCallback, width = window.innerWidth, height = window.innerHeight) {
        conf.dispose();
        this.info = new Info();
        conf.init();

        this.camera = new THREE.PerspectiveCamera(47, width / height, 0.01, 7.5);
        this.applyCameraFraming(width, height);

        this.scene = new THREE.Scene();
        this.scene.add(this.camera);

        await progressCallback(0.1)

        const hdriTexture = await loadHdr(HDRI_URL);

        // No scene background — canvas is transparent, CSS room shows through
        this.scene.background = null;
        this.scene.environment = hdriTexture;
        this.scene.environmentRotation = new THREE.Euler(0,-2.15,0);
        this.scene.environmentIntensity = 0.22;
        this.renderer.toneMappingExposure = 0.6;

        await progressCallback(0.5)

        this.mlsMpmSim = new MlsMpmSimulator(this.renderer);
        await this.mlsMpmSim.init();
        this.particleRenderer = new ParticleRenderer(this.mlsMpmSim);
        this.transitionParticles = new TransitionParticles({ isMobile: conf.isMobile });
        this.backgroundGeometry = new BackgroundGeometry();
        await this.backgroundGeometry.init();
        this.scene.add(this.backgroundGeometry.object);

        this.lights = new Lights();
        this.scene.add(this.lights.object);
        this.scene.add(this.particleRenderer.object);
        this.scene.add(this.transitionParticles.object);

        this.applyDebugView();

        const scenePass = pass(this.scene, this.camera);
        scenePass.setMRT( mrt( {
            output,
            bloomIntensity: float( 0 )
        } ) );
        const outputPass = scenePass.getTextureNode();
        const bloomIntensityPass = scenePass.getTextureNode( 'bloomIntensity' );
        const bloomPass = bloom( bloomIntensityPass );
        const postProcessing = new THREE.PostProcessing(this.renderer);
        postProcessing.outputColorTransform = false;
        // Post-processing output needs to composite the scene with its original alpha,
        // and safely add the bloom on top, extending the alpha channel where the bloom is active.
        postProcessing.outputNode = Fn(() => {
            const sceneColor = outputPass.rgb;
            const sceneAlpha = outputPass.a;
            const bloomColor = bloomPass.rgb;
            
            // The final color is the scene + bloom
            const combinedColor = sceneColor.add(bloomColor).clamp(0, 1);
            
            // To make the background transparent, the WebGL output must have alpha = 0 where there is no particle and no bloom.
            // We use the maximum of the scene's alpha and the bloom's luminance to create an alpha mask.
            const bloomLuma = bloomColor.r.max(bloomColor.g).max(bloomColor.b);
            const finalAlpha = sceneAlpha.max(bloomLuma.mul(1.5)).clamp(0, 1);
            
            return vec4(combinedColor, finalAlpha);
        })().renderOutput();

        this.postProcessing = postProcessing;
        this.bloomPass = bloomPass;
        this.setLook({
            environmentIntensity: 0.18,
            exposure: 0.54,
            bloomThreshold: 0.14,
            bloomStrength: 0.16,
            bloomRadius: 0.42,
        });

        this.raycaster = new THREE.Raycaster();
        this.plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.2);

        await progressCallback(1.0, 100);
    }

    resize(width, height) {
        this.camera.aspect = width / height;
        this.applyCameraFraming(width, height);
    }

    setPointer(clientX, clientY, isDown = false) {
        this.pointerDown = isDown;

        this.pointerSample = { x: clientX, y: clientY, t: performance.now() };

        this.pointerNdc.x = clientX * 2 - 1;
        this.pointerNdc.y = -(clientY * 2) + 1;
        this.raycaster.setFromCamera(this.pointerNdc, this.camera);
        const intersect = this.raycaster.ray.intersectPlane(this.plane, this.pointerIntersect);
        if (intersect) {
            this.mlsMpmSim.setMouseRay(this.raycaster.ray.origin, this.raycaster.ray.direction, intersect);
            if (isDown) {
                this.backgroundGeometry?.addImpulse?.(0.12);
            }
        }
    }

    setDebugView(view = "composite") {
        this.debugView = view;
        this.applyDebugView();
    }

    primeStartupSource() {
        if (this.startupSourceFieldAnchorOffsets) {
            this.sourceFieldAnchorOffsets = {
                primary: this.startupSourceFieldAnchorOffsets.primary.clone(),
                secondary: this.startupSourceFieldAnchorOffsets.secondary.clone(),
            };
        }
        this.backgroundGeometry?.update?.(0, 0);
        this.syncSourceMapping("startup");
    }

    promoteIdlePopulation() {
        if (this.startupSourceFieldAnchorOffsets) {
            this.sourceFieldAnchorOffsets = {
                primary: this.startupSourceFieldAnchorOffsets.primary.clone().multiply(new THREE.Vector3(0.78, 0.82, 0.7)),
                secondary: this.startupSourceFieldAnchorOffsets.secondary.clone().multiply(new THREE.Vector3(0.38, 0.62, 0.4)),
            };
        }
        this.backgroundGeometry?.update?.(0, 0);
        this.syncSourceMapping("mature-idle");
    }

    syncSourceMapping(reseedMode = false) {
        if (!this.backgroundGeometry?.getCraterSourceDescriptor || !this.particleRenderer?.worldPointToSimulation) {
            return;
        }

        if (!this.sourceFieldAnchorOffsets) {
            const primary = conf.sourceFieldCenter.clone().sub(conf.ventCenter);
            const secondary = conf.sourceFieldSecondaryCenter.clone().sub(conf.ventCenter);
            this.startupSourceFieldAnchorOffsets = {
                primary: primary.clone(),
                secondary: secondary.clone(),
            };
            this.sourceFieldAnchorOffsets = {
                primary,
                secondary,
            };
        }

        const source = this.backgroundGeometry.getCraterSourceDescriptor();
        if (!source) {
            return;
        }

        const ventCenterSim = this.particleRenderer.worldPointToSimulation(source.ventOriginWorld, new THREE.Vector3());
        const ventAxisSim = this.particleRenderer.worldDirectionToSimulation(source.ventAxisWorld, new THREE.Vector3());
        const simRightPoint = this.particleRenderer.worldPointToSimulation(
            source.ventOriginWorld.clone().addScaledVector(source.rightWorld, conf.ventRadiiLocal.x),
            new THREE.Vector3(),
        );
        const simUpPoint = this.particleRenderer.worldPointToSimulation(
            source.ventOriginWorld.clone().addScaledVector(source.upWorld, conf.ventRadiiLocal.z),
            new THREE.Vector3(),
        );
        const simAxisPoint = this.particleRenderer.worldPointToSimulation(
            source.ventOriginWorld.clone().addScaledVector(source.ventAxisWorld, conf.ventRadiiLocal.y),
            new THREE.Vector3(),
        );

        conf.ventCenter.copy(ventCenterSim);
        conf.ventAxis.copy(ventAxisSim);
        conf.ventRadii.set(
            Math.max(1.25, simRightPoint.distanceTo(ventCenterSim)),
            Math.max(1.4, simAxisPoint.distanceTo(ventCenterSim)),
            Math.max(1.0, simUpPoint.distanceTo(ventCenterSim)),
        );
        conf.sourceFieldCenter.copy(ventCenterSim).add(this.sourceFieldAnchorOffsets.primary);
        conf.sourceFieldSecondaryCenter.copy(ventCenterSim).add(this.sourceFieldAnchorOffsets.secondary);

        if (reseedMode === "startup") {
            this.mlsMpmSim?.prepareStartupFromVent?.();
        } else if (reseedMode === "mature-idle") {
            this.mlsMpmSim?.seedMatureIdlePopulation?.();
        } else if (reseedMode) {
            this.mlsMpmSim?.reseedAllParticlesFromVent?.();
        }
    }

    setLook(values = {}) {
        const {
            environmentIntensity,
            exposure,
            bloomThreshold,
            bloomStrength,
            bloomRadius,
        } = values;

        if (this.scene && Number.isFinite(environmentIntensity)) {
            this.scene.environmentIntensity = environmentIntensity;
        }
        if (this.renderer && Number.isFinite(exposure)) {
            this.renderer.toneMappingExposure = exposure;
        }
        if (!this.bloomPass) return;
        if (Number.isFinite(bloomThreshold)) {
            this.bloomPass.threshold.value = bloomThreshold;
        }
        if (Number.isFinite(bloomStrength)) {
            this.bloomPass.strength.value = bloomStrength;
        }
        if (Number.isFinite(bloomRadius)) {
            this.bloomPass.radius.value = bloomRadius;
        }
    }

    setPointerInfluence(value = 1) {
        this.mlsMpmSim?.setMouseInfluence?.(value);
    }

    setMode(mode = "idle") {
        if (this.mode === mode) return;
        this.mode = mode;

        if (mode === "idle") {
            this.idleParticlePresentation = "active";
            this.transitionParticles?.reset?.();
        } else {
            if (mode === "enter_burst") {
                const descriptor = this.backgroundGeometry?.getCraterSourceDescriptor?.();
                if (descriptor) {
                    this.transitionParticles?.setOriginFromDescriptor?.(descriptor);
                }
            }
            this.idleParticlePresentation = "hidden";

            this.transitionParticles?.setMode?.(mode);
        }

        this.applyDebugView();
    }


    async update(delta, elapsed) {
        conf.begin();

        this.backgroundGeometry?.update?.(delta, elapsed);
        this.lights.update(elapsed);

        if (this.idleParticlePresentation === "active") {
            this.syncSourceMapping();
            await this.mlsMpmSim.update(delta, elapsed);
            this.particleRenderer.update();
        }

        this.transitionParticles?.update?.(delta, elapsed);
        this.applyDebugView();

        if (conf.bloom) {
            await this.postProcessing.renderAsync();
        } else {
            await this.renderer.renderAsync(this.scene, this.camera);
        }

        conf.end();
    }

    dispose() {
        this.info?.dispose?.();
        this.transitionParticles?.dispose?.();
        conf.dispose();
    }

    applyDebugView() {
        const params = typeof window !== "undefined"
            ? new URLSearchParams(window.location.search)
            : null;
        const urlView = params?.get("vesselDebug");
        const particleDebug = params?.get("particleDebug");
        const resolvedDebugView = urlView === "geometry" || urlView === "particles"
            ? urlView
            : this.debugView;
        const resolvedParticleDebug = particleDebug === "source"
            || particleDebug === "freshness"
            || particleDebug === "binding"
            || particleDebug === "hover"
            || particleDebug === "walls"
            ? particleDebug
            : "off";

        if (this.particleRenderer?.object) {
            this.particleRenderer.object.visible =
                resolvedDebugView !== "geometry" && this.idleParticlePresentation !== "hidden";
        }
        this.transitionParticles?.setDebugVisibility?.(resolvedDebugView !== "geometry");
        if (this.backgroundGeometry?.object) {
            this.backgroundGeometry.object.visible = resolvedDebugView !== "particles";
        }
        conf.particleDebugMode = resolvedParticleDebug;
        this.backgroundGeometry?.setDebugView?.(resolvedDebugView);
    }

    applyCameraFraming(width = window.innerWidth, height = window.innerHeight) {
        if (!this.camera) return;

        const aspect = width / Math.max(height, 1);
        const {
            apertureWidth,
            apertureHeight,
            frameSide,
            frameTop,
            lookAtX,
            lookAtY,
            lookAtZ,
        } = PREENTER_VESSEL;

        const outerWidth = apertureWidth + frameSide * 2;
        const outerHeight = apertureHeight + frameTop * 2;
        const fov = aspect < 0.88 ? 51 : aspect < 1.2 ? 48 : 46;
        const fillHeight = aspect > 1.55 ? 0.8 : aspect > 1.18 ? 0.76 : 0.72;
        const fillWidth = aspect > 1.55 ? 0.86 : aspect > 1.18 ? 0.88 : 0.9;
        const fovRadians = THREE.MathUtils.degToRad(fov);
        const distanceForHeight = outerHeight / (2 * Math.tan(fovRadians * 0.5) * fillHeight);
        const distanceForWidth = outerWidth / (2 * Math.tan(fovRadians * 0.5) * aspect * fillWidth);
        const distance = Math.max(distanceForHeight, distanceForWidth);
        const cameraY = lookAtY + (aspect < 0.88 ? 0.074 : 0.04);

        this.camera.fov = fov;
        this.camera.position.set(lookAtX + 0.008, cameraY, lookAtZ - distance);
        this.camera.lookAt(lookAtX, lookAtY, lookAtZ);
        this.camera.updateProjectionMatrix();
    }
}
export default App;
