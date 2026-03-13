import {AbstractMesh, Behavior, Vector3} from "@babylonjs/core"
import { InputGrabBehavior } from "../xr/inputs/tools/InputGrabBehavior"
import { PointerInput } from "../xr/inputs/PointerInput"

/**
 * A useful behavior used for shake detection.
 */
export class ShakeBehavior implements Behavior<AbstractMesh> {

    /**
     * Called when the mesh starts being shaken.
     */
    on_start: () => void = () => {}

    /**
     *  Called when the mesh is being shaken with a shake power indicator, and a shake duration counter.
     */
    on_shake: (power: number, counter: number) => void = () => {}

    /**
     *  Called when the mesh stops being shaken with a shake power indicator and a shake duration counter.
     */
    on_stop: (power: number, counter: number) => void = () => {}

    /**
     * Called when the mesh is picked up.
     */
    on_pick: () => void = () => {}

    /**
     * Called when the mesh is dropped.
     */
    on_drop: () => void = () => {}

    /**
     * The minium shake power to consider it as a shake.
     */
    shake_threshold = 3

    name = "shakeBehavior";

    private target : AbstractMesh | null = null

    private shake_power = 0
    private shake_counter = 0
    private interval : any = null

    private grab
    
    constructor(){
        this.grab = new InputGrabBehavior(
            this.onGrab.bind(this),
            this.onUp.bind(this),
            this.onMove.bind(this)
        )
    }

    private setShakePower(power: number) {
        if(power<0)power = 0

        const old_power = this.shake_power
        this.shake_power = power
        if(old_power<this.shake_threshold && power>=this.shake_threshold){
            this.on_start()
            this.shake_counter = 0
        }
        else if(old_power>=this.shake_threshold && power<this.shake_threshold){
            this.on_stop(old_power, this.shake_counter)
            this.shake_counter = 0
        }
    }

    attach(target: AbstractMesh): void {
        this.target = target
        target.addBehavior(this.grab)
    }

    onGrab(){
        this.on_pick()
        this.shake_power = 0
        this.interval = setInterval(() => {
            this.setShakePower(Math.floor(this.shake_power * 0.9))
            if(this.shake_power<0.01) this.shake_counter = 0
            else{
                this.shake_counter = this.shake_counter + 1
                console.log("shake power", this.shake_power, "counter", this.shake_counter)
                this.on_shake(this.shake_power, this.shake_counter)
            }
        },400)
    }

    private last_position = Vector3.Zero()
    private position = Vector3.Zero()
    private delta = Vector3.Zero()
    private last_delta = Vector3.Zero()
    private last_distance = 0

    onMove(pointer: PointerInput){
        this.last_position.copyFrom(this.position)
        this.position .copyFrom(pointer.forward) .scaleInPlace(5) .addInPlace(pointer.origin)

        this.last_delta.copyFrom(this.delta)
        this.delta.copyFrom(this.position).subtractInPlace(this.last_position)

        if (this.delta.lengthSquared() > 0.001) {
            const dot = Vector3.Dot(this.delta, this.last_delta);
            if (dot < -.2){
                if(this.last_distance>.1){
                    this.setShakePower(this.shake_power+1)
                }
                this.last_distance = 0
            }
            else this.last_distance += this.delta.length()
        }
        if(this.shake_power>=this.shake_threshold) this.on_shake(this.shake_power, this.shake_counter)
    }

    onUp(){
        this.setShakePower(0)
        this.on_drop()
        clearInterval(this.interval)
    }

    detach(): void {
        this.target?.removeBehavior(this.grab);
    }

    init(): void { }

}