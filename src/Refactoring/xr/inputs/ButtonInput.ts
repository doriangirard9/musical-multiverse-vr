import { Observable, WebXRAbstractMotionController } from "@babylonjs/core"


export interface ButtonInputEvent{
    button: ButtonInput
    pressed: boolean
    touched: boolean
}

/**
 * Repredents a button input in XR.
 * Useful to handle button presses, touches, and releases in XR controllers.
 */
export class ButtonInput {

    /** Observable that notifies when the button input state changes.  */
    readonly on_change = new Observable<ButtonInputEvent>()
    
    /** Observable that notifies when the button is pressed down.  */
    readonly on_down = new Observable<ButtonInputEvent>()
    
    /** Observable that notifies when the button is released (up).  */
    readonly on_up = new Observable<ButtonInputEvent>()
    
    /** Observable that notifies when the button is touched.  */
    readonly on_touch = new Observable<ButtonInputEvent>()
    
    /** Observable that notifies when the button stop being touched.  */
    readonly on_untouch = new Observable<ButtonInputEvent>()

    /**
     * Is the button currently pressed?
     * @returns true if the button is pressed, false otherwise.
     */
    isPressed(): boolean { return this.state.is_pressed }

    /**
     * Is the button currently touched?
     * @returns true if the button is touched, false otherwise.
     */
    isTouched(): boolean { return this.state.is_touched }

    /**
     * Repeatedly call a function while the button is pressed.
     * @param interval The interval in milliseconds between each call.
     * @param on_tick The function to call at each interval.
     * @param on_press Optional function to call when the button is pressed down.
     * @param on_release Optional function to call when the button is released (up).
     * @returns A function to stop the interval and remove the observers.
     */
    setPressInterval(interval: number, on_tick: () => void, on_press?: () => void, on_release?: () => void): {remove():void} {
        let intervol: any = null

        let o1 = this.on_down.add(() => {
            on_press?.()
            intervol = setInterval(on_tick, interval)
        })

        let o2 = this.on_up.add(() => {
            on_release?.()
            clearInterval(intervol)
            intervol = null
        })

        return {remove:() => {
            this.on_down.remove(o1)
            this.on_up.remove(o2)
            if(intervol) clearInterval(intervol)
        }}
    }


    constructor(
        readonly name: "x-button"|"y-button"|"a-button"|"b-button",
        readonly side: "none"|"left"|"right",
        readonly key: string
    ){}

    private state = {is_pressed:false, is_touched:false}

    /**
     * Send a notification about the button input state change.
     * @param event 
     */
    _notify(event: ButtonInputEvent){
        this.on_change.notifyObservers(event)
        if(event.pressed && !this.state.is_pressed) this.on_down.notifyObservers(event)
        if(!event.pressed && this.state.is_pressed) this.on_up.notifyObservers(event)
        if(event.touched && !this.state.is_touched) this.on_touch.notifyObservers(event)
        if(!event.touched && this.state.is_touched) this.on_untouch.notifyObservers(event)
        this.state.is_pressed = event.pressed
        this.state.is_touched = event.touched
    }


    /**
     * Make the button input state change on webxr inputs source
     * @param inputSource 
     */
    _registerXRObserver(motionController: WebXRAbstractMotionController): {remove(): void} {
        return motionController.getComponent(this.name)?.onButtonStateChangedObservable.add((event) => {
            this._notify({ button: this, pressed:event.pressed, touched: event.touched})
        })
    }

    /**
     * Make the button input state change on keyboard and mouse inputs
     * @param inputSource 
     */
    _registerDocumentObserver(): {remove(): void} {
        let isPressed = false

        // Handle keydown events
        const onkeydown = (event: KeyboardEvent) => {
            if(event.repeat || event.key.toLocaleLowerCase()!=this.key) return
            this._notify({ button: this, pressed:true, touched:this.state.is_touched })
            isPressed = true
        }
        document.addEventListener("keydown", onkeydown)


        // Handle keyup events
        const onkeyup = (event: {key:string}) => {
            if(event.key.toLocaleLowerCase()!=this.key) return
            this._notify({ button: this, pressed:false, touched:this.state.is_touched })
            isPressed = false
        }

        document.addEventListener("keyup", onkeyup)

        // Call keydown on blur to ensure the button is released when the window loses focus
        // This is useful to prevent the button from being stuck pressed when the user switches to another tab
        const onblur = ()=>{ if(isPressed) onkeyup({key:this.key}) }
        window.addEventListener("blur", onblur)

        return {
            remove() {
                document.removeEventListener("keydown", onkeydown)
                document.removeEventListener("keyup", onkeyup)
                window.removeEventListener("blur", onblur)
            },
        }
    }


}