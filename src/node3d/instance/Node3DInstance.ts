import {
    TransformNode,
    AbstractMesh,
    Mesh,
    MeshBuilder,
    Vector3,
    Quaternion, Color3,
    Vector2,
    Observer
} from "@babylonjs/core";
import { Node3DConnectable } from "../Node3DConnectable";
import { Node3DParameter } from "../Node3DParameter";
import { Node3D, Node3DFactory, Node3DGUI } from "../Node3D";
import { BoundingBox } from "../../behaviours/boundingBox/BoundingBox";
import { N3DParameterInstance } from "./N3DParameterInstance";
import { N3DConnectableInstance } from "./N3DConnectableInstance";
import { IOEventBus } from "../../eventBus/IOEventBus";
import { XRManager } from "../../xr/XRManager";
import { SyncManager } from "../../network/sync/SyncManager";
import { Node3dManager } from "../../app/Node3dManager";
import { Doc } from "yjs";
import { Synchronized } from "../../network/sync/Synchronized";
import { N3DHighlighter } from "./utils/N3DHighlighter";
import { N3DShared } from "./N3DShared";
import { AutomationN3DConnectable, MeshUtils } from "../tools";
import { NetworkManager } from "../../network/NetworkManager.ts";
import { N3DButtonInstance } from "./N3DButtonInstance.ts";
import { SceneManager } from "../../app/SceneManager.ts";
import { InputManager } from "../../xr/inputs/InputManager.ts";
import { BoxWave } from "../../world/BoxWave.ts";
import { MenuSystem } from "../../app/MenuSystem.ts";
import { AbstractMenu } from "../../menus/AbstractMenu.ts";
import { ChoiceMenu } from "../../menus/ChoiceMenu.ts";
import * as GUI from "@babylonjs/gui";
import { InputGrabBehavior } from "../../xr/inputs/tools/InputGrabBehavior.ts";
import { InputHoverBehavior } from "../../xr/inputs/tools/InputHoverBehavior.ts";
import type { N3DConnectionInstance } from "./N3DConnectionInstance.ts";

export class Node3DInstance implements Synchronized {

    static readonly SIZE_MULTIPLIER = .2
    static readonly CONNECTION_SIZE_MULTIPLIER = .1

    constructor(
        private shared: N3DShared,
        private node_factory: Node3DFactory<Node3DGUI, Node3D>,
    ) { }

    private declare gui: Node3DGUI
    private declare node: Node3D
    readonly parameters = new Map<string, N3DParameterInstance>()
    readonly buttons = new Map<string, N3DButtonInstance>()
    readonly connectables = new Map<string, N3DConnectableInstance>()
    private declare root_transform: TransformNode
    private highlighter!: N3DHighlighter
    private observers = new Set<Observer<any>>()
    public on_dispose = () => { }

    async instantiate() {
        const { scene, highlightLayer, utilityLayer, babylon, tools } = this.shared

        const instance = this

        const highlighter = this.highlighter = new N3DHighlighter(highlightLayer)
        const menus = MenuSystem.getInstance()
        let lastMenu: AbstractMenu|null = null

        // GUI related things
        const root_transform = this.root_transform = new TransformNode("node3d root", scene)

        const gui_root_transform = new TransformNode("node3d gui root", scene)

        this.gui = await this.node_factory.createGUI({
            babylon, tools, scene,

            materialLight: this.shared.materialLight,
            materialTransparent: this.shared.materialTransparent,
            materialMat: this.shared.materialMat,
            materialMetal: this.shared.materialMetal,
            materialShiny: this.shared.materialShiny,

            highlight: (...p) => highlighter.highlight(...p),
            unhighlight: (...p) => highlighter.unhighlight(...p)
        })

        gui_root_transform.parent = root_transform
        this.gui.root.parent = gui_root_transform
        gui_root_transform.scaling.setAll(this.gui.worldSize * Node3DInstance.SIZE_MULTIPLIER)


        // Node related things
        this.node = await this.node_factory.create({
            audioCtx: this.shared.audioContext,
            audioEngine: this.shared.audioEngine,
            groupId: this.shared.groupId,
            tools,
            inputs: InputManager.getInstance(),

            // Le nom du wam
            setLabel(label: string) {
                root_transform.name = `${label} root`
            },

            // Les paramètres draggables
            createParameter(info: Node3DParameter) {
                const param = new N3DParameterInstance(instance, instance.root_transform, highlightLayer, utilityLayer, info)
                instance.parameters.set(info.id, param)
                let last_value = 0
                const connectableinfo = new AutomationN3DConnectable.Input(
                    `${info.id}_connectable`,
                    info.meshes,
                    "",
                    {
                        getName() { return info.getLabel() },
                        getStepCount() { return info.getStepCount() },
                        stringify(value) { return info.stringify(value) },
                        setValue(value) { 
                            param.setValueAutomated(value)
                            last_value = value
                         },
                        lock(isLocked) {
                            if(!isLocked) param.setValue(last_value)
                            param.isLocked = isLocked
                        },
                    },
                )
                const connectable = new N3DConnectableInstance(instance, connectableinfo, highlightLayer, utilityLayer, IOEventBus.getInstance(), true, false)
                instance.connectables.set(connectableinfo.id, connectable)
            },
            removeParameter(id: Node3DParameter["id"]) {
                instance.parameters.get(id)?.dispose()
                instance.parameters.delete(id)
                instance.connectables.get(`${id}_connectable`)?.dispose()
            },

            // Les outputs et inputs que l'on peut connecter
            createConnectable(info: Node3DConnectable) {
                const connectable = new N3DConnectableInstance(instance, info, highlightLayer, utilityLayer, IOEventBus.getInstance())
                instance.connectables.set(info.id, connectable)
            },
            removeConnectable(id: Node3DConnectable["id"]) {
                instance.connectables.get(id)?.dispose()
                instance.connectables.delete(id)
            },

            createButton(info) {
                const button = new N3DButtonInstance(instance.root_transform, highlightLayer, utilityLayer, info)
                instance.buttons.set(info.id, button)
            },
            removeButton(id) {
                instance.buttons.get(id)?.dispose()
                instance.buttons.delete(id)
            },

            // Les mesh qui font partis de la bounding box
            // En attendant la bounding box est une boite qui les englobes
            addToBoundingBox(mesh: AbstractMesh) {
                instance.boxes.push(mesh)

                instance.updateBoundingBox()
            },
            removeFromBoundingBox(mesh: AbstractMesh) {
                const idx = instance.boxes.indexOf(mesh)
                if (idx >= 0) instance.boxes.splice(idx, 1)
                instance.updateBoundingBox()
            },

            // Afficher un menu ou un message
            openMenu(choices: { label: string; color?: string, click?: () => void; }[]) {
                if(lastMenu && lastMenu instanceof ChoiceMenu && lastMenu===menus.current_menu){
                    lastMenu.set(choices)
                }
                else{
                    const new_menu = new ChoiceMenu(scene, utilityLayer.utilityLayerScene, choices)
                    lastMenu = new_menu
                    lastMenu.onHide.addOnce(() => lastMenu = null)
                    menus.open(new_menu, true)
                }
            },
            closeMenu() {
                if(menus.current_menu==lastMenu) menus.close()
            },
            showMessage(message: string) {
                menus.showMessage(message)
            },
            sendSignal(position, red, green, blue) {
                SceneManager.getInstance().getWaveGround().putWorldSpace(position, red, green, blue)
                SceneManager.getInstance().getSoundwaveEmitter().spawn(new Vector2(position.x, position.z), new Color3(red, green, blue))
                new BoxWave(
                    instance.boundingBoxMesh,
                    new Color3(red, green, blue).toColor4(1),
                    1
                )
            },

            getPlayerPosition() {
                const xrManager = XRManager.getInstance();
                if (xrManager.xrHelper && xrManager.xrHelper.baseExperience) {
                    const vrCamera = xrManager.xrHelper.baseExperience.camera;
                    return { position: vrCamera.globalPosition.clone(), rotation: vrCamera.absoluteRotation.clone() }
                }
                else return { position: Vector3.Zero(), rotation: Quaternion.Identity() }
            },

            getPosition() {
                return { position: instance.root_transform.absolutePosition.clone(), rotation: instance.root_transform.absoluteRotationQuaternion.clone() }
            },

            delete() {
                instance.dispose()
            },

            notifyStateChange(key: string) {
                instance.set_state(key)
            },

            observe(observable, observer) {
                const o = observable.add(observer)
                instance.observers.add(o)
                return o 
            },

        }, this.gui)
    }

    //// BOUNDING BOX ////
    private boxes = [] as AbstractMesh[]
    private bounding_mesh = null as null | Mesh
    private bounding_box = null as null | BoundingBox
    private doUpdateBoundingBox = false
    private delete_button = null as null | { dispose(): void }
    private _deleteMenu = null as null | ChoiceMenu

    get boundingBoxMesh() { return this.bounding_box!!.boundingBox }

    private updateBoundingBoxNow() {
        if (this.disposed) return

        // Dispose the corner delete button BEFORE its parent bounding_mesh, so we
        // free its texture cleanly (mesh.dispose() recurse wouldn't free the ADT).
        this.delete_button?.dispose()
        this.delete_button = null

        if (this.bounding_mesh) this.shared.shadowGenerator.removeShadowCaster(this.bounding_mesh)
        this.bounding_box?.dispose()
        this.bounding_mesh?.dispose()


        // Update bounds shape
        const bounds = this.boxes
            .map(it => it.getHierarchyBoundingVectors(true))
            .reduce((a, b) => ({ min: a.min.minimizeInPlace(b.min), max: a.max.maximizeInPlace(b.max) }))

        const size = bounds.max.subtractInPlace(bounds.min)
        this.bounding_mesh = MeshBuilder.CreateBox('box', {
            width: size.x,
            height: size.y,
            depth: size.z,
        }, this.shared.scene)
        size.scaleInPlace(.5)
        this.bounding_mesh.position.subtractInPlace(bounds.min).subtractInPlace(size)
        //this.bounding_mesh.isVisible = false
        this.bounding_mesh.visibility = 0
        this.bounding_mesh.receiveShadows
        this.bounding_mesh.checkCollisions = false
        this.bounding_mesh.isPickable = false

        this.root_transform.parent = this.bounding_mesh

        this.bounding_box = new BoundingBox(this.bounding_mesh)


        // Shake-to-delete — detection based on the REAL movement of the held box
        // (HoldableBehaviour observables), not the pointer ray: ShakeBehavior
        // listened to pointer.onMove, a path that doesn't fire in VR while
        // FullHoldBehaviour holds the box. If dragging works, this works.
        //
        // DELIBERATELY HARD TO TRIGGER (made stricter on request) so an item is
        // never deleted by accident while repositioning it:
        //   • a swing only counts if it exceeds SWING_MIN (big gestures only),
        //   • REVERSALS_TO_DELETE direction reversals are required,
        //   • any pause > RESET_MS between two reversals resets the counter →
        //     a slow / hesitant move never accumulates anything.
        // Progressive feedback: colour white→red + a percentage message.
        const SWING_MIN = 0.13            // m : minimum amplitude of a real swing (was 0.07)
        const REVERSALS_TO_DELETE = 18    // ≈ 9 sustained back-and-forths (was 10)
        const RESET_MS = 550              // max pause between two reversals (was 700)

        const box = this.bounding_box.boundingBox
        const holdable = this.bounding_box.holdable
        const lastPos = new Vector3()
        const delta = new Vector3()
        const lastDelta = new Vector3()
        let swingDist = 0
        let reversals = 0
        let lastReversalAt = 0
        let deleting = false

        const resetShakeFeedback = () => {
            reversals = 0
            swingDist = 0
            if (!box.isDisposed()) MeshUtils.setColor(box, Color3.White().toColor4())
        }

        holdable.onGrabObservable.add(() => {
            lastPos.copyFrom(box.absolutePosition)
            lastDelta.setAll(0)
            resetShakeFeedback()
        })

        holdable.onMoveObservable.add(() => {
            if (this.disposed || deleting || box.isDisposed()) return
            box.absolutePosition.subtractToRef(lastPos, delta)
            if (delta.length() < 0.003) return   // tracking noise
            const now = performance.now()
            if (reversals > 0 && now - lastReversalAt > RESET_MS) resetShakeFeedback()
            if (Vector3.Dot(delta, lastDelta) < 0) {
                // Direction reversal: only counts if the swing was a real one
                if (swingDist >= SWING_MIN) {
                    reversals++
                    lastReversalAt = now
                    const progress = reversals / REVERSALS_TO_DELETE
                    if (reversals >= REVERSALS_TO_DELETE) {
                        deleting = true
                        MenuSystem.getInstance().showMessage("Instrument deleted")
                        NetworkManager.getInstance().node3d.nodes.remove(this)
                        return
                    }
                    MeshUtils.setColor(box, Color3.Lerp(Color3.White(), Color3.Red(), progress).toColor4())
                    MenuSystem.getInstance().showMessage(`Shake to delete… ${Math.round(progress * 100)} %`)
                }
                swingDist = 0
            } else {
                swingDist += delta.length()
            }
            lastDelta.copyFrom(delta)
            lastPos.copyFrom(box.absolutePosition)
        })

        holdable.onReleaseObservable.add(() => {
            if (!this.disposed && !deleting) resetShakeFeedback()
        })


        // On position change
        this.set_state("position")
        this.bounding_box.on_move = () => this.set_state("position")

        // Shadow Generator
        this.shared.shadowGenerator.addShadowCaster(this.bounding_mesh, false)

        // Per-node delete button (top-right corner, recycle-bin icon).
        this.createDeleteButton()
    }

    /**
     * A small billboarded 🗑 button pinned to the top-right-front corner of the
     * node. Pointing + trigger asks for confirmation (ChoiceMenu) before the
     * node is removed network-wide. Rebuilt on every bounding-box update since
     * it parents to the (recreated) bounding_mesh.
     */
    private createDeleteButton() {
        this.delete_button?.dispose()
        this.delete_button = null
        if (!this.bounding_mesh) return

        const scene = this.shared.scene
        const ext = this.bounding_mesh.getBoundingInfo().boundingBox.extendSize  // half-extents (local)
        const SIZE = 0.14

        const plane = MeshBuilder.CreatePlane("node3d_delete_btn", { size: SIZE }, scene)
        plane.parent = this.bounding_mesh
        // Top-right-front corner, nudged outward so it reads as "in the corner".
        plane.position.set(ext.x + SIZE * 0.4, ext.y + SIZE * 0.4, -ext.z - 0.01)
        plane.billboardMode = AbstractMesh.BILLBOARDMODE_ALL
        plane.isPickable = true
        plane.renderingGroupId = 1   // draw above the node so it's never occluded

        const tex = GUI.AdvancedDynamicTexture.CreateForMesh(plane, 256, 256)
        const circle = new GUI.Ellipse()
        circle.width = "100%"; circle.height = "100%"
        circle.background = "#c0392b"
        circle.color = "#ffffff"
        circle.thickness = 14
        tex.addControl(circle)
        const icon = new GUI.TextBlock()
        icon.text = "🗑"
        icon.fontSize = 130
        icon.color = "#ffffff"
        circle.addControl(icon)

        const hover = new InputHoverBehavior(
            () => { circle.background = "#e74c3c"; plane.scaling.setAll(1.18) },
            () => { circle.background = "#c0392b"; plane.scaling.setAll(1) },
        )
        const press = new InputGrabBehavior(
            () => this.openDeleteMenu(),
            () => {},
        )
        plane.addBehavior(hover)
        plane.addBehavior(press)

        this.delete_button = {
            dispose() {
                if (plane.isDisposed()) return
                plane.removeBehavior(hover)
                plane.removeBehavior(press)
                tex.dispose()
                plane.dispose()
            }
        }
    }

    /** Human-readable name of this node (e.g. "Fluid Field"), derived from its root. */
    public get displayName() {
        return this.root_transform?.name?.replace(/ root$/, "") ?? "node"
    }

    /** Every connection touching this node (deduplicated across all its ports). */
    private collectConnections(): N3DConnectionInstance[] {
        const set = new Set<N3DConnectionInstance>()
        for (const c of this.connectables.values()) for (const conn of c.connections) set.add(conn)
        return [...set]
    }

    /** Short label for a connection, from this node's point of view (signal flows output → input). */
    private connectionLabel(conn: N3DConnectionInstance): string {
        const out = conn.outputConnectable
        const inp = conn.inputConnectable
        const portName = (c: typeof out) => (c?.config.label || c?.config.id || "port")
        if (!out || !inp) return "incomplete connection"
        const local  = out.instance === this ? out : inp
        const remote = out.instance === this ? inp : out
        const flow   = out.instance === this ? "→" : "←"   // → = signal leaves this node
        return `${portName(local)} ${flow} ${remote.instance.displayName}:${portName(remote)}`
    }

    /**
     * Open/replace the per-node delete ChoiceMenu showing the given choices.
     * Reuses the same menu instance across navigation (mirrors openMenu) so we
     * never dispose the menu mid-click while swapping screens.
     */
    private showDeleteChoice(choices: { label: string; color?: string; click?: () => void }[]) {
        const menus = MenuSystem.getInstance()
        if (this._deleteMenu && menus.current_menu === this._deleteMenu) {
            this._deleteMenu.set(choices)
        } else {
            const menu = new ChoiceMenu(this.shared.scene, this.shared.utilityLayer.utilityLayerScene, choices)
            this._deleteMenu = menu
            menu.onHide.addOnce(() => { if (this._deleteMenu === menu) this._deleteMenu = null })
            menus.open(menu, true)
        }
    }

    /** Generic confirm screen: a message, then ✔ Confirm / ✖ Cancel. */
    private confirmDeleteChoice(message: string, onConfirm: () => void) {
        this.showDeleteChoice([
            { label: message, color: "#ffffff" },
            { label: "✔ Confirm", color: "#ff5555", click: () => { MenuSystem.getInstance().close(); onConfirm() } },
            { label: "✖ Cancel", color: "#aaaaaa", click: () => MenuSystem.getInstance().close() },
        ])
    }

    /** Top menu shown when the 🗑 corner button is pressed. */
    private openDeleteMenu() {
        this.showDeleteChoice([
            { label: "What to delete?", color: "#ffffff" },
            { label: "🗑 Delete object", color: "#ff5555", click: () =>
                this.confirmDeleteChoice("Delete this whole instrument?", () =>
                    NetworkManager.getInstance().node3d.nodes.remove(this)) },
            { label: "✂ Delete all connections", color: "#ffaa55", click: () => {
                const conns = this.collectConnections()
                if (conns.length === 0) { MenuSystem.getInstance().showMessage("No connections to delete"); return }
                this.confirmDeleteChoice(`Delete all ${conns.length} connection(s)?`, () => {
                    for (const c of conns) c.remove()
                })
            } },
            { label: "✂ Delete a specific connection…", color: "#ffcc55", click: () => this.openSpecificConnectionMenu() },
            { label: "✖ Cancel", color: "#aaaaaa", click: () => MenuSystem.getInstance().close() },
        ])
    }

    /** Lists this node's connections; picking one asks to confirm its deletion. */
    private openSpecificConnectionMenu() {
        const conns = this.collectConnections()
        if (conns.length === 0) { MenuSystem.getInstance().showMessage("No connections to delete"); return }
        const choices: { label: string; color?: string; click?: () => void }[] = [
            { label: "Pick a connection to delete:", color: "#ffffff" },
        ]
        for (const c of conns) {
            const label = this.connectionLabel(c)
            choices.push({ label, color: "#ffcc55", click: () =>
                this.confirmDeleteChoice(`Delete connection?\n${label}`, () => c.remove()) })
        }
        choices.push({ label: "← Back", color: "#aaaaaa", click: () => this.openDeleteMenu() })
        this.showDeleteChoice(choices)
    }

    private updateBoundingBox() {
        if (!this.bounding_box) this.updateBoundingBoxNow()
        else if (!this.doUpdateBoundingBox) {
            this.doUpdateBoundingBox = true
            setTimeout(() => {
                this.updateBoundingBoxNow()
                this.doUpdateBoundingBox = false
            })
        }
    }

    ///// Synchronized ////
    set_state: (key: string) => void = () => { }

    async initSync(_: string, set_state: (key: string) => void): Promise<void> {
        this.set_state = set_state
    }

    askStates(): void {
        this.set_state("position")
        for (const key of this.node.getStateKeys()) this.set_state(key)
        for (const [id, param] of this.parameters) if(!param.config.notSynced) this.set_state("node3d_parameter_"+id)
    }

    public async getState(key: string): Promise<any> {
        if (key == "position") return {
            position: this.bounding_box?.boundingBox.position.asArray(),
            rotation: this.bounding_box?.boundingBox.rotationQuaternion?.asArray() ?? [],
            scale: this.bounding_box?.boundingBox.scaling.x ?? 1,
        }
        else if (key.startsWith("node3d_parameter_")) {
            const id = key.substring("node3d_parameter_".length)
            const param = this.parameters.get(id)
            if (param && !param.config.notSynced) return param.config.getValue()
        }
        else return this.node.getState(key)
    }

    public async setState(key: string, value: any): Promise<void> {
        if (key == "position") {
            this.bounding_box?.boundingBox.position.fromArray(value.position)
            this.bounding_box?.boundingBox.rotationQuaternion?.fromArray(value.rotation)
            this.bounding_box?.boundingBox.scaling.setAll(value.scale)
        } else if (key === "delete") {
            if (this.disposed) return
            await this.dispose()

        } else if (key.startsWith("node3d_parameter_")) {
            const id = key.substring("node3d_parameter_".length)
            const param = this.parameters.get(id)
            if (param && !param.config.notSynced) param.config.setValue(value)
        }
        else this.node.setState(key, value)
    }

    public updatePosition(){
        if(this.disposed) return
        this.set_state("position")
    }

    async removeState(_key: string): Promise<void> { }

    disposeSync(): void { this.set_state = () => { } }

    private disposed = false

    public async dispose() {
        if (this.disposed) return
        this.on_dispose()
        this.disposed = true
        this.set_state("delete")
        this.highlighter.dispose()
        this.delete_button?.dispose()
        this.bounding_box?.dispose()
        this.bounding_mesh?.dispose()
        this.parameters.forEach(it => it.dispose())
        this.buttons.forEach(it => it.dispose())
        this.connectables.forEach(it => it.dispose())
        this.observers.forEach(observable => observable.remove())
        this.observers.clear()
        await this.node.dispose()
        await this.gui.dispose()
    }

    static getSyncManager(
        doc: Doc,
        audioManager: Node3dManager,
        onAdd?: (instance:Node3DInstance)=>void,
        onRemove?: (instance:Node3DInstance)=>void,
    ) {
        const syncmanager: SyncManager<Node3DInstance, string> = new SyncManager({
            name: "node3d_instances",
            doc,
            async on_add(instance) {
                instance.on_dispose = () => syncmanager.remove(instance)
                onAdd?.(instance)
            },
            async create(_, __, kind) { return (await audioManager.builder.create(kind)) as Node3DInstance },
            async on_remove(instance) {
                onRemove?.(instance)
                await instance.dispose()
            },
        })
        // syncmanager.add(node_id,node,kind)
        return syncmanager
    }
}