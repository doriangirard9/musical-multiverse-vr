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
     * The minium shake power to consider it as a shake.
     */
    shake_threshold = 3

    name = "shakeBehavior";

    private sixOnDrag : PointerDragBehavior
    private target : AbstractMesh | null = null

    private shake_power = 0
    private shake_counter = 0

    private last_position: Vector3 = Vector3.Zero()
    private last_movement: Vector3 = Vector3.Zero()

    private interval : any = null

    constructor() {
        this.sixOnDrag = new PointerDragBehavior()
        this.sixOnDrag.moveAttached = false
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

        target.addBehavior(this.sixOnDrag);
    
        // When the mesh is picked up, we start detecting shakes.
        this.sixOnDrag.onDragStartObservable.add(() => {
            this.shake_power = 0
            this.interval = setInterval(() => {
                this.setShakePower(Math.floor(this.shake_power * 0.9))
                this.shake_counter = this.shake_counter + 1
            },200)
        })

        // When the mesh is being dragged, we calculate the shake power based on the movement.
        this.sixOnDrag.onDragObservable.add(() => {
            const current_position = this.target!.absolutePosition.clone();
            const current_movement = current_position.subtract(this.last_position).normalize();
            if (current_movement.length() != 0) {
                const dot = Vector3.Dot(current_movement, this.last_movement);

                // Shake movement detected
                if (dot < -.2) this.setShakePower(this.shake_power+1)

                this.last_movement = current_movement
                this.last_position = current_position
            }
            if(this.shake_power>=this.shake_threshold) this.on_shake(this.shake_power, this.shake_counter)
        })

        // When the mesh is released, we stop detecting shakes and reset the shake power.
        this.sixOnDrag.onDragEndObservable.add(() => {
            this.setShakePower(0)
            clearInterval(this.interval)
        })
    }

    detach(): void {
        this.target?.removeBehavior(this.sixOnDrag);
    }

    init(): void { }

}