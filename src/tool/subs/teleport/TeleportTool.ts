

import { AbstractMesh, Color3, CreateCylinder, CreateTorus, CreateTube, FreeCamera, Mesh, Observer, Quaternion, Ray, Scene, StandardMaterial, Vector3, WebXRCamera } from "@babylonjs/core"
import { Tool } from "../../Tool"
import { ToolKind } from "../../ToolKind"
import { ToolContext } from "../../ToolContext"
import { GROUND_HEIGHT } from "../../../app/SceneManager"
import { CAMERA_HEIGHT } from "../../../app/platform/PCPlatform"
import { NetworkManager } from "../../../network/NetworkManager"
import { Node3DInstance } from "../../../node3d/instance/Node3DInstance"
import THUMBNAIL_URL from "./thumbnail.png?url"

/**
 * Print what the tool reads, on every press of the trigger, and print whatever the reading of the arc
 * throws, once per kind. Left in while the ring is still sometimes seen pinned somewhere it was never
 * sent, since no reasoning has caught that one yet.
 */
const DEBUG = true

/** The name of the mesh the arc lands on: the collision floor made by `SceneManager.createGround`. */
const GROUND_NAME = "ground"

/**
 * How fast the arc leaves the hand, in meters per second, and how fast it falls, in meters per
 * second squared.
 *
 * @remarks
 * The two together are the whole reach of the tool: held level from eye height the arc carries about
 * ten meters, and raised it carries the width of the room. The fall is much gentler than the world,
 * since an arc falling at the weight of the world drops at the feet of the player and only the
 * highest of aims reaches anything, which turns aiming into a chore.
 */
const SPEED = 12
const GRAVITY = -4.5

/** How long the arc is followed, in seconds. Long enough that the highest throw lands rather than fades. */
const MAX_TIME = 4

/** The number of points the arc is drawn along. Constant, so the tube is rebuilt in place. */
const ARC_POINTS = 48

/** The thickness of the arc, in meters. */
const ARC_DIAMETER = 0.02

/** The ring laid on the landing spot, in meters: about the room a standing player takes. */
const RING_DIAMETER = 0.7
const RING_THICKNESS = 0.05

/** How far above the floor the ring floats, in meters, so it does not fight the visible ground. */
const RING_LIFT = 0.03

/** The arrow saying which way the player will face, in meters. */
const ARROW_LENGTH = 0.28
const ARROW_DIAMETER = 0.16

/**
 * How far in front of the face of a module its anchor stands, in meters.
 * Read from the face and not from the middle, so a big module is not looked at from inside.
 */
const ANCHOR_GAP = 0.9

/** How close the arc has to land for an anchor to take it, in meters. */
const SNAP_RANGE = 1.2

/**
 * How far from the arc an anchor is still shown, in meters, greyed out and taking nothing.
 *
 * @remarks
 * An anchor that only appears once it has already taken the arc cannot be aimed at: the player has
 * to find it by sweeping the floor. Shown greyed far further than it reaches, across most of a room,
 * it says where to aim before it takes anything, and the arc changing color says when it has.
 */
const GHOST_RANGE = 12

/** How big a greyed anchor is next to the ring of a real landing, as a share of it. */
const GHOST_SCALE = 0.55

/** The colors of an arc that lands, of one that reaches nothing, and of one taken by an anchor. */
const TARGET_COLOR = new Color3(0.3, 1, 0.5)
const MISS_COLOR = new Color3(1, 0.35, 0.3)
const ANCHOR_COLOR = new Color3(0.45, 0.75, 1)

/** The color of an anchor merely shown, and how far through it is seen, so it never reads as a target. */
const GHOST_COLOR = new Color3(0.85, 0.87, 0.9)
const GHOST_ALPHA = 0.6

/** A spot the player can be taken to, and the way they face once there. */
interface Landing {

    /** Where the player lands, on the floor. */
    readonly position: Vector3

    /** The way the player faces once landed, as a yaw in radians, none to keep the way they face. */
    readonly facing: number | null

}

/**
 * The hand that carries the player: it lobs an arc onto the floor, rings the spot it falls on, and
 * the trigger takes the player there.
 *
 * @remarks
 * The arc is shown at all times rather than only while the trigger is held, so the hand holding it
 * always says where it would go, and the trigger does one thing and nothing else.
 *
 * Only the floor is aimed at. A tool that also landed on the top of the modules would let the player
 * climb on what they are building, which is another gesture than moving about the world.
 *
 * Every module offers anchors, one in front of each of its four sides, and an arc landing near one
 * is taken by it. An anchor carries the way the player will face, so arriving in front of a module
 * arrives looking at it: aiming at the floor of a room is a rough gesture, and the thing worth
 * reaching is never the floor itself but what stands on it.
 */
export class TeleportTool implements Tool {

    constructor(context: ToolContext){
        this.#context = context
        this.#scene = context.scene

        this.#targetMaterial = TeleportTool.#materialOf(context.scene, "teleport target", TARGET_COLOR)
        this.#missMaterial = TeleportTool.#materialOf(context.scene, "teleport miss", MISS_COLOR)
        this.#anchorMaterial = TeleportTool.#materialOf(context.scene, "teleport anchor", ANCHOR_COLOR)
        this.#ghostMaterial = TeleportTool.#materialOf(context.scene, "teleport ghost", GHOST_COLOR)
        this.#ghostMaterial.emissiveColor = GHOST_COLOR
        this.#ghostMaterial.alpha = GHOST_ALPHA
        this.#ghostMaterial.backFaceCulling = false

        this.#path = Array.from({ length: ARC_POINTS }, () => new Vector3())
        this.#arc = CreateTube("teleport arc", { path: this.#path, radius: ARC_DIAMETER / 2, tessellation: 6, updatable: true }, context.scene)
        this.#arc.isPickable = false

        this.#ring = CreateTorus("teleport ring", { diameter: RING_DIAMETER, thickness: RING_THICKNESS, tessellation: 24 }, context.scene)
        this.#ring.isPickable = false
        this.#ring.material = this.#targetMaterial
        this.#ring.setEnabled(false)

        this.#arrow = CreateCylinder("teleport arrow", { height: ARROW_LENGTH, diameterTop: 0, diameterBottom: ARROW_DIAMETER, tessellation: 8 }, context.scene)
        this.#arrow.isPickable = false
        this.#arrow.material = this.#anchorMaterial
        this.#arrow.rotationQuaternion = new Quaternion()
        this.#arrow.setEnabled(false)

        this.#observer = context.scene.onBeforeRenderObservable.add(() => this.#tick())
        this.#trigger = context.controller.trigger.onDown.add(() => this.#leap())
    }

    public dispose(): void {
        this.#scene.onBeforeRenderObservable.remove(this.#observer)
        this.#context.controller.trigger.onDown.remove(this.#trigger)
        this.#arc.dispose()
        this.#ring.dispose()
        this.#arrow.dispose()
        for(const ghost of this.#ghosts) ghost.dispose()
        this.#targetMaterial.dispose()
        this.#missMaterial.dispose()
        this.#anchorMaterial.dispose()
        this.#ghostMaterial.dispose()
    }


    readonly #context: ToolContext

    readonly #scene: Scene

    readonly #targetMaterial: StandardMaterial

    readonly #missMaterial: StandardMaterial

    readonly #anchorMaterial: StandardMaterial

    readonly #ghostMaterial: StandardMaterial

    /** The points the arc is drawn along, always as many, so the tube is rebuilt in place. */
    readonly #path: Vector3[]

    #arc: Mesh

    readonly #ring: Mesh

    /** The arrow on the ring, shown only when an anchor says which way the player will face. */
    readonly #arrow: Mesh

    /** The rings laid on the anchors in sight of the arc, one per anchor shown at once. */
    readonly #ghosts: Mesh[] = []

    readonly #observer: Observer<Scene>

    readonly #trigger: Observer<any>

    /** Where the trigger would take the player, none when the arc reaches no floor. */
    #landing: Landing | null = null

    /**
     * One frame of the tool, and the one place a throw is caught.
     *
     * @remarks
     * A throw out of `#update` leaves the ring and the greyed anchors exactly where they last stood,
     * which reads as the tool having pinned them somewhere, so it is named rather than left to the
     * observable. Named once per message: it would otherwise be printed every frame.
     */
    #tick(): void {
        if(!DEBUG){
            this.#update()
            return
        }

        try {
            this.#update()
        }
        catch(error){
            const said = `${error}`
            if(TeleportTool.#said.has(said)) return
            TeleportTool.#said.add(said)
            console.error("[teleport] the arc could not be read, everything it shows is now frozen", error)
        }
    }

    /** What has already been complained about, so a throw every frame is printed once. */
    static readonly #said = new Set<string>()

    /**
     * Follow the arc from the hand until it meets the floor, let an anchor take it if one is near,
     * and show where it lands.
     *
     * The arc is walked one segment at a time rather than tested as a whole, since a curve cannot be
     * picked with: each segment is a straight ray, and the first one to meet the floor ends the arc.
     * Past the landing the arc stands still: the path keeps its length, so the tube is rebuilt in
     * place, and the points piled on the landing draw nothing further. It is also what makes the arc
     * snap onto an anchor rather than merely point near it.
     */
    #update(): void {
        const pointer = this.#context.controller.pointer
        const origin = pointer.origin
        const velocity = pointer.forward.scale(SPEED)

        const previous = origin.clone()
        const point = new Vector3()
        let fallen = -1
        let shown: Landing[] = []

        this.#landing = null
        this.#path[0].copyFrom(origin)

        for(let index = 1; index < ARC_POINTS; index++){
            const time = index / (ARC_POINTS - 1) * MAX_TIME
            point.set(
                origin.x + velocity.x * time,
                origin.y + velocity.y * time + 0.5 * GRAVITY * time * time,
                origin.z + velocity.z * time,
            )
            this.#path[index].copyFrom(point)

            const met = TeleportTool.#groundBetween(this.#scene, previous, point)
            if(met !== null){
                const anchors = TeleportTool.#anchorsAt(met)
                this.#landing = anchors.taken ?? { position: met, facing: null }
                shown = anchors.shown
                fallen = index
                break
            }
            previous.copyFrom(point)
        }

        const landing = this.#landing
        if(landing !== null) for(let index = fallen; index < ARC_POINTS; index++) this.#path[index].copyFrom(landing.position)

        this.#arc = CreateTube("teleport arc", { path: this.#path, radius: ARC_DIAMETER / 2, tessellation: 6, instance: this.#arc }, this.#scene)
        this.#arc.material = landing === null ? this.#missMaterial
            : landing.facing === null ? this.#targetMaterial
            : this.#anchorMaterial

        this.#show(landing)
        this.#showGhosts(shown)
    }

    /**
     * Grey a ring onto every anchor the arc comes near without reaching, so the player sees what they
     * could aim at. The rings are kept from one frame to the next and merely hidden when fewer are
     * wanted, since the count changes with every sweep of the hand.
     */
    #showGhosts(anchors: Landing[]): void {
        while(this.#ghosts.length < anchors.length){
            const ghost = CreateTorus(`teleport ghost ${this.#ghosts.length}`, { diameter: RING_DIAMETER * GHOST_SCALE, thickness: RING_THICKNESS * GHOST_SCALE, tessellation: 16 }, this.#scene)
            ghost.isPickable = false
            ghost.material = this.#ghostMaterial
            this.#ghosts.push(ghost)
        }

        for(let index = 0; index < this.#ghosts.length; index++){
            const ghost = this.#ghosts[index]
            const anchor = anchors[index]
            ghost.setEnabled(anchor !== undefined)
            if(anchor === undefined) continue
            ghost.position.copyFrom(anchor.position)
            ghost.position.y = GROUND_HEIGHT + RING_LIFT
        }
    }

    /** Lay the ring on the landing, and the arrow on the ring when the landing says which way to face. */
    #show(landing: Landing | null): void {
        this.#ring.setEnabled(landing !== null)
        this.#arrow.setEnabled(landing !== null && landing.facing !== null)
        if(landing === null) return

        this.#ring.position.copyFrom(landing.position)
        this.#ring.position.y = GROUND_HEIGHT + RING_LIFT
        this.#ring.material = landing.facing === null ? this.#targetMaterial : this.#anchorMaterial

        if(landing.facing === null) return

        const way = new Vector3(Math.sin(landing.facing), 0, Math.cos(landing.facing))
        this.#arrow.position.copyFrom(this.#ring.position).addInPlace(way.scale(RING_DIAMETER / 2))
        Quaternion.FromUnitVectorsToRef(Vector3.UpReadOnly, way, this.#arrow.rotationQuaternion!)
    }

    /**
     * Take the player where the arc lands, or say with the hand that it lands nowhere.
     *
     * The player is moved sideways only: the floor of the world is one level everywhere, so nobody
     * ever rises by teleporting. The desktop camera is then set back to eye height, since nothing
     * holds it up: it flies where the headset rig falls, and a teleport is a good moment to put the
     * eyes back where they belong.
     *
     * Turning is done by adding the turn to what the camera already reads rather than by writing an
     * angle, and the same turn is added whatever the camera is: in a session the angle is the pose of
     * the head, which the device rewrites every frame, and only the turn between the two survives.
     * A desktop that turned some other way would be a second tool with a second feel.
     */
    #leap(): void {
        const landing = this.#landing
        if(DEBUG) this.#report(landing)
        if(landing === null){
            this.#context.controller.pulse(0.3, 40)
            return
        }

        const camera = this.#scene.activeCamera as FreeCamera | null
        if(camera === null) return

        const head = camera.globalPosition

        // The momentum is dropped first, or whatever the player was doing keeps carrying them once
        // they have landed.
        camera.cameraDirection.setAll(0)
        camera.cameraRotation.setAll(0)

        camera.position.x += landing.position.x - head.x
        camera.position.z += landing.position.z - head.z
        if(!(camera instanceof WebXRCamera)) camera.position.y = CAMERA_HEIGHT

        if(landing.facing !== null){
            const quaternion = camera.rotationQuaternion
            const turn = landing.facing - (quaternion ?? Quaternion.FromEulerVector(camera.rotation)).toEulerAngles().y
            if(quaternion !== null && quaternion !== undefined){
                Quaternion.FromEulerAngles(0, turn, 0).multiplyToRef(quaternion, quaternion)
            }
            else camera.rotation.y += turn
        }

        this.#context.controller.pulse(0.6, 60)
    }


    /** Say what the tool is reading: where the hand is, what it landed on, and what every module offers. */
    #report(landing: Landing | null): void {
        const pointer = this.#context.controller.pointer
        const round = (vector: Vector3) => `${vector.x.toFixed(2)} ${vector.y.toFixed(2)} ${vector.z.toFixed(2)}`

        console.log("[teleport] hand", round(pointer.origin), "aiming", round(pointer.forward))
        console.log("[teleport] landing", landing === null ? "none" : `${round(landing.position)} facing ${landing.facing?.toFixed(2) ?? "as it stands"}`)
        console.log("[teleport] arc ends at", round(this.#path[ARC_POINTS - 1]))

        for(const [id, node] of NetworkManager.getInstance().node3d.nodes.entries()){
            if(node.isDisposed || !node.hasBoundingBox){
                console.log("[teleport] module", id, node.isDisposed ? "disposed" : "no box yet")
                continue
            }
            const box = node.boundingBoxMesh
            const anchor = TeleportTool.#anchorOf(node)
            console.log("[teleport] module", id, "box", round(box.absolutePosition), "scaling", round(box.scaling),
                "anchor", anchor === null ? "none" : round(anchor.position))
        }

        for(const ghost of this.#ghosts) console.log("[teleport] greyed", ghost.isEnabled() ? round(ghost.position) : "hidden")

        // Whoever is drawn with a material the scene has thrown away, named. A disposed material
        // leaves `scene.materials`, and a mesh still pointing at one is drawn from a deleted program,
        // which WebGL complains about every frame while showing nothing.
        for(const mesh of this.#scene.meshes){
            const material = mesh.material
            if(material === null || this.#scene.materials.includes(material)) continue
            console.warn("[teleport] drawn from a thrown away material:", mesh.name, "wears", material.name)
        }
    }


    //// THE ANCHORS ////
    /**
     * What the anchors make of a point on the floor: the one taking it, none when they all fall
     * clear, and the ones near enough to be worth showing greyed.
     *
     * @remarks
     * Both answers come out of one walk, so what is shown and what is taken can never disagree. The
     * nearest one takes it, so two modules standing side by side never fight over an arc, and the one
     * that loses is shown like any other.
     *
     * A module is skipped while it has no bounding box, and once it is disposed: a node is built
     * before its box is and outlives it once thrown away, and asking one that young or that old for a
     * box throws. Thrown here, that ends the whole reading of the arc, and everything the tool shows
     * stays frozen wherever it stood, for good.
     */
    static #anchorsAt(point: Vector3): { taken: Landing | null, shown: Landing[] } {
        let taken: Landing | null = null
        let reach = SNAP_RANGE
        const shown: Landing[] = []

        for(const [, node] of NetworkManager.getInstance().node3d.nodes.entries()){
            if(node.isDisposed || !node.hasBoundingBox) continue

            const anchor = TeleportTool.#anchorOf(node)
            if(anchor === null) continue

            const distance = Vector3.Distance(anchor.position, point)
            if(distance < reach){
                if(taken !== null) shown.push(taken)
                taken = anchor
                reach = distance
            }
            else if(distance < GHOST_RANGE) shown.push(anchor)
        }
        return { taken, shown }
    }

    /**
     * The anchor of a module: the one spot in front of it, looking at it.
     *
     * @remarks
     * In front and nowhere else. A module is worked on from its face, where its knobs and its buttons
     * are, so the sides and the back are places nobody asks to be taken to, and an anchor offered
     * there only takes arcs that were meant for the floor.
     *
     * The front is the front of the module itself and not a way of the world, so a module turned
     * askew is still looked at square on.
     */
    static #anchorOf(node: Node3DInstance): Landing | null {
        const box = node.boundingBoxMesh
        const extend = box.getBoundingInfo().boundingBox.extendSize

        const front = TeleportTool.#axisOf(box, 2)
        if(front.lengthSquared() < Number.EPSILON) return null
        front.normalize()

        const position = box.absolutePosition.add(front.scale(extend.z * box.scaling.z + ANCHOR_GAP))
        position.y = GROUND_HEIGHT
        return { position, facing: Math.atan2(-front.x, -front.z) }
    }

    /**
     * One axis of a module, laid flat: the player stands on the floor, however the module leans.
     * The face of a module looks the way its z axis comes from, hence the turn round.
     */
    static #axisOf(box: AbstractMesh, row: number): Vector3 {
        const axis = box.getWorldMatrix().getRow(row)!
        return new Vector3(-axis.x, 0, -axis.z)
    }


    //// READING THE WORLD ////
    /** Where the floor cuts one segment of the arc, none when that segment stays clear of it. */
    static #groundBetween(scene: Scene, from: Vector3, to: Vector3): Vector3 | null {
        const direction = to.subtract(from)
        const length = direction.length()
        if(length === 0) return null

        const ray = new Ray(from, direction.scaleInPlace(1 / length), length)
        const pick = scene.pickWithRay(ray, mesh => TeleportTool.#isGround(mesh))
        return pick?.hit === true ? pick.pickedPoint : null
    }

    /**
     * Is the mesh the floor of the world?
     * It is asked for by name because the collision floor is invisible, the visible ground being a
     * decoration laid just under it, so nothing else tells apart the one the player walks on.
     */
    static #isGround(mesh: AbstractMesh): boolean {
        return mesh.name === GROUND_NAME && mesh.isEnabled()
    }

    static #materialOf(scene: Scene, name: string, color: Color3): StandardMaterial {
        const material = new StandardMaterial(name, scene)
        material.diffuseColor = color
        material.emissiveColor = color.scale(0.5)
        material.disableLighting = true
        return material
    }

}

/** The kind of the hand that carries the player. */
export const TELEPORT_TOOL_KIND: ToolKind = {
    label: "Teleport",
    description: "Lobs an arc onto the floor and rings where it falls. The trigger takes the player to that ring, and an arc landing near a module is taken by it, facing it.",
    thumbnail: THUMBNAIL_URL,
    tags: ["tool", "distance"],
    create: context => new TeleportTool(context),
}
