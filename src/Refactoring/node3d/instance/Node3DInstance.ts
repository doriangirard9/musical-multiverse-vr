import { Scene, TransformNode, AbstractMesh, Mesh, MeshBuilder, Vector3, Quaternion } from "@babylonjs/core";
import { Node3DConnectable } from "../Node3DConnectable";
import { Node3DParameter } from "../Node3DParameter";
import { Node3D, Node3DFactory, Node3DGUI } from "../Node3D";
import { BoundingBox } from "../../boundingBox/BoundingBox";
import { UIManager } from "../../app/UIManager";
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
import { N3DMenuInstance } from "./utils/N3DMenuManager";

export class Node3DInstance implements Synchronized{

    constructor(
        private shared: N3DShared,
        private node_factory: Node3DFactory<Node3DGUI,Node3D>
    ){}

    private declare gui: Node3DGUI
    private declare node: Node3D
    readonly parameters = new Map<string, N3DParameterInstance>()
    readonly connectables = new Map<string, N3DConnectableInstance>()
    private declare root_transform: TransformNode
    private menu!: N3DMenuInstance
    private highlighter!: N3DHighlighter

    async instantiate(){
        const {scene, highlightLayer, babylon, tools} = this.shared

        const instance = this
        const label = this.node_factory.label
        
        const highlighter = this.highlighter = new N3DHighlighter(highlightLayer)
        const menu = this.menu = this.shared.menuManager.createInstance()


        // GUI related things
        const root_transform = this.root_transform = new TransformNode("node3d root", scene)

        const gui_root_transform = new TransformNode("node3d gui root",scene)

        this.gui = await this.node_factory.createGUI({
            babylon, tools, scene,

            materialLight: this.shared.materialLight,
            materialMat: this.shared.materialMat,
            materialMetal: this.shared.materialMetal,
            materialShiny: this.shared.materialShiny,

            highlight: (...p) => highlighter.highlight(...p),
            unhighlight: (...p) => highlighter.unhighlight(...p)
        })

        gui_root_transform.parent = root_transform
        this.gui.root.parent = gui_root_transform
        gui_root_transform.scaling.setAll(this.gui.worldSize)


        // Node related things
        this.node = await this.node_factory.create({
            audioCtx: this.shared.audioContext,
            groupId: this.shared.groupId,
            tools,

            // Le nom du wam
            setLabel(label: string){
                root_transform.name = `${label} root`
            },

            // Les paramètres draggables
            createParameter(info: Node3DParameter){
                const param = new N3DParameterInstance(instance.root_transform, highlightLayer, info)
                instance.parameters.set(info.id,param)
            },
            removeParameter(id: Node3DParameter["id"]){
                instance.parameters.get(id)?.dispose()
                instance.parameters.delete(id)
            },

            // Les outputs et inputs que l'on peut connecter
            createConnectable(info: Node3DConnectable){
                const connectable = new N3DConnectableInstance( instance, info, highlightLayer, IOEventBus.getInstance())
                instance.connectables.set(info.id,connectable)
            },
            removeConnectable(id: Node3DConnectable["id"]){
                instance.connectables.get(id)?.dispose()
                instance.connectables.delete(id)
            },

            createButton(info) {
                
            },
            removeButton(id) {
                
            },

            // Les mesh qui font partis de la bounding box
            // En attendant la bounding box est une boite qui les englobes
            addToBoundingBox(mesh: AbstractMesh){
                instance.boxes.push(mesh)
                instance.updateBoundingBox()
            },
            removeFromBoundingBox(mesh: AbstractMesh){
                const idx = instance.boxes.indexOf(mesh)
                if(idx>=0) instance.boxes.splice(idx,1)
                instance.updateBoundingBox()
            },

            // Afficher un menu ou un message
            openMenu(choices: { label: string; icon?: TransformNode; action: () => void; }[]){
                menu.openMenu(label, choices)
            },
            closeMenu(){
                menu.closeMenu()
            },
            showMessage(message: string){
                menu.print(message)
            },

            getPlayerPosition() {
                const xrManager = XRManager.getInstance();
                if (xrManager.xrHelper && xrManager.xrHelper.baseExperience) {
                    const vrCamera = xrManager.xrHelper.baseExperience.camera;
                    return {position: vrCamera.globalPosition.clone(), rotation: vrCamera.absoluteRotation.clone()}
                }
                else return {position:Vector3.Zero(), rotation: Quaternion.Identity()}
            },

            getPosition(){
                return {position: instance.root_transform.absolutePosition.clone(), rotation: instance.root_transform.absoluteRotationQuaternion.clone()}
            },

            delete(){
                instance.dispose()
            },
            
            notifyStateChange(key: string){
                instance.set_state(key)
            }
        },this.gui)
    }

    //// BOUNDING BOX ////
    private boxes = [] as AbstractMesh[]
    private bounding_mesh = null as null|Mesh
    private bounding_box = null as null|BoundingBox
    private doUpdateBoundingBox = false

    private updateBoundingBoxNow(){
        if(this.disposed)return

        this.bounding_box?.dispose()
        this.bounding_mesh?.dispose()

        
        const bounds = this.boxes
            .map(it=>it.getHierarchyBoundingVectors(true))
            .reduce((a,b)=>({min: a.min.minimizeInPlace(b.min), max: a.max.maximizeInPlace(b.max)}))

        const size = bounds.max.subtractInPlace(bounds.min)
        this.bounding_mesh = MeshBuilder.CreateBox('box', {
            width: size.x,
            height: size.y,
            depth: size.z,
        }, this.shared.scene)
        size.scaleInPlace(.5)
        this.bounding_mesh.position.subtractInPlace(bounds.min).subtractInPlace(size)
        this.bounding_mesh.isVisible = false

        this.root_transform.parent = this.bounding_mesh

        this.bounding_box = new BoundingBox(this.bounding_mesh)

        this.set_state("position")
        this.bounding_box.on_move = ()=>this.set_state("position")
    }

    private updateBoundingBox(){
        if(!this.bounding_box) this.updateBoundingBoxNow()
        else if(!this.doUpdateBoundingBox){
            this.doUpdateBoundingBox=true
            setTimeout(()=>{
                this.updateBoundingBoxNow()
                this.doUpdateBoundingBox=false
            })
        }
    }

    ///// Synchronized ////
    private set_state: (key:string)=>void = ()=>{}

    async initSync(_: string, set_state: (key: string) => void): Promise<void> {
        this.set_state = set_state
    }

    askStates(): void { 
        this.set_state("position")
        for(const key of this.node.getStateKeys()) this.set_state(key)
    }

    public async getState(key: string): Promise<any> {
        if(key=="position") return {
            position: this.bounding_box?.boundingBox.position.asArray(),
            rotation: this.bounding_box?.boundingBox.rotation.asArray(),
        }
        else return this.node.getState(key)
    }

    public async setState(key: string, value: any): Promise<void> {
        if(key=="position"){
            this.bounding_box?.boundingBox.position.fromArray(value.position) 
            this.bounding_box?.boundingBox.rotation.fromArray(value.rotation)
        }
        else this.node.setState(key,value)
    }

    async removeState(key: string): Promise<void> {}

    disposeSync(): void { this.set_state = ()=>{} }

    private disposed = false

    public async dispose(){
        this.disposed = true
        this.highlighter.dispose()
        this.bounding_box?.dispose()
        this.bounding_mesh?.dispose()
        this.parameters.forEach(it=>it.dispose())
        this.connectables.forEach(it=>it.dispose())
        this.menu?.dispose()
        await this.node.dispose()
        await this.gui.dispose()
    }

    static getSyncManager(
        scene: Scene,
        doc: Doc,
        audioManager: Node3dManager,
        messages: UIManager
    ){
        const syncmanager: SyncManager<Node3DInstance,string> = new SyncManager({
            name: "node3d_instances",
            doc,
            async create(_,__,kind) { return (await audioManager.builder.create(kind)) as Node3DInstance },
            async on_remove(instance) { instance.dispose() },
        })
        return syncmanager
    }
}