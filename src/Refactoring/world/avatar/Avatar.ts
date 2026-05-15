import { AbstractMesh, Color4, CreateCylinder, CreateIcoSphere, ImportMeshAsync, InstancedMesh, Mesh, Quaternion, Scene, TransformNode, Tuple, Vector3 } from "@babylonjs/core";
import avatarUrl from "./avatar.glb?url";
import { SyncSerializable } from "../../network/sync/SyncSerializable";
import { Synchronized } from "../../network/sync/Synchronized";
import { InputManager } from "../../xr/inputs/InputManager";
import { Doc } from "yjs";
import { SyncManager } from "../../network/sync/SyncManager";
import { PointerInput } from "../../xr/inputs/PointerInput";

/**
 * A player avatar visual.
 * The avatar is composed of a head, a body and two hands. Each part has a "closed" version for hand closing animation.
 * The avatar also has a label for the player's name.
 * The avatar is synchronizable.
 */
export class Avatar implements Synchronized{

    private root!: TransformNode
    private head!: AvaterPart
    private leftHand!: AvaterPart
    private rightHand!: AvaterPart
    private body!: AvaterPart
    private _rightPointer!: AvaterPointer
    private _leftPointer!: AvaterPointer


    constructor(
        readonly shared: AvaterShared
    ){}

    async initialize(){
        const models = await this.shared.getModel()
        const scene = models.parts.head.default.default.getScene()
        this.root = new TransformNode("avatarRoot", scene)

        this.head = new AvaterPart("head", models.parts.head)
        this.body = new AvaterPart("body", models.parts.body)
        this.leftHand = new AvaterPart("leftHand", models.parts.hand)
        this.rightHand = new AvaterPart("rightHand", models.parts.hand)

        for(let part of [this.head, this.leftHand, this.rightHand, this.body]){
            part.modify("root",it=>it.parent = this.root)
        }

        for(let hand of [this.leftHand, this.rightHand]){
            hand.modify("scale", it=>it.scaling = new Vector3(0.5,0.5,0.5))
        }

        this.head.modify("scale", it=>it.scaling = new Vector3(0.7,0.7,0.7))
        this.body.modify("scale", it=>it.scaling = new Vector3(.7,.7,.7))

        this._rightPointer = new AvaterPointer("right", models.pointer, models.pointerSphere)
        this._leftPointer = new AvaterPointer("left", models.pointer, models.pointerSphere)

        for(let pointer of [this._rightPointer, this._leftPointer]){
            pointer.instance.parent = this.root
            pointer.instanceSphere.parent = this.root
        }

        this.place_color(new Color4(1, 1, 1, 1))
    }

    // Visual Model : Local side only
    place_color(color: Color4){
        for(let part of [this.head, this.leftHand, this.rightHand, this.body]){
            part.modify("color", (mesh)=>mesh.instancedBuffers.color = color)
        }
        this._rightPointer.color = color
        this._leftPointer.color = color
    }

    place_name(name: string){
    }

    randomize_skin(){
        for(const part of [this.head, this.body, this.leftHand, this.rightHand]){
            for(const kind of part.getKinds()){
                if(kind=="default")continue
                const variants = [...part.getVariants(kind), "nothing"]
                const selected = variants[Math.floor(Math.random()*variants.length)]
                if(selected != "nothing") part.set(kind, selected)
            }
        }
    }

    // Setter
    get headPart(){ return this.head as any as "PART" }
    get leftHandPart(){ return this.leftHand as any as "PART" }
    get rightHandPart(){ return this.rightHand as any as "PART" }
    get bodyPart(){ return this.body as any as "PART" }

    place(part: "PART", position: Vector3, rotation: Quaternion){
        const partObj = part as any as AvaterPart
        partObj.place(position, rotation)
        this.set_state?.(`${partObj.name}_position`)
    }

    setShape(part: "PART", type: string, variant: string){
        const partObj = part as any as AvaterPart
        partObj.set(type, variant)
        this.set_state?.(`${partObj.name}_shape_${type}`)
    }


    get rightPointer(){ return this._rightPointer as any as "POINTER" }
    get leftPointer(){ return this._leftPointer as any as "POINTER" }

    placePointer(_pointer: "POINTER", from: Vector3, to: Vector3, doCollide: boolean){
        const pointer = _pointer as any as AvaterPointer
        pointer.place(from, to, doCollide)
        this.set_state?.(`${pointer.name}_pointer`)
    }


    private color = new Color4()

    getColor(){ return this.color }

    setColor(color: Color4){
        this.color.copyFrom(color)
        this.place_color(color)
        this.set_state?.("color")
    }

    private name = ""

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
    }

    // Sync
    private set_state?: (key: string) => void

    async initSync(id: string, set_state: (key: string) => void): Promise<void> {
        this.set_state = set_state
    }

    disposeSync(): void { this.set_state = undefined }

    askStates(): void {
        const askPart = (prefix: string, part: AvaterPart)=>{
            for(const kind of part.getKinds()) this.set_state?.(`${prefix}_shape_${kind}`)
            this.set_state?.(`${prefix}_position`)
        }
        askPart("head", this.head)
        askPart("leftHand", this.leftHand)
        askPart("rightHand", this.rightHand)
        askPart("body", this.body)
        this.set_state?.("leftHandClosed")
        this.set_state?.("rightHandClosed")
        this.set_state?.("body")
        this.set_state?.("color")
        this.set_state?.("name")
        this.set_state?.(`${this._leftPointer.name}_pointer`)
        this.set_state?.(`${this._rightPointer.name}_pointer`)
    }

    async setState(key: string, value: SyncSerializable): Promise<void> {
        const setPart = (prefix: string, part: AvaterPart, key: string, value: SyncSerializable)=>{
            if(key.startsWith(`${prefix}_shape_`)){
                const kind = key.substring(`${prefix}_shape_`.length)
                part.set(kind, value as string)
                return true
            }
            else if(key === `${prefix}_position`){
                const {position, rotation} = value as {position: Tuple<number,3>, rotation: Tuple<number,4>}
                part.place(new Vector3(...position), new Quaternion(...rotation))
                return true
            }
            else return false
        }

        if(setPart("head", this.head, key, value)){}
        else if(setPart("leftHand", this.leftHand, key, value)){}
        else if(setPart("rightHand", this.rightHand, key, value)){}
        else if(setPart("body", this.body, key, value)){}
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
        else if(key === `${this._leftPointer.name}_pointer`){
            const {from, to, doCollide} = value as {from: Tuple<number,3>, to: Tuple<number,3>, doCollide: boolean}
            this._leftPointer.place(new Vector3(...from), new Vector3(...to), doCollide)
        }
        else if(key === `${this._rightPointer.name}_pointer`){
            const {from, to, doCollide} = value as {from: Tuple<number,3>, to: Tuple<number,3>, doCollide: boolean}
            this._rightPointer.place(new Vector3(...from), new Vector3(...to), doCollide)
        }
    }

    async removeState(key: string): Promise<void> { }

    async getState(key: string): Promise<SyncSerializable> {
        function getPart(prefix: string, part: AvaterPart, key: string): SyncSerializable|null{
            if(key.startsWith(`${prefix}_shape_`)){
                const kind = key.substring(`${prefix}_shape_`.length)
                return part.getVariants(kind).find(variant=>part.instances[kind]?.variant === variant) ?? null
            }
            else if(key === `${prefix}_position`){
                return {
                    position: part.position.asArray(),
                    rotation: part.rotation.asArray(),
                }
            }
            else return null
        }
        { const result = getPart("head", this.head, key); if (result !== null) return result }
        { const result = getPart("leftHand", this.leftHand, key); if (result !== null) return result }
        { const result = getPart("rightHand", this.rightHand, key); if (result !== null) return result }
        { const result = getPart("body", this.body, key); if (result !== null) return result }
        if(key === "color") return [this.color.r, this.color.g, this.color.b, this.color.a]
        if(key === "name") return this.name 
        if(key === `${this._leftPointer.name}_pointer`) return {from: this._leftPointer.from.asArray(), to: this._leftPointer.to.asArray(), doCollide: this._leftPointer.doCollide}
        if(key === `${this._rightPointer.name}_pointer`) return {from: this._rightPointer.from.asArray(), to: this._rightPointer.to.asArray(), doCollide: this._rightPointer.doCollide}
        return null
    }

    public on_dispose?: () => void
    private disposed = false

    dispose(){
        if(this.disposed) return
        this.disposed = true

        this.on_dispose?.()

        this.head.dispose()
        this.leftHand.dispose()
        this.rightHand.dispose()
        this.body.dispose()
        this.root.dispose()
        this._leftPointer.dispose()
        this._rightPointer.dispose()
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

    registerInputs(inputs: InputManager){
        const placeHand = (hand: "PART", pointer: "POINTER", pt: PointerInput)=>{
            this.place(hand, pt.origin, Quaternion.FromRotationMatrix(pt.matrix.getRotationMatrix()))
            let target, doCollide
            if(pt.hit){
                target = pt.target
                doCollide = true
            }
            else{
                target = pt.forward.scale(5).addInPlace(pt.origin)
                doCollide = false
            }
            this.placePointer(pointer, pt.origin, target, doCollide)
        }
        inputs.left.pointer.onMove.add((pointer)=> placeHand(this.leftHandPart, this.leftPointer, pointer))
        inputs.right.pointer.onMove.add((pointer)=> placeHand(this.rightHandPart, this.rightPointer, pointer))

        inputs.head.onMove.add((pointer)=>{
            const headPos = pointer.origin
            const headRot = Quaternion.FromRotationMatrix(pointer.matrix.getRotationMatrix())
            this.place(this.headPart, headPos, headRot)

            const direction = pointer.forward.multiplyByFloats(1,0,1).normalize()
            const bodyPos = headPos.subtract(new Vector3(0,0.6,0))
            const bodyRot = Quaternion.FromLookDirectionLH(direction, Vector3.Up())
            this.place(this.bodyPart, bodyPos, bodyRot)
        })
        inputs.left.trigger.onDown.add(()=>this.setShape(this.leftHandPart, "default", "closed"))
        inputs.left.trigger.onUp.add(()=>this.setShape(this.leftHandPart, "default", "default"))
        inputs.right.trigger.onDown.add(()=>this.setShape(this.rightHandPart, "default", "closed"))
        inputs.right.trigger.onUp.add(()=>this.setShape(this.rightHandPart, "default", "default"))
    }
}

export class AvaterPart{

    private _position = new Vector3()
    private _rotation = new Quaternion()
    instances: Record<string, {mesh:InstancedMesh,variant:string}|null> = {}
    private modifiers: Record<string, (mesh:InstancedMesh)=>void> = {}

    constructor(readonly name: string, private model: Record<string, Record<string, Mesh>>){
        const scene = model.default.default.getScene()
        this.set("default", "default")
    }

    set(type: string, variant: string){
        if(this.instances[type] && this.instances[type].variant === variant) return

        if(this.instances[type]){
            this.instances[type].mesh.dispose()
            delete this.instances[type]
        }
        
        if(this.model[type][variant]){
            const new_instance = this.model[type][variant].createInstance(`part ${type} ${variant}`)
            new_instance.parent = null
            new_instance.resetLocalMatrix()
            new_instance.isPickable = false
            new_instance.checkCollisions = false
            new_instance.isVisible = true
            new_instance.position.copyFrom(this.position)
            new_instance.rotationQuaternion = this.rotation.multiply(Quaternion.FromEulerAngles(0, -Math.PI/2, 0))
            for(const modifier of Object.values(this.modifiers)) modifier(new_instance)
            this.instances[type] = {mesh: new_instance, variant}
        }
    }

    place(position: Vector3, rotation: Quaternion){
        this._position.copyFrom(position)
        this._rotation.copyFrom(rotation)
        for(const entry of Object.values(this.instances)){
            if(entry){
                entry.mesh.position = position
                entry.mesh.rotationQuaternion = rotation.multiply(Quaternion.FromEulerAngles(0, -Math.PI/2, 0))
            }
        }
    }
    
    get position(){ return this._position }

    get rotation(){ return this._rotation }

    modify(name: string, modifier: (mesh: InstancedMesh)=>void){
        for(const entry of Object.values(this.instances)){
            modifier(entry!.mesh)
        }
        this.modifiers[name] = modifier
    }

    getKinds(){
        return Object.keys(this.model)
    }
    
    getVariants(kind: string){
        return Object.keys(this.model[kind]??{})
    }

    dispose(){
        for(const entry of Object.values(this.instances)){
            entry?.mesh.dispose()
        }
    }
    
}

export class AvaterPointer{

    instance
    instanceSphere

    constructor(readonly name: string, readonly pointer: Mesh, readonly pointerSphere: Mesh){
        this.instance = pointer.createInstance(name+" avatar pointer instance")
        this.instance.checkCollisions = false
        this.instance.isPickable = false

        this.instanceSphere = pointerSphere.createInstance(name+" avatar pointer sphere instance")
        this.instanceSphere.checkCollisions = false
        this.instanceSphere.isPickable = false
        this.instanceSphere.isVisible = false
    }

    set color(color: Color4){
        this.instance.instancedBuffers.color = color
        this.instanceSphere.instancedBuffers.color = color
    }

    from = new Vector3()
    to = new Vector3()
    doCollide = false

    place(from: Vector3, to: Vector3, doCollide: boolean){
        this.from.copyFrom(from)
        this.to.copyFrom(to)
        this.doCollide = doCollide

        const center = from.add(to).scaleInPlace(0.5)
        const length = Vector3.Distance(from, to)/2
        const rotation = Quaternion.FromUnitVectorsToRef(Vector3.Up(), to.subtract(from).normalize(), new Quaternion()) 

        this.instance.position = center
        this.instance.rotationQuaternion = rotation
        this.instance.scaling = new Vector3(0.01, length, 0.01)

        if(doCollide){
            this.instanceSphere.position = to
            this.instanceSphere.rotationQuaternion = rotation
            this.instanceSphere.scaling = new Vector3(0.02, 0.02, 0.02)
            this.instanceSphere.isVisible = true
        }
        else this.instanceSphere.isVisible = false
        
    }

    dispose(){
        this.instance.dispose()
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

        // Body parts
        const parts = {} as {
            [referencial: string]:{
                [type: string]:{
                    [variant: string]: Mesh
                }
            }
        }

        const to_dispose: AbstractMesh[] = []
        for(const mesh of result.meshes){
            if(mesh instanceof Mesh && mesh.name.match(/[^_]+_[^_]+_[^_]+/i)){
                // Prepare
                mesh.isVisible = false
                mesh.registerInstancedBuffer("color", 4)
                mesh.instancedBuffers.color = new Color4(1, 1, 1, 1)
                mesh.parent = null
                mesh.resetLocalMatrix()
                
                // Get name
                const [part, type, variant] = mesh.name.split("_")
                parts[part] ??= {}
                parts[part][type] ??= {}
                parts[part][type][variant] = mesh
            }
            else{
                to_dispose.push(mesh)
            }
        }
        for(const mesh of to_dispose) mesh.dispose()

        const pointer = CreateCylinder("avatar pointer model", {diameterTop:0}, this.scene)
        pointer.isVisible = false
        pointer.registerInstancedBuffer("color", 4)
        pointer.instancedBuffers.color = new Color4(1, 1, 1, 1)

        const pointerSphere = CreateIcoSphere("avatar pointer sphere model", {radius:1}, this.scene)
        pointerSphere.isVisible = false
        pointerSphere.visibility = .5
        pointerSphere.registerInstancedBuffer("color", 4)
        pointerSphere.instancedBuffers.color = new Color4(1, 1, 1, 1)

        return {parts, result, pointer, pointerSphere}
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