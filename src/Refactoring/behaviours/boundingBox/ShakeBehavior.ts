import {AbstractMesh, Behavior, SixDofDragBehavior, Vector3} from "@babylonjs/core"

export class ShakeBehavior implements Behavior<AbstractMesh> {

    on_start: () => void = () => {}
    on_shake: (counter : number) => void = () => {}
    on_stop: (counter : number) => void = () => {}

    name = "shakeBehavior";

    private sixOnDrag : SixDofDragBehavior
    private target : AbstractMesh | null = null

    private shake_factor = 0

    private last_position: Vector3 = Vector3.Zero()
    private last_movement: Vector3 = Vector3.Zero()

    private timeout : any = null
    constructor() {
        this.sixOnDrag = new SixDofDragBehavior()
        this.sixOnDrag.disableMovement = true
    }

    attach(target: AbstractMesh): void {
        this.target = target;

        this.timeout = setInterval(() => {
            if (this.shake_factor > 0) {
                this.shake_factor -= 1
            }
        },250);

        target.addBehavior(this.sixOnDrag);
        this.sixOnDrag.onDragStartObservable.add(() => {
            this.on_start()
        });
        this.sixOnDrag.onDragObservable.add(() => {
            const current_position = this.target!.absolutePosition.clone();
            const current_movement = current_position.subtract(this.last_position).normalize();
            if (current_movement.length() != 0) {
                const dot = Vector3.Dot(current_movement, this.last_movement);
                console.log(`Dot product: ${dot}`);
                if (dot < 0.1) {
                    this.shake_factor += 1;
                }

                this.last_movement = current_movement;
                this.last_position = current_position;
            }
            this.on_shake(this.shake_factor);
        });
        this.sixOnDrag.onDragEndObservable.add(() => {
            this.shake_factor = 0;
            this.on_stop(this.shake_factor);
        })
    }

    detach(): void {
        this.target?.removeBehavior(this.sixOnDrag);
        clearInterval(this.timeout)
    }

    init(): void {
    }

}