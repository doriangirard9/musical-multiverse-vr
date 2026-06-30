import { AbstractMesh, Vector3, type Mesh, type TransformNode } from "@babylonjs/core";
import { Node3D, Node3DFactory, Node3DGUI } from "../../Node3D";
import { Node3DContext } from "../../Node3DContext";
import { Node3DGUIContext } from "../../Node3DGUIContext";


const SPEAKER_URL = (await import("./speaker.glb?url")).default

/*
    AJOUTER UN PARAM GAIN AVEC UN PARAMETRE CYLINDRE ROTATIF POUR GERER LE SON
    SPATIALISATION NE FONCTIONNE PLUS, PEUT ETRE PARAM BABYLON A AJOUTER ?
*/

export class SpeakerN3DGUI implements Node3DGUI{
    
    audioInput!: Mesh
    speaker!: AbstractMesh
    root!: TransformNode
    falloffSphere!: Mesh

    get worldSize(){ return 2 }

    constructor(){}

    async init(context: Node3DGUIContext){
        const {babylon:B, tools:{MeshUtils,ConnectableUtils}} = context

        this.root = new B.TransformNode("audio output root", context.scene)

        this.speaker = await B.ImportMeshAsync(SPEAKER_URL, context.scene) .then(it=>it.meshes[0])
        this.speaker.parent = this.root

        this.audioInput = ConnectableUtils.createInputMesh("test button", .7, context.scene)
        MeshUtils.setColor(this.audioInput, new B.Color4(0,1,0,1))
        this.audioInput.parent = this.root
        this.audioInput.position.set(-0.7,0,0)

        /* FallOff selon l'idée de michel, il veut que ça soit tout le temps visible,
           au départ je voulais afficher uniquement si on drag puis uniquement si on est a l'extérieur
           mais de ce qu'il ma dit en visio c'est plus un truc comme ça qu'il imagine
         */
        
        this.falloffSphere = B.CreateSphere("audio output falloff", {diameter:20}, context.scene)
        this.falloffSphere.setEnabled(false)
        const material = new B.StandardMaterial("falloffSphereMaterial", context.scene)
        material.diffuseColor = new B.Color3(1, 0, 0)
        material.alpha = 0.1 // transparence
        material.backFaceCulling = false // permet de garder la sphere visible si on est à l'intérieur
        this.falloffSphere.material = material // besoin de créé un autre mat sinon je ne peux pas accéder à BackfaceCulling
        this.falloffSphere.isPickable = false
        this.falloffSphere.parent = this.root

        this.root.onAfterWorldMatrixUpdateObservable.add(()=>{
            const absolute_scale = this.root.absoluteScaling
            this.falloffSphere.scaling.set(1/absolute_scale.x, 1/absolute_scale.y, 1/absolute_scale.z)
        })
        
    }

    doShowFalloff(shown: boolean){
        this.falloffSphere.setEnabled(shown)
    }

    async dispose(){ }
}

export class SpeakerPannerNodeN3D implements Node3D{

    node!: AudioNode
    audioCtx!: AudioContext
    interval: any
    emitter!: {pannerNode:PannerNode, dispose():void}
    analyserNode!: AnalyserNode

    constructor(){}

    async init(context: Node3DContext, gui: SpeakerN3DGUI){
        const {tools:{AudioN3DConnectable}, audioCtx} = context

        gui.doShowFalloff(true)

        this.audioCtx = audioCtx

        context.addToBoundingBox(gui.speaker)

        const output = this.emitter = context.createOutputNode(
            ()=>gui.root.absolutePosition,
            ()=>Vector3.Forward().applyRotationQuaternionInPlace(gui.root.absoluteRotationQuaternion)
        )
        output.pannerNode.refDistance = 10
        output.pannerNode.maxDistance = 12

        const analyserNode = this.analyserNode = audioCtx.createAnalyser()
        const data = new Uint8Array(analyserNode.frequencyBinCount)
        analyserNode.fftSize = 32

        analyserNode.connect(output.pannerNode)

        let speed = 0
        let prev = 0

        // Effet visuel
        this.interval = setInterval(() => {
            analyserNode.getByteFrequencyData(data)

            let volume = 0
            for(let j=0; j<data.length; j++) volume = Math.max(volume, data[j])
            let prevSpeed = speed
            speed = speed*.5 + (volume-prev)*.5
            prev = volume
            
            if(Math.sign(speed) !== Math.sign(prevSpeed) && speed > 2 && volume > 10){
                const red = (data[0]+data[1]+data[2])/3/255
                const green = (data[3]+data[4]+data[5])/3/255
                const blue = (data[6]+data[7]+data[8])/3/255
                context.sendSignal(gui.root.absolutePosition, (red-green-blue), (green-blue), blue)
            }

        },50)

        context.createConnectable(new AudioN3DConnectable.Input("audioInput", [gui.audioInput], "Destination", analyserNode))

        return this
    }

    

    async setState(_1: string, _2: any){ }

    async getState(_1: string){ }

    getStateKeys(): string[] { return [] }
    
    async dispose(){
        this.analyserNode.disconnect(this.emitter.pannerNode)
        this.emitter.dispose()
        clearInterval(this.interval)
    }

}


export const SpeakerN3DFactory: Node3DFactory<SpeakerN3DGUI,Node3D> = {

    label: "Speaker",

    description: "A simple 3D speaker that can be used to output audio in 3D space.",

    tags: ["speaker", "audio", "consumer", "audio_output"],

    createGUI: async (context) =>{
        const it = new SpeakerN3DGUI()
        await it.init(context)
        return it
    },

    create: async (context, gui) => await (new SpeakerPannerNodeN3D()).init(context,gui),

}