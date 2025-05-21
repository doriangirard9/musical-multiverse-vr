import { Scene, TransformNode, AbstractMesh, Mesh, MeshBuilder, HighlightLayer } from "@babylonjs/core";
import { Node3DConnectable } from "./Node3DConnectable";
import { Node3DParameter } from "./Node3DParameter";
import { Node3D, Node3DFactory, Node3DGUI } from "./Node3D";
import { AudioNode3D } from "../AudioNode3D";
import { AudioNodeState } from "../../network/types";
import { BoundingBox } from "../../boundingBox/BoundingBox";
import { DragParamNodeComp } from "../components/DragParamNodeComp";
import { UIManager } from "../../app/UIManager";
import { SimpleMenu } from "../../menus/SimpleMenu";

export class Node3DInstance extends AudioNode3D{

    constructor(
        id: string,
        private scene: Scene,
        private uiManager: UIManager,
        private audioCtx: AudioContext,
        private hostGroupId: string,
        private node_factory: Node3DFactory<Node3DGUI,Node3D>
    ){
        super(audioCtx,id)
    }

    private declare gui: Node3DGUI
    private declare node: Node3D
    private parameter_map = new Map<string, DragParamNodeComp>()
    private declare root_transform: TransformNode
    private menu = null as null|SimpleMenu

    async instantiate(){

        const instance = this
        const label = this.node_factory.label
        const highlightLayer = new HighlightLayer(`${this.id}-${this.node_factory.label}`, this.scene)

        // GUI related things
        const root_transform = this.root_transform = new TransformNode("node3d root", this.scene)
        this.gui = await this.node_factory.createGUI({
            babylon: await import("@babylonjs/core"),
            scene: this.scene,
        })
        this.gui.root.parent = root_transform

        // Node related things
        this.node = await this.node_factory.create({
            audioCtx: this.audioCtx,
            hostGroupId: this.hostGroupId,

            // Le nom du wam
            setLabel(label: string){
                root_transform.name = `${label} root`
            },

            // Les paramètres draggables
            createParameter(info: Node3DParameter){
                const param = new DragParamNodeComp(
                    instance.root_transform,
                    info.mesh,
                    highlightLayer,
                    info.getLabel.bind(info),
                    info.getValue.bind(info),
                    info.setValue.bind(info),
                    info.getStepCount.bind(info),
                    info.stringify.bind(info)
                )
                instance.parameter_map.set(info.id,param)
            },
            removeParameter(id: Node3DParameter["id"]){
                instance.parameter_map.get(id)?.dispose()
                instance.parameter_map.delete(id)
            },

            // Les outputs et inputs que l'on peut connecter
            createConnectable(info: Node3DConnectable){
                //TODO Il faut remplir cette fonctionnalité
            },
            removeConnectable(id: Node3DConnectable["id"]){
                //TODO Il faut remplir cette fonctionnalité
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

            // Afficher un menu
            openMenu(choices: { label: string; icon?: TransformNode; action: () => void; }[]){
                if(instance.menu)instance.menu.dispose()
                instance.menu = new SimpleMenu(`${label} menu`, instance.uiManager.getGui3DManager())
                instance.menu.setConfig({
                    label: `Menu of ${label}`,
                    buttons: choices
                })
            },
            closeMenu(){
                if(instance.menu){
                    instance.menu.dispose()
                    instance.menu = null
                }
            },

            // Afficher un message
            showMessage(message: string){
                instance.uiManager.showMessage(message,3000)
            },
            delete(){
                instance.dispose()
            },
            
            notifyStateChange(key?: string){
                //TODO Il faut remplir cette fonctionnalité
            }
        },this.gui)
    }

    //// BOUNDING BOX ////
    private boxes = [] as AbstractMesh[]
    private bounding_mesh = null as null|Mesh
    private bounding_box = null as null|BoundingBox
    private doUpdateBoundingBox = false

    private updateBoundingBox(){
        if(!this.doUpdateBoundingBox){
            this.doUpdateBoundingBox=true
            setTimeout(()=>{
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
                }, this._scene)
                size.scaleInPlace(.5)
                this.bounding_mesh.position.subtractInPlace(bounds.min).subtractInPlace(size)
                this.bounding_mesh.isVisible = false

                this.root_transform.parent = this.bounding_mesh

                this.baseMesh = this.bounding_mesh
                this.bounding_box = new BoundingBox(this,this.id)

                this.doUpdateBoundingBox=false
            })
        }
    }

    public getAudioNode(): AudioNode {
        // TODO LALALA
        return undefined as any as AudioNode
    }


    public async getState(): Promise<AudioNodeState> {
        return {

        } as any as AudioNodeState
    }

    private disposed = false

    public async dispose(){
        this.disposed = true
        this.bounding_box?.dispose()
        this.bounding_mesh?.dispose()
        this.menu?.dispose()
        await this.node.dispose()
        await this.gui.dispose()
        this.parameter_map.forEach(it=>it.dispose())
    }
}