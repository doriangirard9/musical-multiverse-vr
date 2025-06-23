import {NewApp} from "./Refactoring/app/NewApp.ts";

const audioCtx: AudioContext = new AudioContext();

let onload = (): void => {
    const newApp: NewApp = NewApp.getInstance(audioCtx);
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