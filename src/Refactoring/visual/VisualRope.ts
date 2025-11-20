import { CreateCylinder, InstancedMesh, Mesh, Quaternion, TransformNode, Vector3 } from "@babylonjs/core";


export interface VisualRopeInfo{

    /** The model mesh for the start segment */
    startSegment?: Mesh

    /** The model meshes for the middle segments */
    segments: Mesh[]
    
    /** The model mesh for the end segment */
    endSegment?: Mesh

    /** Segment length */
    length: number

    /** Transformation interval or undefined if no animation */
    interval?: number
    
    /** The rope rotation transformations */
    rotationTransformation?: Vector3

    /** The rope translation transformations */
    translationTransformation?: Vector3

    /** The rope gravity strength */
    gravity?: number
}

/**
 * A visual rope made of multiple instances of a mesh.
 * With some animations utilities to make lightning like effects.
 */
export class VisualRope {

    /**
     * 
     * @param name 
     * @param info The description of the visual rope style
     * @param onInstance a function called on each instance
     */
    constructor(
        private name: string,
        private info: VisualRopeInfo,
        private onInstance?: (instance:InstancedMesh)=>void
    ){

        // Start the animation
        if(this.info.interval!=undefined){
            this.intFn = setInterval(()=>{
                for(let instance of this.instances){
                    if(this.info.rotationTransformation){
                        instance.rotation.set(
                            this.info.rotationTransformation.x * Math.PI*2*Math.random(),
                            this.info.rotationTransformation.y * Math.PI*2*Math.random(),
                            this.info.rotationTransformation.z * Math.PI*2*Math.random(),
                        )
                    }
                    if(this.info.translationTransformation){
                        instance.position.set(
                            this.info.translationTransformation.x * (Math.random()*2-1),
                            this.info.translationTransformation.y * (Math.random()*2-1),
                            this.info.translationTransformation.z * (Math.random()*2-1),
                        )
                    }
                }
            },this.info.interval)
        }
    }

    private _tempVec = new Vector3();

    private move(target: TransformNode, from: Vector3, to: Vector3){

        // Set center
        this._tempVec
            .copyFrom(from)
            .addInPlace(to)
            .scaleInPlace(.5)
        target.position.copyFrom(this._tempVec)

        // Direction vector
        this._tempVec
            .copyFrom(to)
            .subtractInPlace(from)

        // Set length
        var length = this._tempVec.length()
        target.scaling.y = length

        // Set Rotation
        target.rotationQuaternion ??= new Quaternion()
        Quaternion.FromUnitVectorsToRef(Vector3.UpReadOnly, this._tempVec.normalize(), target.rotationQuaternion)    
    }

    private _fromTemp = new Vector3()

    private _toTemp = new Vector3()

    private _directionTemp = new Vector3()

    private instances = [] as InstancedMesh[]
    private transforms = [] as TransformNode[]

    /**
     * Set the starting and eding points
     * @param from Starting point
     * @param to Ending point
     */
    set(from: Vector3, to: Vector3){
        // Get length and direction
        let total_length = this._directionTemp.copyFrom(to).subtractInPlace(from).length()
        let total_count = Math.max(1, Math.round(total_length/this.info.length))
        this._directionTemp.normalize()

        // Destroy and instanciate
        if(total_count>this.instances.length){
            let n = total_count-this.instances.length
            for(let i=0; i<n; i++){
                // Get the model
                let model: Mesh
                if(this.info.startSegment && this.instances.length==0){
                    model = this.info.startSegment
                }
                else if(this.info.endSegment && this.instances.length==total_count-1){
                    model = this.info.endSegment
                }
                else{
                    model = this.info.segments[this.instances.length%this.info.segments.length]
                }

                // Create the instance
                let instance = new InstancedMesh(`${this.name}_part`,model)
                let transform = new TransformNode(`${this.name}_part_transform`)
                this.instances.push(instance)
                this.transforms.push(transform)
                instance.parent = transform
                instance.position.setAll(0)
                instance.rotation.setAll(0)
                instance.rotationQuaternion = null
                instance.scaling.setAll(1)
                this.onInstance?.(instance)
            }
        }
        else if(this.instances.length>total_count){
            let n = this.instances.length-total_count
            for(let i=0; i<n; i++){
                this.instances.pop()!!.dispose()
                this.transforms.pop()!!.dispose()
            }
        }

        // Place instances
        let current = 0
        this._fromTemp.copyFrom(from)
        for(let transform of this.transforms){
            let added = Math.min(this.info.length, total_length-current)
            let advancement = Math.sin((current+added)/total_length*Math.PI)
            this._toTemp
                .copyFrom(this._directionTemp)
                .scaleInPlace(current+added)
                .addInPlace(from)
            if(this.info.gravity){
                this._toTemp.addInPlaceFromFloats(0,this.info.gravity*advancement,0)
            }
            this.move(transform, this._fromTemp, this._toTemp)
            this._fromTemp.copyFrom(this._toTemp)
            current += added
        }
    }

    private intFn?: any

    dispose(){
        if(this.intFn) clearInterval(this.intFn)
        for(let instance of this.instances) instance.dispose()
        this.instances.length = 0
    }

    /** A Lightning looking rope */
    static Lightning = class Lightning implements VisualRopeInfo{

        segments = (()=>{
            let a = CreateCylinder("tube",{diameter:.1,height:.55, tessellation:5})
            a.position.set(.1,.25,0)
            a.rotation.z = 0.3
            let b = CreateCylinder("tube",{diameter:.1,height:.55, tessellation:5})
            b.position.set(.1,-.25,0)
            b.rotation.z = -0.3
            let mesh = Mesh.MergeMeshes([a,b], true, false, undefined, false, false)!!
            mesh.setEnabled(false)
            return [mesh]
        })()

        length = 1

        interval = 150

        gravity = .5

        rotationTransformation = new Vector3(0,1,0)

        dispose(){
            this.segments[0].dispose()
        }
    }

}