import * as THREE from "three/webgpu";

class Conf {
    gui = null;
    maxParticles = 8192 * 16;
    particles = 8192 * 4;

    bloom = true;

    run = true;
    noise = 1.0;
    speed = 1;
    stiffness = 3.;
    restDensity = 1.;
    density = 1;
    dynamicViscosity = 0.1;
    gravity = 2;
    gravitySensorReading = new THREE.Vector3();
    accelerometerReading = new THREE.Vector3();
    actualSize = 1;
    size = 1;

    points = false;

    constructor(info) {
        // Clean lab mode: default to max particles
        this.maxParticles = 8192 * 16;
        this.particles = 8192 * 4;
        this.updateParams();

    }

    updateParams() {
        const level = Math.max(this.particles / 8192,1);
        const size = 1.6/Math.pow(level, 1/3);
        this.actualSize = size * this.size;
        this.restDensity = 0.25 * level * this.density;
    }

    setupGravitySensor() {
        if (this.gravitySensor) { return; }
        this.gravitySensor = new GravitySensor({ frequency: 60 });
        this.gravitySensor.addEventListener("reading", (e) => {
            this.gravitySensorReading.copy(this.gravitySensor).divideScalar(50);
            this.gravitySensorReading.setY(this.gravitySensorReading.y * -1);
        });
        this.gravitySensor.start();
    }

    init() {
        // Lab mode: no GUI or stats by default.
    }

    update() {
    }

    begin() {
    }
    end() {
    }
}
export const conf = new Conf();