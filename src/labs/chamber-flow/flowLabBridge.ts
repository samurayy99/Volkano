import * as THREE from 'three/webgpu';
import App from './flow-core/app';

export class FlowLabBridge {
  private container: HTMLDivElement | null = null;
  private app: App | null = null;
  private renderer: THREE.WebGPURenderer | null = null;
  private clock = new THREE.Clock();
  private isDestroyed = false;
  private rafId: number | null = null;
  private onWindowResize: (() => void) | null = null;

  public async mount(container: HTMLDivElement) {
    this.container = container;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // Create Renderer (alpha enabled for CSS chamber visibility)
    const renderer = new THREE.WebGPURenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    await renderer.init();
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const app = new App(renderer, container);
    this.app = app;

    try {
      await app.init(async (progress: number) => {
        // Optional: Expose progress to React
      });
      if (this.isDestroyed) return;

      // Window resize listener (matches production bridge)
      this.onWindowResize = () => this.handleResize();
      window.addEventListener('resize', this.onWindowResize);

      // Crucial: WebGPU PostProcessing targets require an explicit size flush
      this.handleResize();

      const animate = async () => {
        if (this.isDestroyed || !this.app) return;
        const delta = this.clock.getDelta();
        const elapsed = this.clock.getElapsedTime();
        await this.app.update(delta, elapsed);

        if (!this.isDestroyed) {
          this.rafId = requestAnimationFrame(animate);
        }
      };

      this.rafId = requestAnimationFrame(animate);
    } catch (err) {
      console.error("Failed to initialize flow-core app", err);
    }
  }

  private handleResize() {
    if (!this.renderer || !this.app || !this.container) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.app.resize(w, h);
  }

  public resize(width: number, height: number) {
    if (!this.renderer || !this.app) return;
    const w = this.container?.clientWidth || width || window.innerWidth;
    const h = this.container?.clientHeight || height || window.innerHeight;
    this.renderer.setSize(w, h);
    this.app.resize(w, h);
  }

  public destroy() {
    this.isDestroyed = true;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    if (this.onWindowResize) {
      window.removeEventListener('resize', this.onWindowResize);
      this.onWindowResize = null;
    }

    if (this.renderer) {
      this.renderer.setAnimationLoop(null);
      if (this.container && this.renderer.domElement.parentNode === this.container) {
        this.container.removeChild(this.renderer.domElement);
      }
      this.renderer.dispose();
      this.renderer = null;
    }
    this.app = null;
  }
}
