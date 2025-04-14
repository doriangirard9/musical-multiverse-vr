import {App} from "./App.ts";

const audioCtx: AudioContext = new AudioContext();

let onload = (): void => {
    const app: App = App.getInstance(audioCtx);
    app.startScene();
}

if(document.readyState === "complete") onload()
else window.addEventListener("load", onload)

window.addEventListener('click', async (): Promise<void> => {
    await audioCtx.resume();
}, { once: true });