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

    constructor(){}

    async init(context: Node3DContext, gui: SpeakerN3DGUI){
        const {tools:{AudioN3DConnectable}, audioCtx, audioEngine} = context

        gui.doShowFalloff(true)

        this.audioCtx = audioCtx

        context.addToBoundingBox(gui.speaker)

        const pannerNode = this.pannerNode = audioCtx.createPanner()
        
        // Configuration du PannerNode pour une spatialisation correcte en VR
        pannerNode.panningModel = 'HRTF'
        pannerNode.distanceModel = 'inverse'
        pannerNode.refDistance = 1 // Distance de référence pour réduire le volume
        pannerNode.maxDistance = 100 // Distance maximale à laquelle le son sera réduit, passé cette distance le son ne sera pas réduit
        pannerNode.rolloffFactor = 0.5 // Vitesse de décroissance du volume en fonction de la distance

        pannerNode.connect(audioCtx.destination)

        // TODO: audioCtx.listener ne devrait pas être changé par un Node3d car c'est un paramètre général
        // Il faut déplacer ça dehors.
        this.interval = setInterval(() => {
            const output_transform = context.getPosition()
            const output_forward = Vector3.Forward().applyRotationQuaternionInPlace(output_transform.rotation)
            const player_transform = context.getPlayerPosition()
            const player_forward = Vector3.Forward().applyRotationQuaternionInPlace(player_transform.rotation)
            const player_up = Vector3.Up().applyRotationQuaternionInPlace(player_transform.rotation)

            for(const [parameter, value] of [
                [this.pannerNode.positionX, output_transform.position.x],
                [this.pannerNode.positionY, output_transform.position.y],
                [this.pannerNode.positionZ, -output_transform.position.z],

                [this.pannerNode.orientationX, output_forward.x],
                [this.pannerNode.orientationY, output_forward.y],
                [this.pannerNode.orientationZ, -output_forward.z],

                [audioCtx.listener.positionX, player_transform.position.x],
                [audioCtx.listener.positionY, player_transform.position.y],
                [audioCtx.listener.positionZ, -player_transform.position.z],

                [audioCtx.listener.forwardX, player_forward.x],
                [audioCtx.listener.forwardY, player_forward.y],
                [audioCtx.listener.forwardZ, -player_forward.z],

                [audioCtx.listener.upX, player_up.x],
                [audioCtx.listener.upY, player_up.y],
                [audioCtx.listener.upZ, -player_up.z],
            ] as [AudioParam,number][]){
                // setTargetAtTime change le paramètre de manière progressive et évite les "pop"
                parameter.setTargetAtTime(value, audioCtx.currentTime, 0.01)
            }
        },50)

        context.createConnectable(new AudioN3DConnectable.Input("audioInput", [gui.audioInput], "Destination", pannerNode))

        return this
    }

    

    async setState(_1: string, _2: any){ }

    async getState(_1: string){ }

    getStateKeys(): string[] { return [] }
    
    async dispose(){
        this.pannerNode.disconnect(this.audioCtx.destination)
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