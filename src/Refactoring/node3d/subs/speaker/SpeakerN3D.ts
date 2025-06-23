import { AbstractMesh, Vector3, type Mesh, type TransformNode } from "@babylonjs/core";
import { Node3D, Node3DFactory, Node3DGUI } from "../../Node3D";
import { Node3DContext } from "../../Node3DContext";
import { Node3DGUIContext } from "../../Node3DGUIContext";

const SPEAKER_URL = (await import("./speaker.glb?url")).default


export class SpeakerN3DGUI implements Node3DGUI{
    
    audioInput!: Mesh
    speaker!: AbstractMesh
    root!: TransformNode

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
    }

    async dispose(){ }
}


export class SpeakerN3D implements Node3D{

    pannerNode
    audioCtx
    interval

    constructor(context: Node3DContext, gui: SpeakerN3DGUI){
        const {tools:{AudioN3DConnectable}, audioCtx} = context

        this.audioCtx = audioCtx

        context.addToBoundingBox(gui.speaker)
        const pannerNode = this.pannerNode = audioCtx.createPanner()

        // Configuration du PannerNode pour une spatialisation correcte en VR
        pannerNode.panningModel = 'HRTF'
        pannerNode.distanceModel = 'inverse'
        pannerNode.refDistance = 1 // Distance de référence pour réduire le volume
        pannerNode.maxDistance = 100 // Distance maximale à laquelle le son sera réduit, passé cette distance le son ne sera pas réduit
        pannerNode.rolloffFactor = 0.5 // Vitesse de décroissance du volume en fonction de la distance

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

        pannerNode.connect(audioCtx.destination)

        context.createConnectable(new AudioN3DConnectable.Input("audioInput", [gui.audioInput],"Destination",pannerNode))

    }

    async setState(_1: string, _2: any){ }

    async getState(_1: string){ }

    getStateKeys(): string[] { return [] }
    
    async dispose(){
        this.pannerNode.disconnect(this.audioCtx.destination)
        clearInterval(this.interval)
    }

}


export const SpeakerN3DFactory: Node3DFactory<SpeakerN3DGUI,SpeakerN3D> = {

    label: "Audio Output",

    createGUI: async (context) =>{
        const it = new SpeakerN3DGUI()
        await it.init(context)
        return it
    },

    create: async (context, gui) => new SpeakerN3D(context,gui),

}