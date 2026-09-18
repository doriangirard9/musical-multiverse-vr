import {
    TransformNode,
    AbstractMesh,
    Mesh,
    MeshBuilder,
    Vector3,
    Quaternion, Color3,
    Vector2,
    Observer,
    Observable,
} from "@babylonjs/core";
import { Node3DConnectable } from "../Node3DConnectable";
import { Node3DParameter } from "../Node3DParameter";
import { Node3D, Node3DFactory, Node3DGUI } from "../Node3D";
import { BoundingBox } from "../../behaviours/boundingBox/BoundingBox";
import { N3DParameterInstance, ParameterChangeMode } from "./N3DParameterInstance";
import { N3DConnectableInstance } from "./N3DConnectableInstance";
import { IOEventBus } from "../../eventBus/IOEventBus";
import { XRManager } from "../../xr/XRManager";
import { SyncManager } from "../../network/sync/SyncManager";
import { Node3dManager } from "../../app/node3d/Node3dManager.ts";
import { Doc } from "yjs";
import { Synchronized } from "../../network/sync/Synchronized";
import { N3DHighlighter } from "./utils/N3DHighlighter";
import { N3DShared } from "./N3DShared";
import { AutomationN3DConnectable } from "../tools";
import { SceneManager } from "../../app/SceneManager.ts";
import { InputManager } from "../../xr/inputs/InputManager.ts";
import { ToolSystem } from "../../app/tool/ToolSystem.ts";
import * as instrument from "../../instrument/index.ts";
import { InstrumentInteractionSystem } from "../../instrument/InstrumentInteractionSystem.ts";
import { BoxWave } from "../../world/BoxWave.ts";
import { MenuSystem } from "../../app/menu/MenuSystem.ts";
import { AbstractMenu } from "../../menus/AbstractMenu.ts";
import { ChoiceMenu } from "../../menus/ChoiceMenu.ts";
import { N3DConnectionInstance } from "./N3DConnectionInstance.ts";
import { N3DButtonInstance } from "./N3DButtonInstance.ts";
import { AudioWorldSystem } from "../../app/node3d/AudioDestinationSystem.ts";
import { PointerInput } from "../../xr/inputs/PointerInput.ts";


export class Node3DInstance implements Synchronized {

    static readonly SIZE_MULTIPLIER = .2
    static readonly CONNECTION_SIZE_MULTIPLIER = .1

    constructor(
        readonly shared: N3DShared,
        readonly factory: Node3DFactory<Node3DGUI, Node3D>,
    ) { }

    private declare gui: Node3DGUI
    private declare node: Node3D
    
    /* Draggable parameters of this node. */
    readonly parameters = new Map<string, N3DParameterInstance>()

    /** Buttons of this node. */
    readonly buttons = new Map<string, N3DButtonInstance>()

    /** Connectables (inputs and outputs) of this node. */
    readonly connectables = new Map<string, N3DConnectableInstance>()

    /** Notified when a parameter of the node has changed its value. */
    readonly onParameterChanged = new Observable<{ id: string, value: number }>()

    /** Notified when a parameter of the node has to be shown in the GUI. */
    readonly onParameterShow = new Observable<N3DParameterInstance>()

    /** Notified when a parameter of the node has to be hidden in the GUI. */
    readonly onParameterHide = new Observable<N3DParameterInstance>()

    /** Notified when a parameter of the node start being dragged (to change its value). */
    readonly onParameterDragStart = new Observable<{parameter:N3DParameterInstance, value:number}>()

    /** Notified when a parameter of the node is being dragged (to change its value). */
    readonly onParameterDrag = new Observable<{parameter:N3DParameterInstance, value:number}>()

    /** Notified when a parameter of the node stops being dragged (to change its value). */
    readonly onParameterDragStop = new Observable<{parameter:N3DParameterInstance, value:number}>()

    /** Notified on connectable creation. */
    readonly onConnectableCreated = new Observable<N3DConnectableInstance>()

    /** Notified on parameter creation. */
    readonly onParameterCreated = new Observable<{parameter:N3DParameterInstance,connection:N3DConnectableInstance}>()

    /** Notified on connection creation. */
    readonly onConnectionCreated = new Observable<N3DConnectionInstance>()

    /** Notified on button creation. */
    readonly onButtonCreated = new Observable<N3DButtonInstance>()

    /** Are the node manual controls locked? If true, the node cannot be moved or rotated manually. */
    set isLocked(value: boolean) {
        this.set_state("locked")
        this.bounding_box!!.isLocked = value
    }
    get isLocked(): boolean { return this.bounding_box!!.isLocked }

    /** Get the bounding box mesh for this node. Unstable, can be regenerated.*/
    get boundingBoxMesh() { return this.bounding_box!!.boundingBox }

    /** Get the enclosing box, a box enclosing the node's meshes. */
    get enclosingBox() { return this.enclosing_box! }

    /** Every connection touching this node (deduplicated across all its ports). */
    get connections(): N3DConnectionInstance[] {
        const set = new Set<N3DConnectionInstance>()
        for (const c of this.connectables.values()) for (const conn of c.connections) set.add(conn)
        return [...set]
    }

    /** Called when the node is disposed. */
    public on_dispose = () => { }

    /** On node3d move. Pass the bounding box mesh. */
    readonly onMove = new Observable<AbstractMesh>()

    /** On node3d disposed. */
    readonly onDispose = new Observable<void>()

    /**
     * Notified when hands start holding this node, with the pointers holding it.
     *
     * @remarks
     * A node is held by the world itself, through its bounding box, whatever the tool the hand
     * holds. Told here rather than guessed from a trigger, so a hold made with two hands, or given
     * up because a hand lost the right to hold, is known just the same.
     */
    readonly onGrab = new Observable<PointerInput[]>()

    /** Notified when the last hand holding this node lets go, with the pointers that were holding it. */
    readonly onRelease = new Observable<PointerInput[]>()


    private declare root_transform: TransformNode
    private highlighter!: N3DHighlighter
    private observers = new Set<Observer<any>>()
    private disposables = new Set<() => void>()

    async instantiate() {
        const { scene, highlightLayer, utilityLayer, babylon, tools } = this.shared

        const instance = this
        const label = this.factory.label

        const highlighter = this.highlighter = new N3DHighlighter(highlightLayer)
        const menus = MenuSystem.getInstance()
        let lastMenu: AbstractMenu|null = null


        // GUI related things
        const root_transform = this.root_transform = new TransformNode(`${label} root`, scene)
        
        const gui_root_transform = new TransformNode(`${label} gui root`, scene)
        gui_root_transform.parent = root_transform

        this.root_box = MeshBuilder.CreateBox(`${label} movable hitbox`, {size:1}, this.shared.scene)
        this.root_box.visibility = 0
        this.root_box.receiveShadows = false
        this.root_box.checkCollisions = false
        this.root_box.isPickable = false
        this.root_transform.parent = this.root_box

        this.enclosing_box = MeshBuilder.CreateBox(`${label} node3d enclosing mesh`, {size:1}, this.shared.scene)
        this.shared.shadowGenerator.addShadowCaster(this.enclosing_box, false)
        this.enclosing_box.visibility = 0
        this.enclosing_box.receiveShadows = false
        this.enclosing_box.checkCollisions = false
        this.enclosing_box.isPickable = false
        this.enclosing_box.parent = root_transform
        this.enclosing_box.resetLocalMatrix()

       
        this.gui = await this.factory.createGUI({
            babylon, tools, scene,

            materialLight: this.shared.materialLight,
            materialTransparent: this.shared.materialTransparent,
            materialMat: this.shared.materialMat,
            materialMetal: this.shared.materialMetal,
            materialShiny: this.shared.materialShiny,

            highlight: (...p) => highlighter.highlight(...p),
            unhighlight: (...p) => highlighter.unhighlight(...p)
        })

        this.gui.root.parent = gui_root_transform

        gui_root_transform.scaling.setAll(this.gui.worldSize * Node3DInstance.SIZE_MULTIPLIER)

        // Node related things
        // TODO: Better exception handling
        try{
            this.node = await this.factory.create({
                audioCtx: this.shared.audioContext,
                audioEngine: this.shared.audioEngine,
                groupId: this.shared.groupId,
                tools,
                inputs: InputManager.getInstance(),
                interaction: InstrumentInteractionSystem.getInstance(),
                instrument,

                // The WAM's name
                setLabel(label: string) {
                    root_transform.name = `${label} root`
                },

                // Draggable parameters
                createParameter(info: Node3DParameter) {
                    const param = new N3DParameterInstance(instance, highlightLayer, info)
                    instance.parameters.set(info.id, param)
                    let last_value = 0
                    const connectableinfo = new AutomationN3DConnectable.Input(
                        `${info.id}_connectable`,
                        info.meshes,
                        "",
                        {
                            getLabel() { return info.getLabel() },

                            getMin() { return info.getMin() },
                            getMax() { return info.getMax() },
                            getStepSize() { return info.getStepSize() },
                            getExponant() { return info.getExponant() },

                            stringify(value) { return info.stringify(value) },
                            setValue(value) { 
                                param.setValue(value, ParameterChangeMode.AUTOMATION)
                                last_value = value
                            },
                            lock(isLocked) {
                                if(!isLocked) param.setValue(last_value, ParameterChangeMode.MANUAL)
                                param.isLocked = isLocked
                            },
                        },
                    )
                    const connectable = new N3DConnectableInstance(instance, connectableinfo, highlightLayer, utilityLayer, IOEventBus.getInstance(), true, false)
                    instance.connectables.set(connectableinfo.id, connectable)
                    instance.onParameterCreated.notifyObservers({parameter:param, connection:connectable})
                },
                removeParameter(id: Node3DParameter["id"]) {
                    instance.parameters.get(id)?.dispose()
                    instance.parameters.delete(id)
                    instance.connectables.get(`${id}_connectable`)?.dispose()
                },

                // Connectable outputs and inputs
                createConnectable(info: Node3DConnectable) {
                    const connectable = new N3DConnectableInstance(instance, info, highlightLayer, utilityLayer, IOEventBus.getInstance())
                    instance.connectables.set(info.id, connectable)
                    instance.onConnectableCreated.notifyObservers(connectable)
                },
                removeConnectable(id: Node3DConnectable["id"]) {
                    instance.connectables.get(id)?.dispose()
                    instance.connectables.delete(id)
                },

                createButton(info) {
                    const button = new N3DButtonInstance(instance, instance.root_transform, highlightLayer, utilityLayer, info)
                    instance.buttons.set(info.id, button)
                    instance.onButtonCreated.notifyObservers(button)
                },
                removeButton(id) {
                    instance.buttons.get(id)?.dispose()
                    instance.buttons.delete(id)
                },

                // Meshes that are part of the bounding box
                // For now the bounding box is a box enclosing them
                addToBoundingBox(mesh: AbstractMesh) {
                    instance.boxes.push(mesh)

                    instance.updateBoundingBox()
                },
                removeFromBoundingBox(mesh: AbstractMesh) {
                    const idx = instance.boxes.indexOf(mesh)
                    if (idx >= 0) instance.boxes.splice(idx, 1)
                    instance.updateBoundingBox()
                },

                // Show a menu or a message
                openMenu(choices: { label: string; color?: string, click?: () => void; }[], options?: { showCloseBar?: boolean, dragToScroll?: boolean }) {
                    if(lastMenu && lastMenu instanceof ChoiceMenu && lastMenu===menus.current_menu){
                        lastMenu.set(choices)
                    }
                    else{
                        const new_menu = new ChoiceMenu(scene, utilityLayer.utilityLayerScene, choices, options)
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

                equipTool(controller, kind) {
                    const equipment = ToolSystem.getInstance().equip(controller, kind)

                    const dispose = () => {
                        equipment.dispose()
                        instance.disposables.delete(dispose)
                    }
                    instance.disposables.add(dispose)

                    return { dispose }
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

                createOutputNode(position, forward) {
                    const output = AudioWorldSystem.getInstance().createSoundOutput(position, forward)

                    const dispose = ()=>{
                        output.dispose()
                        instance.disposables.delete(dispose)
                    }
                    instance.disposables.add(dispose)
                    
                    return {
                        pannerNode: output.pannerNode,
                        dispose: dispose
                    }
                },

                addFilter(input, output, order) {
                    const disposeFilter = AudioWorldSystem.getInstance().addFilter(input, output, order)
                    
                    const dispose = ()=>{
                        disposeFilter()
                        instance.disposables.delete(dispose)
                    }

                    instance.disposables.add(dispose)
                    
                    return dispose
                },

            }, this.gui)
        }catch(e){
            this.gui.dispose()
            gui_root_transform.dispose()
            root_transform.dispose()
            throw e
        }
    }

    //// BOUNDING BOX ////
    private boxes = [] as AbstractMesh[]
    private root_box!: Mesh
    private bounding_box = null as null | BoundingBox
    private enclosing_box = null as null | Mesh
    private doUpdateBoundingBox = false

    private updateBoundingBoxNow() {
        if (this.disposed) return

        // Get previous data to copy back
        const isLocked = this.bounding_box?.isLocked ?? false

        // A box thrown away while it was held is a hold that ends: said, so nobody is left carrying
        // a node the world no longer gives it.
        if(this.bounding_box?.holdable.isDragging) this.onRelease.notifyObservers([])

        this.bounding_box?.dispose()

        // Get bounds
        const worldBounds = this.boxes
            .map(it => it.getHierarchyBoundingVectors(true))
            .reduce((a, b) => ({ min: a.min.minimizeInPlace(b.min), max: a.max.maximizeInPlace(b.max) }))

        const worldSize = worldBounds.max .subtract(worldBounds.min)
        const worldCenter = worldSize.scale(.5) .addInPlace(worldBounds.min)

        // Create the movable bounding box
        this.root_transform.setParent(null)
        this.root_box.dispose()

        this.root_box = MeshBuilder.CreateBox('node3d hitbox mesh', {
            width: worldSize.x,
            height: worldSize.y,
            depth: worldSize.z,
        }, this.shared.scene)
        this.root_box.position.copyFrom(worldCenter)
        this.root_box.visibility = 0
        this.root_box.receiveShadows = false
        this.root_box.checkCollisions = false
        this.root_box.isPickable = false

        this.root_transform.setParent(this.root_box)

        // Resize enclosing box
        const localSize = this.root_box.getBoundingInfo().boundingBox.extendSize
        this.enclosing_box!.scaling.set(
            localSize.x*2,
            localSize.y*2,
            localSize.z*2,
        )
        this.enclosing_box!.position.copyFrom(this.root_box.position)

        this.bounding_box = new BoundingBox(this.root_box)
        this.bounding_box.isLocked = isLocked

        // On position change
        this.set_state("position")
        this.bounding_box.on_move = () => this.set_state("position")

        // The bounding box is thrown away and built again whenever the meshes of the node move, so
        // what listens to a hold is hooked back onto the new one here, not once and for all.
        this.bounding_box.holdable.onGrabObservable.add(pointers => this.onGrab.notifyObservers(pointers))
        this.bounding_box.holdable.onReleaseObservable.add(pointers => this.onRelease.notifyObservers(pointers))

        // On move observable
        this.bounding_box.boundingBox.onAfterWorldMatrixUpdateObservable.add(() => {
            this.onMove.notifyObservers(this.bounding_box!!.boundingBox)
        })
        this.onMove.notifyObservers(this.bounding_box!!.boundingBox)
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
        else if (key === "locked") return this.bounding_box!.isLocked
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
        } else if (key === "locked") {
            this.bounding_box!.isLocked = value
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
        this.onDispose.notifyObservers()
        this.on_dispose()
        this.disposed = true
        this.set_state("delete")
        this.highlighter.dispose()
        this.bounding_box?.dispose()
        this.root_box.dispose()
        this.parameters.forEach(it => it.dispose())
        this.buttons.forEach(it => it.dispose())
        this.connectables.forEach(it => it.dispose())
        this.observers.forEach(observable => observable.remove())
        this.observers.clear()
        this.disposables.forEach(dispose => dispose())
        this.disposables.clear()
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
