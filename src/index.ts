import {App} from "./App.ts";
import * as Tone from "tone";

const audioCtx: AudioContext = new AudioContext();

console.log("aaa")

let onload = (): void => {
    Tone.setContext(audioCtx);
    const app: App = App.getInstance(audioCtx);
    app.startScene();
}

if(document.readyState === "complete") onload()
else window.addEventListener("load", onload)

window.addEventListener('click', async (): Promise<void> => {
    await audioCtx.resume();
    await Tone.start();
    await Tone.Transport.context.resume();
}, { once: true });