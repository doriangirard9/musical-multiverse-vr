import { AbstractMesh, Vector3, type Mesh, type Observer, type TransformNode } from "@babylonjs/core";
import { Node3D, Node3DFactory, Node3DGUI } from "../../Node3D";
import { Node3DContext } from "../../Node3DContext";
import { Node3DGUIContext } from "../../Node3DGUIContext";


const SPEAKER_URL = (await import("./speaker.glb?url")).default

/** Radius of the red sphere of a speaker of default size, in meters: outside it the speaker is silent */
const FALLOFF_RADIUS = 10

/** Distance under which a speaker of default size plays at full volume, in meters. From there to the edge of the sphere it fades out evenly. */
const FULL_VOLUME_DISTANCE = 1

/** Smallest relative change of size that updates the falloff, so tiny jitters while holding the speaker are ignored */
const RANGE_EPSILON = 0.01

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
        
        this.falloffSphere = B.CreateSphere("audio output falloff", {diameter:FALLOFF_RADIUS*2}, context.scene)
        this.falloffSphere.setEnabled(false)
        const material = new B.StandardMaterial("falloffSphereMaterial", context.scene)
        material.diffuseColor = new B.Color3(1, 0, 0)
        material.alpha = 0.1 // transparence
        material.backFaceCulling = false // permet de garder la sphere visible si on est à l'intérieur
        this.falloffSphere.material = material // besoin de créé un autre mat sinon je ne peux pas accéder à BackfaceCulling
        this.falloffSphere.isPickable = false
        this.falloffSphere.parent = this.root
    }

    /**
     * Size the sphere for a speaker of default size. It lives in the space of the speaker, so from
     * there it grows and shrinks with it, as the falloff does. Called once the root has its parent.
     */
    fitFalloffSphere(){
        const parent = this.root.parent as TransformNode|null
        this.falloffSphere.scaling.setAll(1/(parent?.scaling.x ?? 1))
    }

    /**
     * How much larger than its default size the speaker is. The parent of the root holds the default
     * size of the module, everything above it the size the user gave it.
     */
    rangeScale(): number {
        const parent = this.root.parent as TransformNode|null
        return parent ? this.root.absoluteScaling.x / parent.scaling.x : 1
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
    rangeObserver?: Observer<TransformNode>

    constructor(){}

    async init(context: Node3DContext, gui: SpeakerN3DGUI){
        const {tools:{AudioN3DConnectable}, audioCtx} = context

        gui.fitFalloffSphere()
        gui.doShowFalloff(true)

        this.audioCtx = audioCtx

        context.addToBoundingBox(gui.speaker)

        const output = this.emitter = context.createOutputNode(
            ()=>gui.root.absolutePosition,
            ()=>Vector3.Forward().applyRotationQuaternionInPlace(gui.root.absoluteRotationQuaternion)
        )
        // Linear falloff: full volume up to FULL_VOLUME_DISTANCE, then down to silence at the edge of the red sphere.
        // Both distances follow the size of the speaker, so the curve keeps its shape, only stretched.
        output.pannerNode.distanceModel = 'linear'
        output.pannerNode.rolloffFactor = 1
        let range = 0
        const updateRange = () => {
            const scale = gui.rangeScale()
            if (Math.abs(scale - range) <= range * RANGE_EPSILON) return
            range = scale
            output.pannerNode.refDistance = FULL_VOLUME_DISTANCE * scale
            output.pannerNode.maxDistance = FALLOFF_RADIUS * scale
        }
        updateRange()
        this.rangeObserver = gui.root.onAfterWorldMatrixUpdateObservable.add(updateRange)

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
        this.rangeObserver?.remove()
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