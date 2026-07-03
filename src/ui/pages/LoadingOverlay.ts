/**
 * Simple overlay for loading states
 */
export class LoadingOverlay {
    private element: HTMLDivElement | null = null;

    show(container: HTMLElement, text: string = 'Loading...', showSpinner: boolean = true, progress: number | null = null, detail: string = ''): void {
        this.hide();

        const el = document.createElement('div');
        el.className = 'wj-loading-overlay';
        el.id = 'wj-loading-overlay';
        el.innerHTML = `
            ${showSpinner ? '<div class="wj-spinner"></div>' : ''}
            <div class="wj-loading-text" id="wj-loading-text">${this.escapeHtml(text)}</div>
            <div class="wj-loading-detail" id="wj-loading-detail">${this.escapeHtml(detail)}</div>
            <div class="wj-loading-progress${progress == null ? ' is-hidden' : ''}" id="wj-loading-progress">
                <div class="wj-loading-progress-bar" id="wj-loading-progress-bar" style="width:${progress == null ? 0 : Math.max(0, Math.min(100, progress))}%"></div>
            </div>
        `;

        container.appendChild(el);
        this.element = el;
    }

    update(text: string, progress: number | null = null, detail: string = ''): void {
        if (this.element) {
            const textEl = this.element.querySelector('#wj-loading-text');
            const detailEl = this.element.querySelector('#wj-loading-detail');
            const progressEl = this.element.querySelector('#wj-loading-progress');
            const progressBarEl = this.element.querySelector('#wj-loading-progress-bar') as HTMLDivElement | null;
            if (textEl) {
                textEl.textContent = text;
            }
            if (detailEl) {
                detailEl.textContent = detail;
            }
            if (progressEl) {
                progressEl.classList.toggle('is-hidden', progress == null);
            }
            if (progressBarEl && progress != null) {
                progressBarEl.style.width = `${Math.max(0, Math.min(100, progress))}%`;
            }
        }
    }

    updateText(text: string): void {
        this.update(text);
    }

    hide(): void {
        if (this.element) {
            this.element.remove();
            this.element = null;
        }
    }

    private escapeHtml(str: string): string {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
