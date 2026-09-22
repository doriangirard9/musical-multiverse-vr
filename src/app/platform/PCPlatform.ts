import {FreeCamera, Matrix, Scene, Vector3} from "@babylonjs/core";
import { InputManager } from "../../xr/inputs/InputManager.ts";
import { ControllerInput } from "../../xr/inputs/ControllerInput.ts";
import { ButtonInput } from "../../xr/inputs/ButtonInput.ts";
import { SceneManager } from "../SceneManager.ts";

/** How far in front of the camera the selected hand sits, along the mouse ray, and how far the
 * wheel can push or pull it. */
const HAND_DISTANCE = 0.4
const HAND_DISTANCE_MIN = 0.1
const HAND_DISTANCE_MAX = 3
const HAND_DISTANCE_STEP = 1.1

/** Where a hand waits when it is not the selected one, relative to the camera. */
const IDLE_FORWARD = 0.55
const IDLE_SIDE = 0.21
const IDLE_DOWN = 0.08

/**
 * Responsible for the PC (desktop, ...) experience, camera, player controls.
 */
export class PCPlatform {

    private static _instance: PCPlatform;

    constructor() {}

    public static getInstance(): PCPlatform {
        return this._instance;
    }

    public static async initialize(...parameters: ConstructorParameters<typeof PCPlatform>){
        this._instance = new PCPlatform(...parameters)

        const scene = SceneManager.getInstance()
        scene.getScene().createDefaultCamera(false,false,false)


        // Create the non xr camera
        const camera = scene.getScene().activeCamera!! as FreeCamera
        camera.position = new Vector3(0,1.6,0)
        camera.setTarget(new Vector3(1,1.6,0))
        camera.minZ = 0.01
        camera.maxZ = 1000


        // Non XR Movement controls
        function direction(d: Vector3){
            const dd = camera.getDirection(d)
            dd.y = 0
            dd.normalize()
            dd.scaleInPlace(0.1)
            return dd
        }

        const forward = onKeyPress(scene.getScene(), "KeyW", () => {
            camera.position.addInPlace(direction(new Vector3(0,0,1)))
        })
        const backward = onKeyPress(scene.getScene(), "KeyS", () => {
            camera.position.addInPlace(direction(new Vector3(0,0,-1)))
        })
        const left = onKeyPress(scene.getScene(), "KeyA", () => {
            camera.position.addInPlace(direction(new Vector3(-1,0,0)))
        })
        const right = onKeyPress(scene.getScene(), "KeyD", () => {
            camera.position.addInPlace(direction(new Vector3(1,0,0)))
        })

        // Non XR Camera rotation controls
        let rotateEvent: any

        // The canvas takes the pointer while the camera turns, so the mouse can keep going in one
        // direction without ever reaching the edge of the window.
        const canvas = scene.getScene().getEngine().getRenderingCanvas()

        function startRotate(event: KeyboardEvent){
            if(event.key !== "Shift") return
            if(!rotateEvent){
                canvas?.requestPointerLock?.()
                rotateEvent =  (e: MouseEvent)=>{
                    camera.rotation.y -= e.movementX * 0.002
                    camera.rotation.x -= e.movementY * 0.002
                }
                document.addEventListener("mousemove", rotateEvent)
            }
        }

        function stopRotate(){
            if(rotateEvent) {
                document.removeEventListener("mousemove", rotateEvent)
                rotateEvent = null
                if(document.pointerLockElement === canvas) document.exitPointerLock()
            }
        }

        // Escape releases the pointer by itself, so the rotation has to stop with it.
        const onPointerLockChange = () => { if(!document.pointerLockElement) stopRotate() }
        document.addEventListener("pointerlockchange", onPointerLockChange)

        // Releasing shift anywhere stops it, and so does losing the focus, which eats the release.
        const onRotateKeyUp = (event: KeyboardEvent) => { if(event.key === "Shift") stopRotate() }
        const onRotateLost = () => stopRotate()

        document.addEventListener("keydown", startRotate)
        document.addEventListener("keyup", onRotateKeyUp)
        document.addEventListener("mouseleave", onRotateLost)
        window.addEventListener("blur", onRotateLost)

        // Non XR controllers : the mouse and the keyboard stand in for a pair of hands.
        const hands = simulateControllers(camera)

        const help = showHelpButton()

        return {
            remove(){
                forward.remove()
                backward.remove()
                left.remove()
                right.remove()
                hands.remove()
                help.remove()
                document.removeEventListener("keydown", startRotate)
                document.removeEventListener("keyup", onRotateKeyUp)
                document.removeEventListener("mouseleave", onRotateLost)
                window.removeEventListener("blur", onRotateLost)
                document.removeEventListener("pointerlockchange", onPointerLockChange)
                stopRotate()
            }
        }
    }

}

/**
 * Drive the left and right controller inputs from the mouse and the keyboard, so everything that
 * reads a hand in XR (tools, avatar, menus, pointer behaviors) works the same on a desktop.
 *
 * One hand is selected, the right one to begin with, and space switches to the other. The selected
 * hand is carried a little in front of the camera along the mouse ray and aims along it, the wheel
 * pushing it further or pulling it closer, while the other waits a little in front of its own side.
 * The left click is the selected hand trigger, the right click its grab, ctrl its upper button, e
 * its lower one, the arrow keys the right thumbstick, and a, b, x and y their own buttons.
 */
function simulateControllers(camera: FreeCamera) {

    console.log("[PCPlatform] simulateControllers")

    const scene = SceneManager.getInstance().getScene()

    // The same scenes InputManager is created with, or the picking would miss the utility layer.
    const scenes = [scene, SceneManager.getInstance().getUtilityLayer().utilityLayerScene]

    let selected: "left"|"right" = "right"
    let handDistance = HAND_DISTANCE
    let triggerHeld = false
    let squeezeHeld = false
    let upperHeld = false
    let lowerHeld = false

    // The mouse is tracked here rather than read from scene.pointerX : the camera is created with
    // its controls detached, so the scene never updates its own pointer position.
    const canvas = scene.getEngine().getRenderingCanvas()
    let mouseX = 0
    let mouseY = 0

    const onMouseMove = (event: MouseEvent) => {
        if(!canvas) return
        const bounds = canvas.getBoundingClientRect()
        mouseX = event.clientX - bounds.left
        mouseY = event.clientY - bounds.top
    }

    // Reused every frame : _raytrace copies its arguments, it does not keep them.
    const origin = new Vector3()
    const forward = new Vector3()
    const right = new Vector3()
    const up = new Vector3()

    /** The inputs, once InputManager exists. It is created after this platform, see App. */
    let inputs: InputManager|null = null
    let frames = 0
    const observers: {remove(): void}[] = []

    function press(pressable: {_notify(event: any): void}, pressed: boolean){
        pressable._notify({ pressable, pressed, touched: pressed, value: pressed ? 1 : 0 })
    }

    /** A face button is notified of itself, not of a pressable, so it has its own press. */
    function pressButton(button: ButtonInput, pressed: boolean){
        button._notify({ button, pressed, touched: pressed })
    }

    function selectedHand(): ControllerInput|null {
        return inputs && (selected === "right" ? inputs.right : inputs.left)
    }

    /** The two face buttons of the selected hand : b over a on the right, y over x on the left. */
    function upperButton(){ return inputs && (selected === "right" ? inputs.b_button : inputs.y_button) }
    function lowerButton(){ return inputs && (selected === "right" ? inputs.a_button : inputs.x_button) }

    /** Aim a hand and let it pick, which is all the rest of the app reads of a hand. */
    function place(hand: ControllerInput, isSelected: boolean){
        if(isSelected){
            const ray = scene.createPickingRay(mouseX, mouseY, Matrix.Identity(), camera)
            forward.copyFrom(ray.direction).normalize()
            origin.copyFrom(ray.origin).addInPlace(forward.scale(handDistance))
            up.copyFrom(camera.getDirection(Vector3.Up())).normalize()
        }
        else {
            forward.copyFrom(camera.getDirection(Vector3.Forward())).normalize()
            up.copyFrom(camera.getDirection(Vector3.Up())).normalize()
            const side = camera.getDirection(Vector3.Right()).normalize()
            origin.copyFrom(camera.globalPosition)
                .addInPlace(forward.scale(IDLE_FORWARD))
                .addInPlace(side.scale(hand.side === "left" ? -IDLE_SIDE : IDLE_SIDE))
                .addInPlace(up.scale(-IDLE_DOWN))
        }

        // Babylon is left handed : right is up x forward, and up is squared up against the result.
        Vector3.CrossToRef(up, forward, right)
        right.normalize()
        Vector3.CrossToRef(forward, right, up)
        up.normalize()

        hand.pointer._raytrace(origin, forward, right, up, scenes)
    }

    // Before render, not after physics : the physics engine is only started by a drum kit, and an
    // observable of a scene without one never fires.
    const tick = scene.onBeforeRenderObservable.add(() => {
        if(!inputs){
            inputs = InputManager.getInstance()
            if(!inputs) return
            console.log("[PCPlatform] inputs wired")

            // The buttons and the right thumbstick already know their own keys.
            for(const button of [inputs.x_button, inputs.y_button, inputs.a_button, inputs.b_button]){
                observers.push(button._registerDocumentObserver())
            }
            observers.push(inputs.right.thumbstick._registerKeyObserver(
                "arrowleft", "arrowright", "arrowup", "arrowdown",
            ))
        }

        place(inputs.left, selected === "left")
        place(inputs.right, selected === "right")

        if(frames++ < 3 || frames % 120 === 0){
            const p = selectedHand()!.pointer
            console.log("[PCPlatform]", selected, "mouse", mouseX, mouseY,
                "origin", p.origin.toString(), "forward", p.forward.toString(), "hit", p.hit)
        }
    })

    /** Move what is held onto the other hand, so no press is ever left without its release. */
    function switchHand(){
        const previous = selectedHand()
        if(previous){
            if(triggerHeld) press(previous.trigger, false)
            if(squeezeHeld) press(previous.squeeze, false)
            if(upperHeld) pressButton(upperButton()!, false)
            if(lowerHeld) pressButton(lowerButton()!, false)
        }

        selected = selected === "right" ? "left" : "right"

        const next = selectedHand()
        if(next){
            if(triggerHeld) press(next.trigger, true)
            if(squeezeHeld) press(next.squeeze, true)
            if(upperHeld) pressButton(upperButton()!, true)
            if(lowerHeld) pressButton(lowerButton()!, true)
        }
    }

    function setTrigger(pressed: boolean){
        if(triggerHeld === pressed) return
        triggerHeld = pressed
        const hand = selectedHand()
        if(hand) press(hand.trigger, pressed)
    }

    function setSqueeze(pressed: boolean){
        if(squeezeHeld === pressed) return
        squeezeHeld = pressed
        const hand = selectedHand()
        if(hand) press(hand.squeeze, pressed)
    }

    function setUpper(pressed: boolean){
        if(upperHeld === pressed) return
        upperHeld = pressed
        const button = upperButton()
        if(button) pressButton(button, pressed)
    }

    function setLower(pressed: boolean){
        if(lowerHeld === pressed) return
        lowerHeld = pressed
        const button = lowerButton()
        if(button) pressButton(button, pressed)
    }

    // The help overlay is html over the canvas : clicking it is not a click in the world.
    const onOverlay = (event: MouseEvent) =>
        event.target instanceof Element && !!event.target.closest(".pc-help-button, .pc-help-panel")

    const onMouseDown = (event: MouseEvent) => {
        if(onOverlay(event)) return
        if(event.button === 0) setTrigger(true)
        else if(event.button === 2) setSqueeze(true)
    }

    const onMouseUp = (event: MouseEvent) => {
        if(event.button === 0) setTrigger(false)
        else if(event.button === 2) setSqueeze(false)
    }

    // The grab is the right click, so the browser menu has to stay out of the way.
    const onContextMenu = (event: MouseEvent) => event.preventDefault()

    // Multiplied, not added : a step near the camera has to be smaller than one far from it.
    const onWheel = (event: WheelEvent) => {
        const factor = event.deltaY > 0 ? 1 / HAND_DISTANCE_STEP : HAND_DISTANCE_STEP
        handDistance = Math.min(HAND_DISTANCE_MAX, Math.max(HAND_DISTANCE_MIN, handDistance * factor))
    }

    const onKeyDown = (event: KeyboardEvent) => {
        if(event.repeat) return
        if(event.key === " ") switchHand()
        else if(event.key === "e" || event.key === "E") setLower(true)
        else if(event.key === "Control") setUpper(true)
    }

    const onKeyUp = (event: KeyboardEvent) => {
        if(event.key === "e" || event.key === "E") setLower(false)
        else if(event.key === "Control") setUpper(false)
    }

    // Losing the focus eats the release events, so let go of everything.
    const release = () => {
        setTrigger(false)
        setSqueeze(false)
        setUpper(false)
        setLower(false)
    }

    window.addEventListener("pointermove", onMouseMove)
    document.addEventListener("mousedown", onMouseDown)
    document.addEventListener("mouseup", onMouseUp)
    document.addEventListener("contextmenu", onContextMenu)
    document.addEventListener("wheel", onWheel)
    document.addEventListener("keydown", onKeyDown)
    document.addEventListener("keyup", onKeyUp)
    window.addEventListener("blur", release)

    return {
        remove(){
            release()
            scene.onBeforeRenderObservable.remove(tick)
            observers.forEach(o => o.remove())
            window.removeEventListener("pointermove", onMouseMove)
            document.removeEventListener("mousedown", onMouseDown)
            document.removeEventListener("mouseup", onMouseUp)
            document.removeEventListener("contextmenu", onContextMenu)
            document.removeEventListener("wheel", onWheel)
            document.removeEventListener("keydown", onKeyDown)
            document.removeEventListener("keyup", onKeyUp)
            window.removeEventListener("blur", release)
        }
    }
}

function onKeyPress(scene: Scene, key: string, callback: () => void) {

    let o: any = null

    function press(){
        if(!o){
            o = scene.onAfterPhysicsObservable.add(() => {
                callback()
            })
        }
    }

    function unpress(){
        if(o) {
            scene.onAfterPhysicsObservable.remove(o)
            o = null
        }
    }

    const onKeyDown = (event: KeyboardEvent) => {
        if(event.code === key) press()
    }

    const onKeyUp = (event: KeyboardEvent) => {
        if(event.code === key) unpress()
    }

    document.addEventListener("keydown", onKeyDown)
    window.addEventListener("blur", unpress)
    document.addEventListener("keyup", onKeyUp)

    return {
        remove(){
            document.removeEventListener("keydown", onKeyDown)
            window.removeEventListener("blur", unpress)
            document.removeEventListener("keyup", onKeyUp)
            unpress()
        }
    }

}

/** The keys, listed over the canvas, since a desktop player has no controller to look at. */
const CONTROLS: [string, string][] = [
    ["Z Q S D / W A S D", "se déplacer"],
    ["Shift maintenu + souris", "tourner la caméra"],
    ["Souris", "viser avec la main sélectionnée"],
    ["Molette", "rapprocher ou éloigner la main"],
    ["Espace", "changer de main"],
    ["Clic gauche", "gâchette"],
    ["Clic droit", "attraper"],
    ["Ctrl", "bouton du haut (B ou Y)"],
    ["E", "bouton du bas (A ou X)"],
    ["Flèches", "joystick droit"],
    ["A B X Y", "les quatre boutons"],
]

/**
 * A button in the top left corner that unfolds the list of the keys. Plain DOM over the canvas :
 * the guide has to be readable before the scene is understood, and on a desktop there is no hand to
 * hold a panel in the world.
 */
function showHelpButton(){

    const style = document.createElement("style")
    style.textContent = `
        .pc-help-button, .pc-help-panel {
            position: fixed; left: 12px; z-index: 1000;
            font-family: system-ui, sans-serif; color: #eee;
            background: rgba(20,20,28,.85); border: 1px solid rgba(255,255,255,.2);
            border-radius: 8px;
        }
        .pc-help-button {
            top: 12px; width: 32px; height: 32px; font-size: 18px;
            cursor: pointer; padding: 0;
        }
        .pc-help-button:hover { background: rgba(50,50,70,.9); }
        .pc-help-panel {
            top: 52px; padding: 10px 14px; font-size: 13px; line-height: 1.6;
            max-width: 320px;
        }
        .pc-help-panel table { border-spacing: 10px 0; }
        .pc-help-panel td:first-child { color: #9ad; white-space: nowrap; }
    `
    document.head.appendChild(style)

    const button = document.createElement("button")
    button.className = "pc-help-button"
    button.textContent = "?"
    button.title = "Guide des touches"

    const panel = document.createElement("div")
    panel.className = "pc-help-panel"
    panel.style.display = "none"
    panel.innerHTML = "<table>" + CONTROLS
        .map(([key, what]) => `<tr><td>${key}</td><td>${what}</td></tr>`)
        .join("") + "</table>"

    // The canvas keeps the keyboard, or the very keys being listed would stop working.
    const toggle = (event: MouseEvent) => {
        event.stopPropagation()
        panel.style.display = panel.style.display === "none" ? "block" : "none"
        button.blur()
    }
    button.addEventListener("click", toggle)

    document.body.appendChild(button)
    document.body.appendChild(panel)

    return {
        remove(){
            button.removeEventListener("click", toggle)
            button.remove()
            panel.remove()
            style.remove()
        }
    }
}
