import { Quaternion, Vector2, Vector3, type AbstractMesh, type Observer, type TransformNode } from "@babylonjs/core";
import type { Node3D, Node3DFactory, Node3DGUI } from "../../Node3D";
import type { Node3DContext } from "../../Node3DContext";
import type { Node3DGUIContext } from "../../Node3DGUIContext";
import { AutomationN3DConnectable, MidiN3DConnectable } from "../../tools";
import { HoldableBehaviour } from "../../../behaviours/boundingBox/HoldableBehaviour";

const MINIMUM_STRENGTH = 0.1
const MAXIMUM_STRENGTH = 1
const NOTE_DURATION = 0.2
const ANIMATION_DURATION = 200
const ANIMATION_MAX_MOVEMENT = 0.05
const OCTAVE = 12
const NOTE_NAME = ["Do/C", "Do#/C#", "Re/D", "Re#/D#", "Mi/E", "Fa/F", "Fa#/F#", "Sol/G", "Sol#/G#", "La/A", "La#/A#", "Si/B"]

/**
 * Une des plaques de la batterie.
 */
class Plate {

    plate!: AbstractMesh

    handle!: AbstractMesh

    root!: TransformNode

    animationRoot!: TransformNode

    tube!: AbstractMesh

    noteSelector!: AbstractMesh

    constructor(private base: TransformNode, context: Node3DGUIContext) {
        const { babylon: B, tools: T, scene } = context

        this.root = new B.TransformNode("drum plate root", scene)

        this.animationRoot = new B.TransformNode("drum plate animation root", scene)
        this.animationRoot.parent = this.root

        this.plate = B.CreateCylinder("drum plate", { diameter: 1, height: 0.05 }, scene)
        this.plate.material = context.materialMetal
        this.plate.parent = this.animationRoot

        this.handle = B.CreateBox("drum plate handle", { size: 0.2 }, scene)
        this.handle.material = context.materialMat
        this.handle.parent = this.root
        this.handle.position.set(0, 0, -0.5)
        T.MeshUtils.setColor(this.handle, new B.Color4(.4, .4, .4, 1))

        this.tube = B.CreateCylinder("drum plate tube", { diameter: 0.05, height: 1 }, scene)
        this.tube.material = context.materialMat
        T.MeshUtils.setColor(this.tube, new B.Color4(.2, .2, .2, 1))
        this.tube.parent = this.root

        this.noteSelector = B.CreateSphere("drum plate note selector", { diameter: 0.2 }, scene)
        this.noteSelector.material = context.materialMat
        T.MeshUtils.setColor(this.noteSelector, new B.Color4(1, 0, 0, 1))
        this.noteSelector.parent = this.root
        this.noteSelector.position.set(-0.4, 0, -0.5)
    }

    private anim: any
    private currentTime = 0

    startAnimation(strength: number = 1, offset: Vector2 = Vector2.Zero()) {
        const that = this
        this.currentTime = Date.now()

        var zrot = offset.x * Math.PI / 4
        var xrot = -offset.y * Math.PI / 4

        if (this.anim === undefined) {
            this.anim = requestAnimationFrame(function frame() {
                const now = Date.now()
                const elapsed = (now - that.currentTime) / ANIMATION_DURATION

                let movement = Math.sin(Math.min(1, elapsed) * Math.PI) * ANIMATION_MAX_MOVEMENT * strength
                that.plate.position.y = movement
                that.plate.rotation.z = zrot * movement / ANIMATION_MAX_MOVEMENT
                that.plate.rotation.x = xrot * movement / ANIMATION_MAX_MOVEMENT

                if (elapsed < 1) that.anim = requestAnimationFrame(frame)
                else that.anim = undefined
            })
        }
    }

    updatePosition() {
        const to = this.animationRoot.absolutePosition
        const from = this.base.absolutePosition
        const distance = Vector3.Distance(from, to)
        const center = Vector3.Center(from, to)
        const direction = to.subtract(from).normalize()
        const rotation = Quaternion.FromUnitVectorsToRef(Vector3.Up(), direction, new Quaternion())
        this.tube.setAbsolutePosition(center)
        this.tube.rotationQuaternion = rotation
        this.tube.scaling.y = distance / this.root.scaling.y * 0.7
    }
}

export class DrumPlateKitN3DGUI implements Node3DGUI {

    context!: Node3DGUIContext

    root!: TransformNode

    base!: AbstractMesh

    plates!: Plate[]

    output!: AbstractMesh

    automationOutput!: AbstractMesh

    worldSize!: number

    constructor(
        private factory: DrumPlateKitN3DFactory
    ) { }

    async init(context: Node3DGUIContext) {
        const { babylon: B, tools: T } = context

        this.context = context

        // Coordinates
        const countx = Math.ceil(Math.sqrt(this.factory.count))
        const county = Math.ceil(this.factory.count / countx)

        const maxaxe = Math.max(county, countx)
        let width = countx / maxaxe
        let height = county / maxaxe
        let plateSize = 1 / maxaxe
        this.worldSize = maxaxe

        // Root
        this.root = new B.TransformNode("hyperkeyboard root", context.scene)

        // Base plate
        this.base = B.CreateBox("hyperkeyboard base", { width: width, height: plateSize * 0.1, depth: height }, this.root.getScene())
        T.MeshUtils.setColor(this.base, new B.Color4(.4, .4, .4, 1))
        this.base.parent = this.root
        this.base.position.set(0, -plateSize * 0.05 - plateSize * 0.1, 0)
        this.base.material = context.materialMat

        // Plates
        this.plates = Array.from({ length: this.factory.count }, (_, i) => {
            const plate = new Plate(this.root, context)
            plate.root.scaling.set(plateSize * 0.8, plateSize * 0.8, plateSize * 0.8)
            const x = i % countx
            const y = Math.floor(i / countx)
            const rowcount = Math.min(countx, this.factory.count - y * countx)
            plate.root.parent = this.root
            plate.root.position.set(
                (-0.5 + (1 - width) / 2 + (countx - rowcount) * plateSize / 2) + (x / countx) * width + plateSize / 2,
                0.5 * y / county + 0.2,
                (-0.5 + (1 - height) / 2) + (y / county) * height + plateSize / 2,
            )
            plate.updatePosition()
            return plate
        })

        // Output
        this.output = T.ConnectableUtils.createOutputMesh(`drumkit output`, plateSize / 2, context.scene)
        this.output.parent = this.root
        this.output.position.set(
            width / 2 + plateSize / 5,
            -plateSize * 0.05 - plateSize * 0.1,
            0
        )
        this.output.material = context.materialMat
        T.MeshUtils.setColor(this.output, T.MidiN3DConnectable.Color.toColor4())

        // Automation Output
        this.automationOutput = T.ConnectableUtils.createOutputMesh(`drumkit automation output`, plateSize / 2, context.scene)
        this.automationOutput.parent = this.root
        this.automationOutput.position.set(
            width / 2 + plateSize / 5,
            -plateSize * 0.05 - plateSize * 0.1,
            plateSize / 2 + 0.1
        )
        this.automationOutput.material = context.materialMat
        //T.MeshUtils.setColor(this.automationOutput, T.MidiN3DConnectable.AutomationColor.toColor4())
    }

    async dispose() { }
}


class PlateBehaviour {

    constructor(
        gui: DrumPlateKitN3DGUI,
        n3d: DrumPlateKitN3D,
        context: Node3DContext,
        i: number,
        public plate: Plate,
        public note: number
    ) {
        const { babylon: B } = gui.context

        context.createParameter({
            id: `plate_${i}_note`,
            meshes: [plate.noteSelector],
            getLabel() { return `Plate n°${i + 1} note` },
            getStepCount() { return 128 },
            getValue() { return note / 127 },
            setValue(value) { note = Math.round(value * 127) },
            stringify(value) {
                const note = Math.round(value * 127)
                return NOTE_NAME[note % OCTAVE] + " " + Math.floor(note / OCTAVE + 1) + " (" + note + ")"
            },
        })

        const action = plate.plate.actionManager = new B.ActionManager(gui.context.scene)
        action.registerAction(new B.ExecuteCodeAction(B.ActionManager.OnPickTrigger, () => {
            plate.startAnimation()
            n3d.play(note)
        }))

        const holdable = new HoldableBehaviour(plate.root)
        holdable.onMoveObservable.add(() => gui.plates[i].updatePosition())
        holdable.attach(plate.handle)
    }

    move(n3d: DrumPlateKitN3D, before: Vector3, after: Vector3) {
        var matrix = this.plate.root.getWorldMatrix().invert()
        const beforeLocal = Vector3.TransformCoordinates(before, matrix)
        const afterLocal = Vector3.TransformCoordinates(after, matrix)

        const offsetToCenter = Vector2.Zero().subtractInPlace(new Vector2(afterLocal.x, afterLocal.z))
        const distanceToCenter = offsetToCenter.length()
        if (distanceToCenter > 0.6) return

        const speed = beforeLocal.y - afterLocal.y
        if (beforeLocal.y > 0 && afterLocal.y < 0 && speed > MINIMUM_STRENGTH) {
            const strength = Math.min(1, (speed - MINIMUM_STRENGTH) / (MAXIMUM_STRENGTH - MINIMUM_STRENGTH))
            const bordering = Math.max(0, Math.min(1, distanceToCenter / 0.6))
            const offset = offsetToCenter.scaleInPlace(1 / 0.6)
            this.plate.startAnimation(strength, offset)
            n3d.play(this.note, strength, bordering)
        }
    }
}

export class DrumPlateKitN3D implements Node3D {

    /**
     * 
     * @param note La note à jouer, entre 0 et 127
     * @param strength La force avec laquelle la plaque a été frappé, entre 0 et 1
     * @param borderness A quel point le point d'impact est proche du bord de la plaque, entre 0 (au centre) et 1 (au bord)
     */
    play(note: number, strength: number = 1, borderness: number = 0) {
        const velocity = Math.round(strength * 127)
        this.output.connections.forEach(conn => {
            const t = conn.context.currentTime
            conn.scheduleEvents({ type: "wam-midi", time: t, data: { bytes: [0x90, note, velocity] } })
            conn.scheduleEvents({ type: "wam-midi", time: t + NOTE_DURATION, data: { bytes: [0x90, note, 0] } })
            conn.scheduleEvents({ type: "wam-midi", time: t + NOTE_DURATION + 0.001, data: { bytes: [0x80, note, 0] } })
        })
        this.automationOutput.value = borderness
    }

    private plates!: PlateBehaviour[]

    private output!: InstanceType<(typeof MidiN3DConnectable)["ListOutput"]>

    private automationOutput!: InstanceType<(typeof AutomationN3DConnectable)["Output"]>

    private observers: Observer<any>[] = []

    constructor(context: Node3DContext, private gui: DrumPlateKitN3DGUI) {
        const { tools: T, audioCtx, inputs } = context
        const { babylon: B } = gui.context

        // Hitbox
        context.addToBoundingBox(gui.base)

        // Hit
        for(const controller of inputs.controllers){
            var wasInside = false
            const position = new Vector3()
            const before = new Vector3()
            this.observers.push(controller.pointer.onMove.add(e => {
                position.copyFrom(e.origin)
                const aabb = gui.root.getHierarchyBoundingVectors()
                const isInside = aabb.min.x <= position.x && position.x <= aabb.max.x &&
                    aabb.min.y <= position.y && position.y <= aabb.max.y &&
                    aabb.min.z <= position.z && position.z <= aabb.max.z

                if (isInside) {
                    for (const plate of this.plates) {
                        plate.move(this, before, position)
                    }
                }

                wasInside = isInside
                before.copyFrom(position)
            }))
        }
        

        // Outputs
        this.output = new T.MidiN3DConnectable.ListOutput(
            "notes",
            [gui.output],
            "Notes"
        )
        context.createConnectable(this.output)

        this.automationOutput = new T.AutomationN3DConnectable.Output(
            "borderness",
            [gui.automationOutput],
            "Borderness",
            1
        )
        context.createConnectable(this.automationOutput)

        // Plates
        this.plates = gui.plates.map((plate, i) => new PlateBehaviour(gui, this, context, i, plate, 36 + i))
    }

    async setState(key: string, value: any) { }

    async getState(key: string) { }

    getStateKeys() { return [] }

    async dispose() {
        this.observers.forEach(obs => obs.remove())
    }

}


export class DrumPlateKitN3DFactory implements Node3DFactory<DrumPlateKitN3DGUI, DrumPlateKitN3D> {

    constructor(
        public count: number,
        public label: string,
        public description: string,
    ) {
        console.assert(count >= 1, "Plate count must at least 1")
    }

    tags = ["drumkit", "midi", "automation", "generator", "live_instrument", "controller"]

    async createGUI(context: Node3DGUIContext) {
        const ret = new DrumPlateKitN3DGUI(this)
        await ret.init(context)
        return ret
    }

    async create(context: Node3DContext, gui: DrumPlateKitN3DGUI) {
        return new DrumPlateKitN3D(context, gui)
    }

    static SMALL = new DrumPlateKitN3DFactory(
        5,
        "Modular Drum Kit",
        "A modular drum kit with 5 plates."
    )

}