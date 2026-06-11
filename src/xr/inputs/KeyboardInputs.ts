

/**
 * An helper class to register callbacks for keyboard inputs.
 * More optimised and easier to use than the standard event listeners.
 * It correct many issues with the standard event listeners, like:
 * - It fire keydown events only once and ignore repeated keydown events.
 * - It fire keyup events when the window loses focus, to ensure that all keys are released.
 * - It treat mouse inputs as keyboard keys "RightClick", "LeftClick" and "MiddleClick".
 * 
 */
export class KeyboardInputs{

    public onUp(key: string, callback: (event: KeyboardEvent|MouseEvent)=>void): void {
        const keyd = key.toLocaleLowerCase()
        this.on_up[keyd] ??= []
        this.on_up[keyd].push(callback)
    }

    public onDown(key: string, callback: (event: KeyboardEvent|MouseEvent)=>void): void {
        const keyd = key.toLocaleLowerCase()
        this.on_down[keyd] ??= []
        this.on_down[keyd].push(callback)
    }



    private static instance = new KeyboardInputs()
    public static getInstance(): KeyboardInputs { return this.instance }


    private constructor(){
        document.addEventListener("mousedown", (event) => {
            const keyd = event.button === 0 ? "leftclick" : event.button === 1 ? "middleclick" : "rightclick"
            if(this.downs.has(keyd)) return
            this.downs.add(keyd)
            this.on_down[keyd]?.forEach(callback => callback(event))
        })

        document.addEventListener("mouseup", (event) => {
            const keyd = event.button === 0 ? "leftclick" : event.button === 1 ? "middleclick" : "rightclick"
            if(!this.downs.has(keyd)) return
            this.downs.delete(keyd)
            this.on_up[keyd]?.forEach(callback => callback(event))
        })

        document.addEventListener("keydown", (event) => {
            if(event.repeat) return 
            const keyd = event.key.toLocaleLowerCase()
            if(this.downs.has(keyd)) return
            this.downs.add(keyd)
            this.on_down[keyd]?.forEach(callback => callback(event))
        })

        document.addEventListener("keyup", (event) => {
            const keyd = event.key.toLocaleLowerCase()
            if(!this.downs.has(keyd)) return
            this.downs.delete(keyd)
            this.on_up[keyd]?.forEach(callback => callback(event))
        })

        window.addEventListener("blur", () => {
            this.downs.forEach(key => {
                this.on_up[key]?.forEach(callback => callback(new KeyboardEvent("keyup", {key})))
            })
            this.downs.clear()
        })
    }

    private downs = new Set<string>()
    private on_down: Record<string, ((event: KeyboardEvent|MouseEvent)=>void)[]> = {}
    private on_up: Record<string, ((event: KeyboardEvent|MouseEvent)=>void)[]> = {}

    




}