/**
 * Simple overlay for loading states
 */
export class LoadingOverlay {
    private element: HTMLDivElement | null = null;

    show(container: HTMLElement, text: string = 'Loading...', showSpinner: boolean = true): void {
        this.hide();

        const el = document.createElement('div');
        el.className = 'wj-loading-overlay';
        el.id = 'wj-loading-overlay';
        el.innerHTML = `
            ${showSpinner ? '<div class="wj-spinner"></div>' : ''}
            <div class="wj-loading-text" id="wj-loading-text">${this.escapeHtml(text)}</div>
        `;

        container.appendChild(el);
        this.element = el;
    }

    updateText(text: string): void {
        if (this.element) {
            const textEl = this.element.querySelector('#wj-loading-text');
            if (textEl) {
                textEl.textContent = text;
            }
        }
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
