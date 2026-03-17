export class Info {
    constructor() {
        if (typeof window !== 'undefined' && !new URLSearchParams(window.location.search).has('debug')) {
            return;
        }
        const container = document.createElement('div');
        this.container = container;
        document.body.appendChild(container);
        container.style.position = 'absolute';
        container.style.left = '8px';
        container.style.bottom = '8px';
        container.style.maxWidth = '520px';
        container.style.width = 'calc(100% - 16px)';
        container.style.zIndex = '15';
        container.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';

        const details = document.createElement('details');
        details.style.background = 'rgba(27, 29, 36, 0.82)';
        details.style.border = '1px solid rgba(255, 255, 255, 0.15)';
        details.style.borderRadius = '8px';
        details.style.padding = '6px 8px';
        details.style.color = '#d9dbe3';

        const summary = document.createElement('summary');
        summary.textContent = 'info';
        summary.style.cursor = 'pointer';
        details.appendChild(summary);

        const content = document.createElement('div');
        content.textContent = 'Realtime MLS-MPM simulation in the browser (ThreeJS WebGPU/TSL).';
        content.style.marginTop = '8px';
        content.style.fontSize = '12px';
        content.style.lineHeight = '1.4';
        details.appendChild(content);

        this.content = content;
        container.appendChild(details);
    }

    setText(c) {
        if (this.content) {
            this.content.textContent = c;
        }
    }

    dispose() {
        if (this.container?.parentElement) {
            this.container.parentElement.removeChild(this.container);
        }
    }
}
