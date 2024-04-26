import {App} from "./App.ts";
import * as Tone from "tone";

const audioCtx: AudioContext = new AudioContext();

window.onload = (): void => {
    Tone.setContext(audioCtx);
    const app: App = App.getInstance(audioCtx);
    app.startScene();
};

window.addEventListener('click', async (): Promise<void> => {
    await audioCtx.resume();
    await Tone.start();
    await Tone.Transport.context.resume();
}, { once: true });