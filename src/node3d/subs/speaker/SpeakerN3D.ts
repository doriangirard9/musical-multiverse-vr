import { AbstractMesh, Vector3, type Mesh, type TransformNode } from "@babylonjs/core";
import { Node3D, Node3DFactory, Node3DGUI } from "../../Node3D";
import { Node3DContext } from "../../Node3DContext";
import { Node3DGUIContext } from "../../Node3DGUIContext";
import { AbstractSoundSource } from "@babylonjs/core/AudioV2/abstractAudio/abstractSoundSource";


const USE_AUDIO_ENGINE = false

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
            spatialMaxDistance: 25,
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

export class SpeakerPannerNodeN3D implements Node3D{

    node!: AudioNode
    audioCtx!: AudioContext
    interval: any
    pannerNode!: PannerNode
    analyserNode!: AnalyserNode

    constructor(){}

    async init(context: Node3DContext, gui: SpeakerN3DGUI){
        const {tools:{AudioN3DConnectable}, audioCtx} = context

        gui.doShowFalloff(true)

        this.audioCtx = audioCtx

        context.addToBoundingBox(gui.speaker)

        const pannerNode = this.pannerNode = audioCtx.createPanner()
        
        // Configuration du PannerNode pour une spatialisation correcte en VR
        pannerNode.panningModel = 'HRTF'
        pannerNode.distanceModel = 'exponential'
        pannerNode.refDistance = 5 // Distance de référence pour réduire le volume
        pannerNode.maxDistance = 200 // Distance maximale à laquelle le son sera réduit, passé cette distance le son ne sera pas réduit
        pannerNode.rolloffFactor = 3 // Vitesse de décroissance du volume en fonction de la distance

        const analyserNode = this.analyserNode = audioCtx.createAnalyser()
        const data = new Uint8Array(analyserNode.frequencyBinCount)
        analyserNode.fftSize = 32

        pannerNode.connect(analyserNode)
        analyserNode.connect(audioCtx.destination)

        let speed = 0
        let prev = 0
        // TODO: audioCtx.listener ne devrait pas être changé par un Node3d car c'est un paramètre général
        // Il faut déplacer ça dehors.
        this.interval = setInterval(() => {

            // Son 3D
            const output_transform = context.getPosition()
            const output_forward = Vector3.Forward().applyRotationQuaternionInPlace(output_transform.rotation)

            for(const [parameter, value] of [
                [this.pannerNode.positionX, output_transform.position.x],
                [this.pannerNode.positionY, output_transform.position.y],
                [this.pannerNode.positionZ, -output_transform.position.z],

                [this.pannerNode.orientationX, output_forward.x],
                [this.pannerNode.orientationY, output_forward.y],
                [this.pannerNode.orientationZ, -output_forward.z],
            ] as [AudioParam,number][]){
                // setTargetAtTime change le paramètre de manière progressive et évite les "pop"
                parameter.setTargetAtTime(value, audioCtx.currentTime, (50/1000)*.9)
            }

            // Effet visuel
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

        context.createConnectable(new AudioN3DConnectable.Input("audioInput", [gui.audioInput], "Destination", pannerNode))

        return this
    }

    

    async setState(_1: string, _2: any){ }

    async getState(_1: string){ }

    getStateKeys(): string[] { return [] }
    
    async dispose(){
        this.pannerNode.disconnect(this.analyserNode)
        this.analyserNode.disconnect(this.audioCtx.destination)
        clearInterval(this.interval)
    }

}


export const SpeakerN3DFactory: Node3DFactory<SpeakerN3DGUI,Node3D> = {

    label: "Audio Output",

    description: "A simple 3D speaker that can be used to output audio in 3D space.",

    tags: ["speaker", "audio", "consumer", "audio_output"],

    createGUI: async (context) =>{
        const it = new SpeakerN3DGUI()
        await it.init(context)
        return it
    },

    create: async (context, gui) => await (new (USE_AUDIO_ENGINE ? SpeakerN3D: SpeakerPannerNodeN3D)()).init(context,gui),

}