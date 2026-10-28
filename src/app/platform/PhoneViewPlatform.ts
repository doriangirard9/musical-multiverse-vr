import { FreeCamera, FreeCameraDeviceOrientationInput, Vector3 } from "@babylonjs/core";
import { InputManager } from "../../xr/inputs/InputManager.ts";
import { ControllerInput } from "../../xr/inputs/ControllerInput.ts";
import { SceneManager } from "../SceneManager.ts";
import { CAMERA_HEIGHT, IDLE_DOWN, IDLE_FORWARD, IDLE_SIDE } from "./PCPlatform.ts";

/** How far the knob can leave the center of the joystick, in css pixels. */
const JOYSTICK_RADIUS = 60

/** Meters per second when the knob is pushed to the edge. */
const WALK_SPEED = 2

/**
 * Responsible for the phone experience : the phone is a window on the world, turned by turning the
 * phone itself, and a joystick that appears under the finger walks the player around.
 */
export class PhoneViewPlatform {

    private static _instance: PhoneViewPlatform

    constructor() {}

    public static getInstance(): PhoneViewPlatform {
        return this._instance
    }

    /**
     * Whether the device is held in the hand : a touch screen and no mouse. A laptop with a touch
     * screen still has a fine pointer, and stays on the PC platform.
     */
    public static isPhone(): boolean {
        return matchMedia("(pointer: coarse)").matches && !matchMedia("(any-pointer: fine)").matches
    }

    public static async initialize(...parameters: ConstructorParameters<typeof PhoneViewPlatform>){
        this._instance = new PhoneViewPlatform(...parameters)

        const scene = SceneManager.getInstance()
        scene.getScene().createDefaultCamera(false,false,false)

        const camera = scene.getScene().activeCamera!! as FreeCamera
        camera.position = new Vector3(0,CAMERA_HEIGHT,0)
        camera.setTarget(new Vector3(1,CAMERA_HEIGHT,0))
        camera.minZ = 0.01
        camera.maxZ = 1000

        const fullscreen = fullscreenOnTouch()
        const gyroscope = enableGyroscope(camera)
        const joystick = touchJoystick(camera)
        const hands = idleHands(camera)

        return {
            remove(){
                fullscreen.remove()
                gyroscope.remove()
                joystick.remove()
                hands.remove()
            }
        }
    }

}

/**
 * Put the page in fullscreen on every touch while it is not, since the browser only allows it from
 * a gesture and leaving it (the back gesture, a notification) does not ask before.
 *
 * The whole page goes fullscreen and not only the canvas, or the joystick laid over it would be
 * hidden. The iPhone has no fullscreen for a page at all : there, nothing happens.
 */
function fullscreenOnTouch(){

    const onTouch = () => {
        if(document.fullscreenElement || !document.documentElement.requestFullscreen) return
        document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => {})
    }

    window.addEventListener("touchend", onTouch)

    return {
        remove(){
            window.removeEventListener("touchend", onTouch)
            if(document.fullscreenElement) document.exitFullscreen().catch(() => {})
        }
    }
}

/**
 * Turn the camera with the phone.
 *
 * On iOS the sensor is behind a permission that can only be asked from a touch, so there the
 * gyroscope starts on the first touch instead of right away.
 */
function enableGyroscope(camera: FreeCamera){

    // The camera keeps only this input : the default ones would also turn it on a drag.
    camera.inputs.clear()

    const start = () => {
        camera.inputs.add(new FreeCameraDeviceOrientationInput())
        camera.attachControl(true)
    }

    const needsPermission = typeof (DeviceOrientationEvent as any)?.requestPermission === "function"
    const onFirstTouch = () => {
        window.removeEventListener("touchend", onFirstTouch)
        start()
    }

    if(needsPermission) window.addEventListener("touchend", onFirstTouch)
    else start()

    return {
        remove(){
            window.removeEventListener("touchend", onFirstTouch)
            camera.detachControl()
            camera.inputs.clear()
        }
    }
}

/**
 * A joystick that appears where the finger lands and walks the player while the finger is held.
 * Only the first finger drives it, so a second one does not make it jump.
 */
function touchJoystick(camera: FreeCamera){

    const scene = SceneManager.getInstance().getScene()
    const canvas = scene.getEngine().getRenderingCanvas()

    const base = document.createElement("div")
    base.style.cssText = `
        position: fixed; z-index: 1000; display: none; pointer-events: none;
        width: ${JOYSTICK_RADIUS*2}px; height: ${JOYSTICK_RADIUS*2}px;
        margin: -${JOYSTICK_RADIUS}px 0 0 -${JOYSTICK_RADIUS}px;
        border-radius: 50%; border: 2px solid rgba(255,255,255,.5); background: rgba(20,20,28,.3);
    `
    const knob = document.createElement("div")
    knob.style.cssText = `
        position: absolute; left: 50%; top: 50%; width: 50px; height: 50px; margin: -25px 0 0 -25px;
        border-radius: 50%; background: rgba(255,255,255,.7);
    `
    base.appendChild(knob)
    document.body.appendChild(base)

    let finger: number|null = null
    let centerX = 0
    let centerY = 0

    // Where the knob is pushed, from -1 to 1 on each axis, y pointing up the screen.
    let pushX = 0
    let pushY = 0

    const onDown = (event: PointerEvent) => {
        if(finger !== null || event.pointerType === "mouse") return
        finger = event.pointerId
        centerX = event.clientX
        centerY = event.clientY
        base.style.left = `${centerX}px`
        base.style.top = `${centerY}px`
        base.style.display = "block"
        knob.style.transform = ""
    }

    const onMove = (event: PointerEvent) => {
        if(event.pointerId !== finger) return
        let dx = event.clientX - centerX
        let dy = event.clientY - centerY
        const length = Math.hypot(dx, dy)
        if(length > JOYSTICK_RADIUS){
            dx *= JOYSTICK_RADIUS / length
            dy *= JOYSTICK_RADIUS / length
        }
        knob.style.transform = `translate(${dx}px, ${dy}px)`
        pushX = dx / JOYSTICK_RADIUS
        pushY = -dy / JOYSTICK_RADIUS
    }

    const onUp = (event: PointerEvent) => {
        if(event.pointerId !== finger) return
        finger = null
        pushX = 0
        pushY = 0
        base.style.display = "none"
    }

    // Reused every frame.
    const forward = new Vector3()
    const right = new Vector3()

    // The push is a speed, carried into a step by the time the frame took, so the walk does not
    // depend on the frame rate.
    const tick = scene.onBeforeRenderObservable.add(() => {
        if(pushX === 0 && pushY === 0) return
        const seconds = scene.getEngine().getDeltaTime() / 1000

        camera.getDirectionToRef(Vector3.Forward(), forward)
        camera.getDirectionToRef(Vector3.Right(), right)
        forward.y = 0
        right.y = 0
        // Looking straight down leaves no forward to walk along.
        if(forward.lengthSquared() < 1e-6 || right.lengthSquared() < 1e-6) return
        forward.normalize()
        right.normalize()

        camera.position.addInPlace(forward.scaleInPlace(pushY * WALK_SPEED * seconds))
        camera.position.addInPlace(right.scaleInPlace(pushX * WALK_SPEED * seconds))
    })

    // Without it, the browser takes the drag as a scroll or a zoom of the page.
    const previousTouchAction = canvas?.style.touchAction ?? ""
    if(canvas) canvas.style.touchAction = "none"

    canvas?.addEventListener("pointerdown", onDown)
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)

    return {
        remove(){
            scene.onBeforeRenderObservable.remove(tick)
            canvas?.removeEventListener("pointerdown", onDown)
            window.removeEventListener("pointermove", onMove)
            window.removeEventListener("pointerup", onUp)
            window.removeEventListener("pointercancel", onUp)
            if(canvas) canvas.style.touchAction = previousTouchAction
            base.remove()
        }
    }
}

/**
 * Keep both hands where the PC platform keeps its idle one, a little in front of their own side,
 * so the avatar and everything that reads a hand still find one.
 */
function idleHands(camera: FreeCamera){

    const scene = SceneManager.getInstance().getScene()

    // The same scenes InputManager is created with, or the picking would miss the utility layer.
    const scenes = [scene, SceneManager.getInstance().getUtilityLayer().utilityLayerScene]

    // Reused every frame : _raytrace copies its arguments, it does not keep them.
    const origin = new Vector3()
    const forward = new Vector3()
    const right = new Vector3()
    const up = new Vector3()
    const side = new Vector3()

    /** The inputs, once InputManager exists. */
    let inputs: InputManager|null = null

    function place(hand: ControllerInput){
        camera.getDirectionToRef(Vector3.Forward(), forward)
        camera.getDirectionToRef(Vector3.Up(), up)
        camera.getDirectionToRef(Vector3.Right(), side)
        forward.normalize()
        up.normalize()
        side.normalize()
        origin.copyFrom(camera.globalPosition)
            .addInPlace(forward.scale(IDLE_FORWARD))
            .addInPlace(side.scale(hand.side === "left" ? -IDLE_SIDE : IDLE_SIDE))
            .addInPlace(up.scale(-IDLE_DOWN))

        // Babylon is left handed : right is up x forward, and up is squared up against the result.
        Vector3.CrossToRef(up, forward, right)
        right.normalize()
        Vector3.CrossToRef(forward, right, up)
        up.normalize()

        hand.pointer._raytrace(origin, forward, right, up, scenes)
    }

    const tick = scene.onBeforeRenderObservable.add(() => {
        inputs ??= InputManager.getInstance()
        if(!inputs) return
        place(inputs.left)
        place(inputs.right)
    })

    return {
        remove(){
            scene.onBeforeRenderObservable.remove(tick)
        }
    }
}
