import { CreateAudioEngineAsync } from "@babylonjs/core";
import {NewApp} from "./Refactoring/app/NewApp.ts";

const audioCtx: AudioContext = new AudioContext();

const audioEngine = await CreateAudioEngineAsync({audioContext:audioCtx})
await audioEngine.unlockAsync();

let onload = (): void => {
    const newApp: NewApp = NewApp.getInstance(audioCtx, audioEngine);
    newApp.start().then(() => {
        console.log("NewApp started");
    }).catch((error) => {
        console.error("Error starting NewApp:", error);
    });
}

if(document.readyState === "complete") onload()
else window.addEventListener("load", onload)

window.addEventListener('click', async (): Promise<void> => {
    await audioCtx.resume();
}, { once: true });