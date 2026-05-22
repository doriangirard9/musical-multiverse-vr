import { Observable, WebXRAbstractMotionController } from "@babylonjs/core"
import { ControllerInput } from "./ControllerInput"


export interface PressableInputEvent{
    pressable: PressableInput
    pressed: boolean
    value: number
    touched: boolean
}

/**
 * Repredents a pressable (squeeze and trigger) input in XR.
 * Useful to handle pressable inputs in XR controllers.
 */
export class PressableInput {

    /** Observable that notifies when the pressable input state changes.  */
    readonly onChange = new Observable<PressableInputEvent>()
    
    /** Observable that notifies when the button is pressed down.  */
    readonly onDown = new Observable<PressableInputEvent>()
    
    /** Observable that notifies when the button is released (up).  */
    readonly onUp = new Observable<PressableInputEvent>()
    
    /** Observable that notifies when the button is touched.  */
    readonly onTouch = new Observable<PressableInputEvent>()
    
    /** Observable that notifies when the button stop being touched.  */
    readonly onUntouch = new Observable<PressableInputEvent>()

    /** Observable that notifies when the value of the pressable input changes.  */
    readonly onValueChange = new Observable<PressableInputEvent>()

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
     * Get the current value of the pressable input.
     * @returns The value of the pressable input, typically between 0 and 1.
     */
    getValue(): number { return this.state.value}

    /**
     * Repeatedly call a function while the button is pressed.
     * @param interval The interval in milliseconds between each call.
     * @param on_tick The function to call at each interval.
     * @param on_press Optional function to call when the button is pressed down.
     * @param on_release Optional function to call when the button is released (up).
     * @returns A function to stop the interval and remove the observers.
     */
    setPressInterval(interval: number, on_tick: (value:number) => void, on_press?: () => void, on_release?: () => void): {remove():void} {
        let intervol: any = null

        let o1 = this.onDown.add(() => {
            on_press?.()
            intervol = setInterval(()=>on_tick(this.state.value), interval)
        })

        let o2 = this.onUp.add(() => {
            on_release?.()
            clearInterval(intervol)
            intervol = null
        })

        return {remove:() => {
            this.onDown.remove(o1)
            this.onUp.remove(o2)
            if(intervol) clearInterval(intervol)
        }}
    }


    constructor(
        readonly controller: ControllerInput,
        readonly name: "xr-standard-trigger"|"xr-standard-squeeze",
        readonly side: "none"|"left"|"right",
    ){}

    private state = {value:0, is_pressed:false, is_touched:false}

    /**
     * Send a notification about the pressable input state change.
     * @param event 
     */
    _notify(event: PressableInputEvent){
        const oldState = {...this.state}

        this.state.value = event.value
        this.state.is_pressed = event.pressed
        this.state.is_touched = event.touched

        this.onChange.notifyObservers(event)
        if(event.pressed && !oldState.is_pressed) this.onDown.notifyObservers(event)
        if(!event.pressed && oldState.is_pressed) this.onUp.notifyObservers(event)
        if(event.touched && !oldState.is_touched) this.onTouch.notifyObservers(event)
        if(!event.touched && oldState.is_touched) this.onUntouch.notifyObservers(event)
        if(event.value !== oldState.value) { this.onValueChange.notifyObservers(event)}
        
    }


    /**
     * Make the button input state change on webxr inputs source
     * @param inputSource 
     */
    _registerXRObserver(motionController: WebXRAbstractMotionController): {remove(): void} {
        if(motionController.handness !== this.side) return { remove: () => {} }
        
        return motionController.getComponent(this.name)?.onButtonStateChangedObservable.add((event) => {
            const pressed = event.value > 0.01
            this._notify({ pressable: this, pressed, touched: event.touched, value: event.value || 0})
        })
    }
    
    _registerKeyObserver(key: string): {remove(): void} {
        let isPressed = false

        const onkeydown = (event: KeyboardEvent) => {
            if(event.repeat || event.key.toLocaleLowerCase()!=key) return
            this._notify({ pressable: this, pressed:true, touched:this.state.is_touched, value: 1 })
            isPressed = true
        }
        document.addEventListener("keydown", onkeydown)

        const onkeyup = (event: {key:string}) => {
            if(event.key.toLocaleLowerCase()!=key) return
            this._notify({ pressable: this, pressed:false, touched:this.state.is_touched, value: 0 })
            isPressed = false
        }
        document.addEventListener("keyup", onkeyup)

        const onblur = ()=>{ if(isPressed) onkeyup({key:key}) }
        window.addEventListener("blur", onblur)

        return {
            remove() {
                document.removeEventListener("keydown", onkeydown)
                document.removeEventListener("keyup", onkeyup)
                window.removeEventListener("blur", onblur)
            }
        }
    }

    _registerMouseObserver(mouseKey: number): {remove(): void} {
        let isPressed = false

        const onmousedown = (event: MouseEvent) => {
            if(event.button !== mouseKey) return
            if(!isPressed) this._notify({ pressable: this, pressed:true, touched:this.state.is_touched, value: 1 })
            isPressed = true
        }

        const onmouseup = (event: MouseEvent) => {
            if(event.button !== mouseKey) return
            if(isPressed) this._notify({ pressable: this, pressed:false, touched:this.state.is_touched, value: 0 })
            isPressed = false
        }

        const onblur = ()=>{
            if(isPressed) this._notify({ pressable: this, pressed:false, touched:this.state.is_touched, value: 0 })
            isPressed = false
        }

        const onfocus = (e:MouseEvent)=>{
            if(isPressed && (e.buttons & (1 << mouseKey))==0){
                this._notify({ pressable: this, pressed:false, touched:this.state.is_touched, value: 1 })
                isPressed = false
                console.log("force mouse up")
            }
        }


        document.addEventListener("mousedown", onmousedown)
        document.addEventListener("mouseup", onmouseup)
        window.addEventListener("blur", onblur)
        document.addEventListener("mouseenter", onfocus)

        return {
            remove() {
                document.removeEventListener("mousedown", onmousedown)
                document.removeEventListener("mouseup", onmouseup)
                window.removeEventListener("blur", onblur)
            }
        }
    }

    _registerDocumentObserver(input: string|number): {remove(): void} {
        if(typeof input === "string") return this._registerKeyObserver(input)
        else return this._registerMouseObserver(input)
    }

}