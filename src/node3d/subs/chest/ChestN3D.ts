import { AbstractMesh, AnimationGroup, Color3, TransformNode } from "@babylonjs/core"
import { Node3D, Node3DFactory, Node3DGUI } from "../../Node3D"
import { Node3DContext } from "../../Node3DContext"
import { Node3DGUIContext } from "../../Node3DGUIContext"
import { Node3DGroupSnapshot, Node3DHandle } from "../../Node3DHandle"
import { Node3DN3DConnectable } from "../../tools"

const CHEST_URL = (await import("./chest.glb?url")).default

/** The parts of the model, by the names they carry in it. */
const BOTTOM = "bottom"
const TOP = "top"
const CONTENT = "content"

/**
 * How wide the port stands inside the chest, as a share of the content box.
 * Nothing here is in meters: the chest is resized like any other node, and what is drawn inside
 * it has to follow.
 */
const PORT_SIZE = 0.5

/**
 * How far above the middle of the content box the port floats, in heights of that box.
 * Just enough to clear the hitbox, which is the base of the chest: a port standing inside the
 * chest is a port no hand can reach, the hitbox answers first.
 */
const PORT_HEIGHT = 0.8

/**
 * How much the model is turned so the chest faces the way every other node faces.
 * The front of the chest, the side its handle is on, is the -X of the model, and a node looks
 * along +Z.
 */
const MODEL_TURN = Math.PI / 2

/** The lid, seen as a button once the chest is shut. */
const LID_COLOR = Color3.FromHexString("#d9a441")


/**
 * The chest: a lid on a box, a port floating over it, and the box that port is measured from.
 *
 * @remarks
 * The content box of the model is a plain unit cube, invisible here, whose transform says where
 * the inside of the chest is. What the chest draws hangs under it, so its place and its size are
 * given once, in Blender, and read here in heights of that box and never in meters.
 */
export class ChestN3DGUI implements Node3DGUI {

    root!: TransformNode
    bottom!: AbstractMesh
    top!: AbstractMesh
    content!: AbstractMesh
    port!: AbstractMesh

    /** The opening of the lid, played forward to open and backward to shut. */
    private lid: AnimationGroup|null = null

    get worldSize(){ return 2 }

    async init(context: Node3DGUIContext){
        const {babylon: B, tools: {MeshUtils, ConnectableUtils, Node3DN3DConnectable}} = context

        this.root = new B.TransformNode("chest root", context.scene)

        // The model hangs under a pivot of its own, and not under the root straight away: what
        // the loader puts on its own root is the change of handedness, which is not ours to touch.
        const pivot = new B.TransformNode("chest pivot", context.scene)
        pivot.parent = this.root
        pivot.rotation.y = MODEL_TURN

        const model = await B.ImportMeshAsync(CHEST_URL, context.scene)
        model.meshes[0].parent = pivot

        const find = (name: string) => model.meshes.find(mesh => mesh.name === name)!
        this.bottom = find(BOTTOM)
        this.top = find(TOP)
        this.content = find(CONTENT)

        // The content box is a marker, not a piece of the chest: it says where the inside is and
        // is never seen nor touched.
        this.content.isVisible = false
        this.content.isPickable = false

        this.port = ConnectableUtils.createOutputMesh("chest content", PORT_SIZE, context.scene)
        MeshUtils.setColor(this.port, Node3DN3DConnectable.Color.toColor4(1))
        this.port.parent = this.content
        this.port.position.set(0, PORT_HEIGHT, 0)

        // The loader starts what it finds: the pose is ours to decide, from the first frame on.
        this.lid = model.animationGroups[0] ?? null
        this.lid?.stop()
        this.setOpen(true, false)
    }

    /** Open or shut the lid, at once or through the animation of the model. */
    setOpen(open: boolean, animated: boolean){
        const lid = this.lid
        if(!lid) return
        lid.stop()
        if(animated) lid.start(false, open ? 1 : -1)
        else{
            lid.start(false, 1)
            lid.goToFrame(open ? lid.to : lid.from)
            lid.pause()
        }
    }

    /** Show or hide the port that stands inside the chest. */
    setPortShown(shown: boolean){
        this.port.setEnabled(shown)
    }

    async dispose(){
        this.lid?.dispose()
    }
}


/**
 * Everything the chest holds: the patch as the host photographs one, every node, the cables
 * between them, and the place of each read against the chest.
 *
 * Read against the chest, and that is the whole point: a chest carried elsewhere, turned around or
 * made larger gives its patch back elsewhere, turned around and larger.
 */
type Content = Node3DGroupSnapshot


/**
 * A chest that swallows a patch whole and gives it back where it was.
 *
 * @remarks
 * Empty, the chest stands open and holds out a port of the node3d type over its lid. Cable any node onto it and
 * the chest reads the whole patch that node belongs to, every node reachable through cables from
 * it, photographs the lot, takes it off the world and shuts. Click the lid and it all comes back,
 * with its states, its parameters, its cables and its places.
 *
 * What is held is the state of the chest, so it travels to the other peers and lives through a
 * save: a chest saved shut is loaded shut, and still full.
 */
export class ChestN3D implements Node3D {

    /** What the chest holds, null when it is empty. */
    private content: Content|null = null

    /** Whether the lid stands open. */
    private open = true

    /** Whether the port is out and whether the lid is a button, so neither is made twice. */
    private portOut = false
    private lidIsButton = false

    /** A spill under way, so a second click does not spill the same content twice. */
    private spilling = false

    /** The port held out when the chest is empty, made once and put out and away as need be. */
    private readonly port: Node3DN3DConnectable.Output

    constructor(private context: Node3DContext, private gui: ChestN3DGUI){
        context.addToBoundingBox(gui.bottom)

        this.port = new Node3DN3DConnectable.Output("content", [gui.port], "Content", {
            attach: handle => {
                // The cable is still being laid when this is called: the patch is read once it is.
                setTimeout(() => this.swallow(handle), 0)
            },
            detach: () => { },
        }, 1)

        this.apply()
    }

    /**
     * Put the port out or away and make the lid a button or a plain lid, according to what the
     * chest holds.
     */
    private apply(): void {
        const empty = this.content === null

        if(empty !== this.portOut){
            if(empty) this.context.createConnectable(this.port)
            else this.context.removeConnectable(this.port.id)
            this.gui.setPortShown(empty)
            this.portOut = empty
        }

        const lidIsButton = !empty
        if(lidIsButton !== this.lidIsButton){
            if(!lidIsButton) this.context.removeButton("open")
            else this.context.createButton({
                id: "open",
                meshes: [this.gui.top],
                label: "Open",
                color: LID_COLOR,
                press: () => { void this.spill() },
                release: () => { },
            })
            this.lidIsButton = lidIsButton
        }
    }

    /** Open or shut the lid and tell the other peers. */
    private setOpen(open: boolean): void {
        if(this.open === open) return
        this.open = open
        this.gui.setOpen(open, true)
        this.context.notifyStateChange("open")
    }

    /**
     * Read the whole patch the given node belongs to, photograph it, take it off the world and
     * shut on it.
     */
    private swallow(handle: Node3DHandle): void {
        if(this.content !== null || !handle.isAlive) return

        const gathered = this.gather(handle)
        if(gathered.length === 0){
            this.context.showMessage("Chest: nothing to swallow")
            return
        }

        const snapshot = this.context.saveNodes(gathered, this.context.self.getFrame())

        // Backwards, the node the cable was dropped on last: the handles on the rest of the patch
        // were reached through that one, so they are its children and die with it. Each one is
        // gone before the handle that led to it.
        for(let index = gathered.length - 1; index >= 0; index--) gathered[index].delete()

        this.content = snapshot
        this.context.notifyStateChange("content")
        this.apply()
        this.setOpen(false)
    }

    /**
     * Every node reachable through cables from the given one, the chest excepted.
     *
     * @remarks
     * The walk goes through cables of every type and in both directions, so what is swallowed is
     * the whole patch and not the branch the cable was dropped on. It stops at the chest, which is
     * what keeps the chest from swallowing itself. A node not yet in the shared world has no id
     * and cannot be photographed, so it is left where it is.
     */
    private gather(start: Node3DHandle): Node3DHandle[] {
        const self = this.context.self.id
        const byId = new Map<string, Node3DHandle>()
        const queue = [start]
        while(queue.length){
            const handle = queue.shift()!
            const id = handle.id
            if(!handle.isAlive || id === undefined || id === self || byId.has(id)) continue
            byId.set(id, handle)
            for(const cable of handle.getConnections()) queue.push(cable.from, cable.to)
        }
        return [...byId.values()]
    }

    /** Open the lid and put everything the chest holds back into the world. */
    private async spill(): Promise<void> {
        const content = this.content
        if(content === null || this.spilling) return
        this.spilling = true

        this.content = null
        this.context.notifyStateChange("content")
        this.apply()
        this.setOpen(true)

        // Under the chest as it stands now, and not as it stood when it swallowed.
        await this.context.loadNodes(content, this.context.self.getFrame())

        this.spilling = false
    }

    async setState(key: string, state: any){
        if(key === "content"){
            this.content = (state ?? null) as Content|null
            this.apply()
        }
        else if(key === "open"){
            const open = !!state
            if(open === this.open) return
            this.open = open
            this.gui.setOpen(open, true)
        }
    }

    async getState(key: string): Promise<any> {
        if(key === "content") return this.content
        if(key === "open") return this.open
    }

    getStateKeys(): string[] { return ["content", "open"] }

    async dispose(){ }

}


export const ChestN3DFactory: Node3DFactory<ChestN3DGUI, ChestN3D> = {

    label: "Chest",

    description: "A chest that swallows a whole patch. Cable any node onto the port inside the open chest and everything wired to that node, with its state and its cables, is packed away and the lid shuts. Click the lid and it all comes back where it stood, against the chest: carry the chest elsewhere and the patch follows.",

    tags: ["other", "holder", "chest", "storage", "save", "container"],

    createGUI: async (context) => {
        const gui = new ChestN3DGUI()
        await gui.init(context)
        return gui
    },

    create: async (context, gui) => new ChestN3D(context, gui),

}
