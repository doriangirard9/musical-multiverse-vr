import { Observable, WebXRAbstractMotionController } from "@babylonjs/core"


export interface AxisInputEvent{
    axis: AxisInput
    x: number
    y: number
}

/**
 * Repredents a pressable (squeeze and trigger) input in XR.
 * Useful to handle pressable inputs in XR controllers.
 */
export class AxisInput {

    /** Observable that notifies when the pressable input state changes.  */
    readonly on_change = new Observable<AxisInputEvent>()

    /** Observable that notifies when the value of the pressable input changes.  */
    readonly on_value_change = new Observable<AxisInputEvent>()

    /**
     * Get the position of the axis input on the x-axis.
     * This is typically a value between -1 and 1, where 0 is the center position.
     * For example, on a joystick, -1 might represent full left, 0 is center, and 1 is full right.
     * * @returns The x position of the axis input.
     */
    get x(): number { return this.state.x }

    /**
     * Get the position of the axis input on the y-axis.
     * This is typically a value between -1 and 1, where 0 is the center position.
     * For example, on a joystick, -1 might represent full down, 0 is center, and 1 is full up.
     * * @returns The y position of the axis input.
     */
    get y(): number { return this.state.y }

    /**
     * Repeatedly call a function while the axis input is being used.
     * @param interval The interval in milliseconds between each call.
     * @param on_tick The function to call at each interval.
     * @param on_start Optional function to call when the axis input starts being used (e.g., when the joystick is moved).
     * @param on_ron_endelease Optional function to call when the axis input stops being used (e.g., when the joystick returns to center).
     * @returns A function to stop the interval and remove the observers.
     */
    setPullInterval(interval: number, on_tick: (x:number,y:number) => void, on_start?: () => void, on_end?: () => void): {remove():void} {
        let intervol: any = null

        let o1 = this.on_value_change.add((event) => {
            if(!intervol) {
                if(event.x !== 0 || event.y !== 0){
                    on_start?.()
                    intervol = setInterval(() => on_tick(this.state.x, this.state.y), interval)
                }
            }
            else{
                if(event.x == 0 && event.y == 0) {
                    clearInterval(intervol)
                    intervol = null
                    on_end?.()
                }
            }
        })
        return {
            remove: () => {
                o1.remove()
                if(intervol) clearInterval(intervol)
            }
        }
    }


    constructor(readonly side: "left"|"right", readonly keys: [string,string,string,string]){}

    private state = {x:0, y:0}

    /**
     * Send a notification about the pressable input state change.
     * @param event 
     */
    _notify(event: AxisInputEvent){
        this.on_change.notifyObservers(event)
        if(event.x!==this.state.x || event.y!==this.state.y) { this.on_value_change.notifyObservers(event)}
        this.state.x = event.x
        this.state.y = event.y
    }


    /**
     * Make the button input state change on webxr inputs source
     * @param inputSource 
     */
    _registerXRObserver(motionController: WebXRAbstractMotionController): {remove(): void} {
        if(motionController.handness !== this.side) return { remove: () => {} }
        return motionController.getComponent("xr-standard-thumbstick")?.onAxisValueChangedObservable.add((event) => {
            this._notify({ axis: this, x: event.x, y: -event.y })
        })
    }

    /**
     * Make the button input state change on keyboard and mouse inputs
     * @param inputSource 
     */
    _registerDocumentObserver(): {remove(): void} {
        const im = this
        
        let presseds = [false, false, false, false]

        function updateState() {
            let x = 0
            let y = 0
            if(presseds[0]) x -= 1 // Left
            if(presseds[1]) x += 1 // Right
            if(presseds[2]) y += 1 // Up
            if(presseds[3]) y -= 1 // Down
            im._notify({ axis: im, x, y })
        }

        // Handle keydown events
        const onkeydown = (event: KeyboardEvent) => {
            if(event.repeat) return
            const keyIndex = this.keys.indexOf(event.key.toLocaleLowerCase())
            if(keyIndex === -1) return

            presseds[keyIndex] = true
            updateState()
        }
        document.addEventListener("keydown", onkeydown)


        // Handle keyup events
        const onkeyup = (event: {key:string}) => {
            const keyIndex = this.keys.indexOf(event.key.toLocaleLowerCase())
            if(keyIndex === -1) return

            presseds[keyIndex] = false
            updateState()
        }
        document.addEventListener("keyup", onkeyup)

        // Call keydown on blur to ensure the button is released when the window loses focus
        // This is useful to prevent the button from being stuck pressed when the user switches to another tab
        const onblur = ()=>{
            presseds = [false, false, false, false]
            updateState()
        }
        window.addEventListener("blur", onblur)

        return {
            remove() {
                document.removeEventListener("keydown", onkeydown)
                document.removeEventListener("keyup", onkeyup)
                window.removeEventListener("blur", onblur)
            },
        }
    }

    _registerMouseWheelObserver(): {remove(): void}{
        const im = this

        let intervol: any = null

        const onscroll = (event: WheelEvent) => {
            if(intervol)clearInterval(intervol)
            im._notify({ axis: im, x: -Math.sign(event.deltaX), y: -Math.sign(event.deltaY)})
            intervol = setInterval(()=>{
                im._notify({ axis: im, x: 0, y: 0})
                clearInterval(intervol)
                intervol = null
            },250)
        }

        document.addEventListener("wheel", onscroll)

        return {
            remove() {
                document.removeEventListener("wheel", onscroll)
                if(intervol) clearInterval(intervol)
            }
        }
    }


}