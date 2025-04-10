import {App} from "./App.ts";

const audioCtx: AudioContext = new AudioContext();

window.onload = (): void => {
    const app: App = App.getInstance(audioCtx);
    app.startScene();
};

window.addEventListener('click', async (): Promise<void> => {
    await audioCtx.resume();
}, { once: true });