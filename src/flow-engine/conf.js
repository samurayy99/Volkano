import * as THREE from "three/webgpu";

class Conf {
    maxParticles = 8192 * 16;
    particles = 8192 * 4;

    bloom = false;

    run = true;
    noise = 1.0;
    speed = 1;
    stiffness = 3;
    restDensity = 1;
    density = 1;
    dynamicViscosity = 0.1;
    gravity = 0;
    simSubsteps = 1;           // compute substeps per frame (higher = more stable convergence)
    apicBlend = 0.45;          // internal solver blend: full APIC feels too fibrous for pre-enter
    maxVelocity = 6.0;         // keep the guard, but stop choking the interactive wall-launch energy
    ventCenter = new THREE.Vector3(23.2, 30.6, 18.4); // derived sim-space source center
    ventRadii = new THREE.Vector3(4.2, 3.2, 2.8); // derived sim-space source radii
    ventAxis = new THREE.Vector3(-0.16, 0.94, 0.3); // derived sim-space source axis
    sourceFieldCenter = new THREE.Vector3(27.0, 33.0, 18.5);
    sourceFieldRadii = new THREE.Vector3(18.0, 21.5, 14.5);
    sourceFieldSecondaryCenter = new THREE.Vector3(36.0, 29.0, 26.0);
    sourceFieldSecondaryRadii = new THREE.Vector3(10.5, 13.5, 10.0);
    chamberFlowCenter = new THREE.Vector3(32.0, 32.0, 30.0);
    chamberFlowRadii = new THREE.Vector3(27.0, 23.0, 23.0);
    convergenceProgress = 0.0; // 0..100 production convergence core state
    convergenceSlowdown = 0.0; // 0..1 motion/turbulence reduction mix
    convergenceCompression = 0.0; // 0..1 spatial densification mix
    convergenceFreeze = 0.0; // 0..1 terminal stillness mix
    convergenceHeatRetention = 0.0; // 0..1 thermal memory retention during convergence
    convergenceThermalExtinction = 0.0; // 0..1 pre-freeze heat extinction for dark pressure lock
    holdShapeMix = 0.0; // 0..1 rod→hold-body morph driven by late convergence
    postFreezeSimLock = 0.0; // 0..1 hard gate: solver motion/capture disabled, renderer owns post-freeze
    postFreezeHoldProgress = 0.0; // 0..1 early post-enter shock/lock timeline before clear/extraction accelerates
    postFreezeClearProgress = 0.0; // 0..1 renderer clear timing after ownership lock
    isMobile = false;
    actualSize = 1;
    size = 1;

    constructor() {
        if (typeof window !== "undefined" && window.innerWidth < 768) {
            this.maxParticles = 8192 * 8;
            this.particles = 4096;
            this.simSubsteps = 1;
            this.isMobile = true;
        }
        this.updateParams();
    }

    updateParams() {
        const level = Math.max(this.particles / 8192, 1);
        const size = 1.6 / Math.pow(level, 1 / 3);
        this.actualSize = size * this.size;
        this.restDensity = 0.25 * level * this.density;
    }
}

export const conf = new Conf();
