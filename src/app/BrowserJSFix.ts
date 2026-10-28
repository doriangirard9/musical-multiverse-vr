
/**
 * Fix of some missing or badly implemented browser features.
 */
export class BrowserJSFix {

    static fix(){
        // Patching twice would stack the wrappers, as a hot reload would do
        if((BaseAudioContext.prototype as any)._browserjs_fixed) return
        ;(BaseAudioContext.prototype as any)._browserjs_fixed = true

        //// Firefox AudioListener has no AudioParam, only setPosition and setOrientation ////
        // Solution: Fake AudioParams replay their own timeline, and push the result through the
        // old methods about every frame.
        if(!("positionX" in AudioListener.prototype)){

            // Solution: The listener does not know its context, so the context tags it
            const old_listener = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, "listener")!.get!
            Object.defineProperty(BaseAudioContext.prototype, "listener", {
                configurable: true,
                get(this:any){
                    const listener = old_listener.call(this)
                    listener._context ??= this
                    return listener
                },
            })

            const names = ["positionX","positionY","positionZ","forwardX","forwardY","forwardZ","upX","upY","upZ"]
            const defaults = [0, 0, 0, 0, 0, -1, 0, 1, 0]

            // Value at a time, a ramp being read from the event before it
            function value_at(events: any[], time: number){
                let value = events[0].value
                let from = events[0].time
                for(let i=1; i<events.length; i++){
                    const e = events[i]
                    if(e.time > time){
                        if(e.type === "linear") return value + (e.value - value) * (time - from) / (e.time - from)
                        if(e.type === "exponential" && value * e.value > 0) return value * Math.pow(e.value / value, (time - from) / (e.time - from))
                        return value
                    }
                    if(e.type === "target"){
                        const until = events[i+1]?.time <= time ? events[i+1].time : time
                        value = e.value + (value - e.value) * Math.exp(-(until - e.time) / e.timeConstant)
                        from = until
                    }
                    else{
                        value = e.value
                        from = e.time
                    }
                }
                return value
            }

            function fake_param(context: BaseAudioContext, default_value: number){
                const param: any = {
                    events: [{ type: "set", time: 0, value: default_value }],
                    defaultValue: default_value,
                    minValue: -3.4028234663852886e38,
                    maxValue: 3.4028234663852886e38,
                    automationRate: "a-rate",
                    get value(){ return value_at(this.events, context.currentTime) },
                    set value(v: number){ this.setValueAtTime(v, context.currentTime) },
                    insert(event: any){
                        let i = this.events.length
                        while(i > 1 && this.events[i-1].time > event.time) i--
                        this.events.splice(i, 0, event)
                        return this
                    },
                    setValueAtTime(value: number, time: number){ return this.insert({ type: "set", time, value }) },
                    linearRampToValueAtTime(value: number, time: number){ return this.insert({ type: "linear", time, value }) },
                    exponentialRampToValueAtTime(value: number, time: number){ return this.insert({ type: "exponential", time, value }) },
                    setTargetAtTime(value: number, time: number, timeConstant: number){ return this.insert({ type: "target", time, value, timeConstant }) },
                    setValueCurveAtTime(values: number[], time: number, duration: number){
                        const curve = [...values]
                        if(curve.length) this.setValueAtTime(curve[0], time)
                        for(let i=1; i<curve.length; i++) this.linearRampToValueAtTime(curve[i], time + duration * i / (curve.length-1))
                        return this
                    },
                    cancelScheduledValues(time: number){
                        this.events = this.events.filter((e: any, i: number) => i === 0 || e.time < time)
                        return this
                    },
                    cancelAndHoldAtTime(time: number){
                        const held = value_at(this.events, time)
                        this.cancelScheduledValues(time)
                        return this.setValueAtTime(held, time)
                    },
                    // The past is replaced by its value now: a ramp read from a point on itself is the
                    // same ramp, and an approach to a target starts over the same from anywhere
                    prune(now: number){
                        const value = value_at(this.events, now)
                        const past = this.events.filter((e: any) => e.time <= now)
                        const last = past[past.length-1]
                        const future = this.events.filter((e: any) => e.time > now)
                        this.events = [{ type: "set", time: now, value }]
                        if(last?.type === "target") this.events.push({ ...last, time: now })
                        this.events.push(...future)
                        return value
                    },
                }
                return param
            }

            function params_of(listener: any){
                if(listener._params) return listener._params

                const context = listener._context as BaseAudioContext
                const params = names.map((_, i) => fake_param(context, defaults[i]))
                listener._params = params

                let previous = ""
                setInterval(() => {
                    if(context.state === "closed") return
                    const now = context.currentTime
                    const [px, py, pz, fx, fy, fz, ux, uy, uz] = params.map((p: any) => p.prune(now))

                    // Only when it moved, the old methods jump at once
                    const current = `${px},${py},${pz},${fx},${fy},${fz},${ux},${uy},${uz}`
                    if(current === previous) return
                    previous = current
                    listener.setPosition(px, py, pz)
                    listener.setOrientation(fx, fy, fz, ux, uy, uz)
                }, 1000/60)

                return params
            }

            names.forEach((name, i) => {
                Object.defineProperty(AudioListener.prototype, name, {
                    configurable: true,
                    get(this:any){ return params_of(this)[i] },
                })
            })
        }


        //// The WAM SDK adds its 7 modules again for every node, each from a new blob URL ////
        // Chrome evaluates and keeps every one of them in the same worklet scope, and addModule ends
        // up never resolving once enough WAMs were loaded.
        // Solution: A blob whose text was already added to this worklet is not added again
        if(typeof AudioWorklet !== "undefined"){
            const old_add_module = AudioWorklet.prototype.addModule
            const loaded = new WeakMap<AudioWorklet, Map<string, Promise<void>>>()
            AudioWorklet.prototype.addModule = async function(this:any, url: string|URL, options?: WorkletOptions){
                const href = url.toString()
                if(!href.startsWith("blob:")) return old_add_module.call(this, url, options)

                const text = await (await fetch(href)).text()

                let modules = loaded.get(this)
                if(!modules) loaded.set(this, modules = new Map())

                let promise = modules.get(text)
                if(!promise){
                    promise = old_add_module.call(this, url, options)
                    // A failed module can be tried again
                    promise.catch(() => modules!.delete(text))
                    modules.set(text, promise)
                }
                return promise
            }
        }
    }
}
