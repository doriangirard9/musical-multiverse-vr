import { Color4, ImportMeshAsync, InstancedMesh, Mesh, Node, Quaternion, Scene, TransformNode, Tuple, Vector3 } from "@babylonjs/core";
import avatarUrl from "./avatar.glb?url";
import { SyncSerializable } from "../../network/sync/SyncSerializable";
import { Synchronized } from "../../network/sync/Synchronized";
import { InputManager } from "../../xr/inputs/InputManager";
import { Doc } from "yjs";
import { SyncManager } from "../../network/sync/SyncManager";
import { N3DText } from "../../node3d/instance/utils/N3DText";

/**
 * A player avatar visual.
 * The avatar is composed of a head, a body and two hands. Each part has a "closed" version for hand closing animation.
 * The avatar also has a label for the player's name.
 * The avatar is synchronizable.
 */
export class Avatar implements Synchronized{

    root!: TransformNode
    head!: InstancedMesh
    leftHand!: InstancedMesh
    rightHand!: InstancedMesh
    leftHandClosed!: InstancedMesh
    rightHandClosed!: InstancedMesh
    body!: InstancedMesh
    label!: N3DText


    constructor(
        readonly shared: AvaterShared
    ){}

    async initialize(){
        const models = await this.shared.getModel()
        this.root = new TransformNode("avatarRoot", models.hand.getScene())
        this.head = models.head.createInstance("head")
        this.leftHand = models.hand.createInstance("lefthand")
        this.rightHand = models.hand.createInstance("righthand")
        this.leftHandClosed = models.hand_closed.createInstance("lefthand_closed")
        this.rightHandClosed = models.hand_closed.createInstance("righthand_closed")
        this.body = models.body.createInstance("body")
        this.place_color(new Color4(1, 1, 1, 1))
        this.place_leftClosed(false)
        this.place_rightClosed(false)

        this.label = new N3DText(
            "avatar name",
            [this.head],
            this.head.getScene()
        )
        this.label.show()

        for(let mesh of [this.head, this.leftHand, this.rightHand, this.body, this.leftHandClosed, this.rightHandClosed]){
            mesh.isPickable = false
            mesh.checkCollisions = false
            mesh.parent = this.root
        }
    }

    // Visual Model : Local side only
    place_color(color: Color4){
        for(let mesh of [
            this.head,
            this.leftHand,
            this.rightHand,
            this.body,
            this.leftHandClosed,
            this.rightHandClosed,
        ]){
            mesh.instancedBuffers.color = color
        }
    }

    place_head(position: Vector3, rotation: Quaternion){
        this.head.position = position
        this.head.rotationQuaternion = rotation
            .multiply(Quaternion.FromEulerAngles(0, -Math.PI/2, 0))
        this.label.updatePosition()
    }

    place_body(position: Vector3, rotation: Quaternion){
        this.body.position = position
        this.body.rotationQuaternion = rotation
            .multiply(Quaternion.FromEulerAngles(0, -Math.PI/2, 0))
    }

    place_leftHand(position: Vector3, rotation: Quaternion){
        this.leftHand.position = position
        this.leftHand.rotationQuaternion = rotation
            .multiply(Quaternion.FromEulerAngles(0, -Math.PI/2, 0))
        this.leftHand.scaling.setAll(.5)
        
        this.leftHandClosed.position.copyFrom(position)
        this.leftHandClosed.rotationQuaternion = this.leftHand.rotationQuaternion
        this.leftHandClosed.scaling.copyFrom(this.leftHand.scaling)
    }

    place_rightHand(position: Vector3, rotation: Quaternion){
        this.rightHand.position = position
        this.rightHand.rotationQuaternion = rotation
            .multiply(Quaternion.FromEulerAngles(0, -Math.PI/2, 0))
        this.rightHand.scaling.setAll(.5)

        this.rightHandClosed.position.copyFrom(position)
        this.rightHandClosed.rotationQuaternion = this.rightHand.rotationQuaternion
        this.rightHandClosed.scaling.copyFrom(this.rightHand.scaling)
    }

    place_leftClosed(closed: boolean){
        this.leftHand.isVisible = !closed
        this.leftHandClosed.isVisible = closed
    }

    place_rightClosed(closed: boolean){
        this.rightHand.isVisible = !closed
        this.rightHandClosed.isVisible = closed
    }

    place_name(name: string){
        this.label.set(name)
    }

    // Data
    private _headPos = new Vector3()
    private _headRot = new Quaternion()

    private _leftHandPos = new Vector3()
    private _leftHandRot = new Quaternion()
    private _leftHandClosed = false

    private _rightHandPos = new Vector3()
    private _rightHandRot = new Quaternion()
    private _rightHandClosed = false

    private _bodyPos = new Vector3()
    private _bodyRot = new Quaternion()

    private color = new Color4()

    private name = ""

    setHeadPosition(position: Vector3, rotation: Quaternion){
        this._headPos.copyFrom(position)
        this._headRot.copyFrom(rotation)
        this.place_head(position, rotation)
        this.set_state?.("head")
    }

    setLeftHandPosition(position: Vector3, rotation: Quaternion){
        this._leftHandPos.copyFrom(position)
        this._leftHandRot.copyFrom(rotation)
        this.place_leftHand(position, rotation)
        this.set_state?.("leftHand")
    }

    setRightHandPosition(position: Vector3, rotation: Quaternion){
        this._rightHandPos.copyFrom(position)
        this._rightHandRot.copyFrom(rotation)
        this.place_rightHand(position, rotation)
        this.set_state?.("rightHand")
    }

    setBodyPosition(position: Vector3, rotation: Quaternion){
        this._bodyPos.copyFrom(position)
        this._bodyRot.copyFrom(rotation)
        this.place_body(position, rotation)
        this.set_state?.("body")
    }

    setLeftHandClosed(closed: boolean){
        this._leftHandClosed = closed
        this.place_leftClosed(closed)
        this.set_state?.("leftHandClosed")
    }

    setRightHandClosed(closed: boolean){
        this._rightHandClosed = closed
        this.place_rightClosed(closed)
        this.set_state?.("rightHandClosed")
    }
    

    setColor(color: Color4){
        this.color.copyFrom(color)
        this.place_color(color)
        this.set_state?.("color")
    }

    getColor(){
        return this.color
    }

    setName(name: string){
        this.name = name
        this.place_name(name)
        this.set_state?.("name")
    }

    getName(){
        return this.name
    }

    // Register to inputs
    setVisible(visible: boolean){
        this.root.setEnabled(visible)
        if(visible) this.label.show()
        else this.label.hide()
    }

    registerInputs(inputs: InputManager){
        inputs.left.pointer.onMove.add((pointer)=>{
            this.setLeftHandPosition(pointer.origin, Quaternion.FromRotationMatrix(pointer.matrix.getRotationMatrix()))
        })
        inputs.right.pointer.onMove.add((pointer)=>{
            this.setRightHandPosition(pointer.origin, Quaternion.FromRotationMatrix(pointer.matrix.getRotationMatrix()))
        })
        inputs.head.onMove.add((pointer)=>{
            const headPos = pointer.origin
            const headRot = Quaternion.FromRotationMatrix(pointer.matrix.getRotationMatrix())
            this.setHeadPosition(headPos, headRot)

            const direction = pointer.forward.multiplyByFloats(1,0,1).normalize()
            const bodyPos = headPos.subtract(new Vector3(0,0.9,0))
            const bodyRot = Quaternion.FromLookDirectionLH(direction, Vector3.Up())
            this.setBodyPosition(bodyPos, bodyRot)
        })
        inputs.left.trigger.onDown.add(()=>this.setLeftHandClosed(true))
        inputs.left.trigger.onUp.add(()=>this.setLeftHandClosed(false))
        inputs.right.trigger.onDown.add(()=>this.setRightHandClosed(true))
        inputs.right.trigger.onUp.add(()=>this.setRightHandClosed(false))
    }

    // Sync
    private set_state?: (key: string) => void

    async initSync(id: string, set_state: (key: string) => void): Promise<void> {
        this.set_state = set_state
    }

    disposeSync(): void { this.set_state = undefined }

    askStates(): void {
        this.set_state?.("head")
        this.set_state?.("leftHand")
        this.set_state?.("rightHand")
        this.set_state?.("leftHandClosed")
        this.set_state?.("rightHandClosed")
        this.set_state?.("body")
        this.set_state?.("color")
        this.set_state?.("name")
    }

    async setState(key: string, value: SyncSerializable): Promise<void> {
        if(key === "head"){
            const {position, rotation} = value as {position: Tuple<number,3>, rotation: Tuple<number,4>}
            this._headPos.copyFrom(new Vector3(...position))
            this._headRot.copyFrom(new Quaternion(...rotation))
            this.place_head(this._headPos, this._headRot)
        }
        else if(key === "leftHand"){
            const {position, rotation} = value as {position: Tuple<number,3>, rotation: Tuple<number,4>}
            this._leftHandPos.copyFrom(new Vector3(...position))
            this._leftHandRot.copyFrom(new Quaternion(...rotation))
            this.place_leftHand(this._leftHandPos, this._leftHandRot)
        }
        else if(key === "rightHand"){
            const {position, rotation} = value as {position: Tuple<number,3>, rotation: Tuple<number,4>}
            this._rightHandPos.copyFrom(new Vector3(...position))
            this._rightHandRot.copyFrom(new Quaternion(...rotation))
            this.place_rightHand(this._rightHandPos, this._rightHandRot)
        }
        else if(key === "body"){
            const {position, rotation} = value as {position: Tuple<number,3>, rotation: Tuple<number,4>}
            this._bodyPos.copyFrom(new Vector3(...position))
            this._bodyRot.copyFrom(new Quaternion(...rotation))
            this.place_body(this._bodyPos, this._bodyRot)
        }
        else if(key === "color"){
            const color = value as Tuple<number,4>
            this.color.copyFrom(new Color4(...color))
            this.place_color(this.color)
        }
        else if(key === "name"){
            const name = value as string
            this.name = name
            this.place_name(name)
        }
        else if(key === "leftHandClosed"){
            const closed = value as boolean
            this._leftHandClosed = closed
            this.place_leftClosed(closed)
        }
        else if(key === "rightHandClosed"){
            const closed = value as boolean
            this._rightHandClosed = closed
            this.place_rightClosed(closed)
        }
    }

    async removeState(key: string): Promise<void> { }

    async getState(key: string): Promise<SyncSerializable> {
        if(key === "head"){
            return {
                position: [this._headPos.x, this._headPos.y, this._headPos.z],
                rotation: [this._headRot.x, this._headRot.y, this._headRot.z, this._headRot.w]
            }
        }
        else if(key === "leftHand"){
            return {
                position: [this._leftHandPos.x, this._leftHandPos.y, this._leftHandPos.z],
                rotation: [this._leftHandRot.x, this._leftHandRot.y, this._leftHandRot.z, this._leftHandRot.w]
            }
        }
        else if(key === "rightHand"){
            return {
                position: [this._rightHandPos.x, this._rightHandPos.y, this._rightHandPos.z],
                rotation: [this._rightHandRot.x, this._rightHandRot.y, this._rightHandRot.z, this._rightHandRot.w]
            }
        }
        else if(key === "body"){
            return {
                position: [this._bodyPos.x, this._bodyPos.y, this._bodyPos.z],
                rotation: [this._bodyRot.x, this._bodyRot.y, this._bodyRot.z, this._bodyRot.w]
            }
        }
        else if(key === "color"){
            return [this.color.r, this.color.g, this.color.b, this.color.a]
        }
        else if(key === "name"){
            return this.name
        }
        else if(key === "leftHandClosed"){
            return this._leftHandClosed
        }
        else if(key === "rightHandClosed"){
            return this._rightHandClosed
        }
        else return null
    }

    public on_dispose?: () => void
    private disposed = false

    dispose(){
        if(this.disposed) return
        this.disposed = true

        this.on_dispose?.()

        this.head.dispose()
        this.leftHand.dispose()
        this.leftHandClosed.dispose()
        this.rightHand.dispose()
        this.rightHandClosed.dispose()
        this.body.dispose()
        this.label.dispose()
        this.root.dispose()
    }

    static getSyncManager(
        doc: Doc,
        shared: AvaterShared,
        onAdd?: (instance:Avatar)=>void,
        onRemove?: (instance:Avatar)=>void,
    ) {
        const syncmanager: SyncManager<Avatar> = new SyncManager({
            name: "avatars",
            doc,
            async on_add(instance) {
                instance.on_dispose = () => syncmanager.remove(instance)
                onAdd?.(instance)
            },
            async create(_, __) {
                const avatar = new Avatar(shared)
                await avatar.initialize()
                return avatar
            },
            async on_remove(instance) {
                onRemove?.(instance)
                instance.dispose()
            },
        })
        return syncmanager
    }
}

export class AvaterShared{

    private model

    constructor(
        readonly scene: Scene
    ){
        this.model = this.fetchModel()
    }

    private async fetchModel(){
        const result = await ImportMeshAsync(avatarUrl, this.scene)
        const head = (result.meshes.find(it=>it.name === "head") as Mesh)
        const hand = (result.meshes.find(it=>it.name === "hand") as Mesh)
        const hand_closed = (result.meshes.find(it=>it.name === "hand_closed") as Mesh)
        const body = (result.meshes.find(it=>it.name === "body") as Mesh)

        for(let mesh of [head, hand, hand_closed, body]){
            mesh.isVisible = false
            mesh.registerInstancedBuffer("color", 4)
            mesh.parent = null
            mesh.resetLocalMatrix()
        }

        return {head, hand, hand_closed, body, result}
    }

    async getModel(){
        return await this.model
    }

    async dispose(){
        const model = await this.model
        model.result.meshes.forEach(it=>it.dispose())
        model.result.transformNodes.forEach(it=>it.dispose())
    }

}