import {AbstractMesh, Behavior, PointerDragBehavior, SixDofDragBehavior, Vector3} from "@babylonjs/core"

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

    private dragger : PointerDragBehavior
    private target : AbstractMesh | null = null

    private shake_power = 0
    private shake_counter = 0

    private last_delta: Vector3 = Vector3.Zero()
    private last_distance = 0

    private interval : any = null

    constructor() {
        this.dragger = new PointerDragBehavior()
        this.dragger.moveAttached = false
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
        this.target = target;

        target.addBehavior(this.dragger);
    
        // When the mesh is picked up, we start detecting shakes.
        this.dragger.onDragStartObservable.add(() => {
            this.on_pick()
            this.shake_power = 0
            this.interval = setInterval(() => {
                this.setShakePower(Math.floor(this.shake_power * 0.9))
                this.shake_counter = this.shake_counter + 1
            },200)
        })

        // When the mesh is being dragged, we calculate the shake power based on the movement.
        this.dragger.onDragObservable.add(({delta}) => {
            const current_delta = delta.normalizeToNew()

            if (current_delta.length() != 0) {
                const dot = Vector3.Dot(current_delta, this.last_delta);


                // Shake movement detected
                if (dot < -.2){
                    if(this.last_distance>.5)this.setShakePower(this.shake_power+1)
                    this.last_distance = 0
                }
                else this.last_distance += delta.length()

                this.last_delta = current_delta
            }
            if(this.shake_power>=this.shake_threshold) this.on_shake(this.shake_power, this.shake_counter)
        })

        // When the mesh is released, we stop detecting shakes and reset the shake power.
        this.dragger.onDragEndObservable.add(() => {
            this.setShakePower(0)
            this.on_drop()
            clearInterval(this.interval)
        })
    }

    detach(): void {
        this.target?.removeBehavior(this.dragger);
    }

    init(): void { }

}