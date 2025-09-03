import { AbstractMesh, CreateSoundAsync, Vector3, type Mesh, type TransformNode } from "@babylonjs/core";
import { Node3D, Node3DFactory, Node3DGUI } from "../../Node3D";
import { Node3DContext } from "../../Node3DContext";
import { Node3DGUIContext } from "../../Node3DGUIContext";
import { AbstractSoundSource } from "@babylonjs/core/AudioV2/abstractAudio/abstractSoundSource";

const SPEAKER_URL = (await import("./speaker.glb?url")).default


export class SpeakerN3DGUI implements Node3DGUI{
    
    audioInput!: Mesh
    speaker!: AbstractMesh
    root!: TransformNode
    falloffSphere!: Mesh

    get worldSize(){ return 2 }

    constructor(){}

    async init(context: Node3DGUIContext){
        const {babylon:B, tools:{MeshUtils}} = context

        this.root = new B.TransformNode("audio output root", context.scene)

        this.speaker = await B.ImportMeshAsync(SPEAKER_URL, context.scene) .then(it=>it.meshes[0])
        this.speaker.parent = this.root

        this.audioInput = B.CreateSphere("audio output input", {diameter:.5}, context.scene)
        MeshUtils.setColor(this.audioInput, new B.Color4(0,1,0,1))
        this.audioInput.parent = this.root
        this.audioInput.position.set(-0.5,0,0)

        /* FallOff selon l'idée de michel, il veut que ça soit tout le temps visible,
           au départ je voulais afficher uniquement si on drag puis uniquement si on est a l'extérieur
           mais de ce qu'il ma dit en visio c'est plus un truc comme ça qu'il imagine (même
           si ça rend très moche je trouve 3 outputs dans le monde = horrible)
         */
        
        this.falloffSphere = B.CreateSphere("audio output falloff", {diameter:50}, context.scene)
        this.falloffSphere.setEnabled(false)
        const material = new B.StandardMaterial("falloffSphereMaterial", context.scene)
        material.diffuseColor = new B.Color3(1, 0, 0)
        material.alpha = 0.1 // transparence
        material.backFaceCulling = false // permet de garder la sphere visible si on est à l'intérieur
        this.falloffSphere.material = material // besoin de créé un autre mat sinon je ne peux pas accéder à BackfaceCulling
        this.falloffSphere.isPickable = false
        this.falloffSphere.parent = this.root
        
    }

    doShowFalloff(shown: boolean){
        this.falloffSphere.setEnabled(shown)
    }

    async dispose(){ }
}


export class SpeakerN3D implements Node3D{

    node!: AudioNode
    audioCtx!: AudioContext
    source!: AbstractSoundSource

    constructor(){}

    async init(context: Node3DContext, gui: SpeakerN3DGUI){
        const {tools:{AudioN3DConnectable}, audioCtx, audioEngine} = context

        gui.doShowFalloff(true)

        this.audioCtx = audioCtx

        context.addToBoundingBox(gui.speaker)
        const node = this.node = audioCtx.createGain()
        const source = this.source = await audioEngine.createSoundSourceAsync("speaker", node, {
            spatialMaxDistance: 25
        })
        source.spatial.attach(gui.root)

        context.createConnectable(new AudioN3DConnectable.Input("audioInput", [gui.audioInput], "Destination", node))

        return this
    }

    

    async setState(_1: string, _2: any){ }

    async getState(_1: string){ }

    getStateKeys(): string[] { return [] }
    
    async dispose(){
        this.source.dispose()
    }

}


export const SpeakerN3DFactory: Node3DFactory<SpeakerN3DGUI,SpeakerN3D> = {

    label: "Audio Output",

    description: "A simple 3D speaker that can be used to output audio in 3D space.",

    tags: ["speaker", "audio", "consumer", "audio_output"],

    createGUI: async (context) =>{
        const it = new SpeakerN3DGUI()
        await it.init(context)
        return it
    },

    create: async (context, gui) => await (new SpeakerN3D()).init(context,gui),

}