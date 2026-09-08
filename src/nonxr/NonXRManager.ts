import {withTimeout} from "../utils/utils.ts";
import {FreeCamera, Nullable, Scene, Vector3} from "@babylonjs/core";
import { InputManager } from "../xr/inputs/InputManager.ts";
import { SceneManager } from "../app/SceneManager.ts";

/**
 * Responsible for the NON XR (desktop, phone, ...) experience, camera, player controls. 
 */
export class NonXRManager {

    private static _instance: NonXRManager;

    constructor(
        private _scene: Scene,
    ) {}

    public static getInstance(): NonXRManager {
        return this._instance;
    }

    public static async initialize(...parameters: ConstructorParameters<typeof NonXRManager>){
        this._instance = new NonXRManager(...parameters)

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

        function startRotate(event: MouseEvent){
            if(event.button !== 1) return
            if(!rotateEvent){
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
            }
        }

        document.addEventListener("mousedown", startRotate)
        document.addEventListener("mouseup", stopRotate)
        document.addEventListener("mouseleave", stopRotate)
        window.addEventListener("blur", stopRotate)


        return {
            remove(){
                forward.remove()
                backward.remove()
                left.remove()
                right.remove()
            }
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

    InputManager

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

