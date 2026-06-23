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
    Color4
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
import { SceneManager } from "../../app/SceneManager.ts";
import { InputManager } from "../../xr/inputs/InputManager.ts";
import { BoxWave } from "../../world/BoxWave.ts";
import { MenuSystem } from "../../app/MenuSystem.ts";
import { AbstractMenu } from "../../menus/AbstractMenu.ts";
import { ChoiceMenu } from "../../menus/ChoiceMenu.ts";
import { ShakeBehavior } from "../../behaviours/ShakeBehavior.ts";
import { N3DConnectionInstance } from "./N3DConnectionInstance.ts";
import { N3DButtonInstance } from "./N3DButtonInstance.ts";

export class Node3DInstance implements Synchronized {

    static readonly SIZE_MULTIPLIER = .2
    static readonly CONNECTION_SIZE_MULTIPLIER = .1

    constructor(
        private shared: N3DShared,
        readonly factory: Node3DFactory<Node3DGUI, Node3D>,
    ) { }

    private declare gui: Node3DGUI
    private declare node: Node3D
    readonly parameters = new Map<string, N3DParameterInstance>()
    readonly buttons = new Map<string, N3DButtonInstance>()
    readonly connectables = new Map<string, N3DConnectableInstance>()
    readonly onParameterChanged = new Observable<{ id: string, value: number }>()
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

        gui_root_transform.parent = root_transform
        this.gui.root.parent = gui_root_transform
        gui_root_transform.scaling.setAll(this.gui.worldSize * Node3DInstance.SIZE_MULTIPLIER)


        // Node related things
        this.node = await this.factory.create({
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
                const button = new N3DButtonInstance(instance, instance.root_transform, highlightLayer, utilityLayer, info)
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
    private red_bounding_mesh = null as null | Mesh
    private bounding_box = null as null | BoundingBox
    private doUpdateBoundingBox = false
    private shake: ShakeBehavior|null = null

    get boundingBoxMesh() { return this.bounding_box!!.boundingBox }

    private updateBoundingBoxNow() {
        if (this.disposed) return

        if (this.bounding_mesh) this.shared.shadowGenerator.removeShadowCaster(this.bounding_mesh)
        this.bounding_box?.dispose()
        this.bounding_mesh?.dispose()
        this.red_bounding_mesh?.dispose()


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
        this.bounding_mesh.receiveShadows = false
        this.bounding_mesh.checkCollisions = false
        this.bounding_mesh.isPickable = false

        this.root_transform.parent = this.bounding_mesh

        this.bounding_box = new BoundingBox(this.bounding_mesh)

        // Shake to delete
        // [YASSINE_CEST_LA] J'ai remplacé par le ShakeBehaviour:
        //  Meilleur séparation du code, plus flexible, plus réutilisable et comme ça c'est le même comportement
        //  pour tous ce qui se base sur le shake (cables, bounding box, etc).
        //  Si le shake marche mal, il faut corriger le ShakeBehaviour.
        const bbox = this.bounding_box.boundingBox

        const red_box = this.red_bounding_mesh = bbox.clone("red_box", bbox, true)
        red_box.makeGeometryUnique()
        MeshUtils.setColor(red_box, new Color4(1, 0, 0,1))
        red_box.resetLocalMatrix()
        red_box.isPickable = false
        red_box.checkCollisions = false
        red_box.visibility = 0

        this.shake = new ShakeBehavior()
        this.shake.shake_threshold = 5
        bbox.addBehavior(this.shake)
        this.shake.on_shake = (_, counter) => {
            red_box.visibility = Math.min(1, counter / 12)
            if(counter>10) this.dispose()
        }
        this.shake.on_stop = (_, __) => {
            red_box.visibility = 0
        }
        this.shake.on_drop = () => {
            red_box.visibility = 0
        }


        // On position change
        this.set_state("position")
        this.bounding_box.on_move = () => this.set_state("position")

        // Shadow Generator
        this.shared.shadowGenerator.addShadowCaster(this.bounding_mesh, false)
    }

    /** Every connection touching this node (deduplicated across all its ports). */
    get connections(): N3DConnectionInstance[] {
        const set = new Set<N3DConnectionInstance>()
        for (const c of this.connectables.values()) for (const conn of c.connections) set.add(conn)
        return [...set]
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
