import { AbstractMesh, Color3, Engine, Mesh, Quaternion, TransformNode, Vector3 } from "@babylonjs/core";
import { Node3D, Node3DFactory, Node3DGUI } from "../../Node3D";
import { Node3DContext } from "../../Node3DContext";
import { Node3DGUIContext } from "../../Node3DGUIContext";
import MODEL_URL from "./controller.glb?url"

const MAX_PARTICLES = 50
const PARTICLE_STATE_SIZE = 3+3+1

/**
 * The settings of the particle emitter.
 */
interface ParticleEmitterSettings{
    /* 1 - 30 : Number of particle per seconds*/
    rate: number 
    /* 0.1 - 10 : Lifetime of each particle in seconds */
    lifetime: number
    /* 0 - 1 : Initial speed of the particles */
    force: number
    /* -1 - 1 : Effect of gravity on the particles (negative=rise, positive=fall) */
    weight: number
    /* 0 - 1 : Effect of inter-particle attraction/repulsion (negative=repulsion, positive=attraction) */
    cohesion: number
    /* 0 - 360: Color of the particles (HSL hue in degrees) */
    hue: number
    /* 0 - 1 : Motion pattern of the particles */
    motion: "straight" | "accelerate" | "decelerate" | "spiral" | "wander" | "sinusoidal"
}

export class ParticleEmitterN3DGui implements Node3DGUI{

    root!: TransformNode
    body!: AbstractMesh
    emitter!: Mesh
    particle!: Mesh

    rateSlider!: AbstractMesh
    lifetimeSlider!: AbstractMesh
    forceSlider!: AbstractMesh
    weightSlider!: AbstractMesh
    cohesionSlider!: AbstractMesh
    hueSlider!: AbstractMesh
    motionSlider!: AbstractMesh


    get worldSize(){ return 1 }

    constructor(private context: Node3DGUIContext){}

    async initialize(){
        const {babylon:B, tools:T, scene} = this.context
        const gui = this

        this.root = new B.TransformNode("ParticleEmitterN3DGUI_root", scene)

        // Fetch the model and separate
        const model = await B.ImportMeshAsync(MODEL_URL, scene)

        const root = model.meshes.find(m=>m.name=="__root__")!!
        const body = this.body = model.meshes.find(m=>m.name=="body")!!
        const buttons = model.meshes.filter(m=>m.name.startsWith("Button")).sort()
        const emitter = this.emitter = model.meshes.find(m=>m.name=="emitter")!! as Mesh
        const particle = this.particle = emitter.clone("particle")
        T.MeshUtils.setColor(particle, new B.Color4(1,1,1,1))
        const rotative_model = model.meshes.find(m=>m.name=="RotativeModel")!! as Mesh
        const color_model = model.meshes.find(m=>m.name=="ColorModel")!! as Mesh
        
        // Prepare the meshes
        root.setParent(this.root)
        root.rotationQuaternion!.multiplyInPlace(Quaternion.FromEulerAngles(0,Math.PI, 0))

        emitter.setParent(gui.root)

        // Buttons
        function createButton(type: Mesh, name:string){
            
            const instance = type.createInstance(name)
            instance.setParent(gui.root)

            const model = buttons.pop()!!
            model.setParent(gui.root)
            instance.position.copyFrom(model.position)
            instance.rotation.copyFrom(model.rotationQuaternion!.toEulerAngles())
            instance.scaling.copyFrom(model.scaling)
            instance.rotationQuaternion = null
            model.dispose()

            return instance
        }

        rotative_model.isVisible = false
        const createRotative = (name:string) => createButton(rotative_model, name)

        color_model.isVisible = false
        color_model.registerInstancedBuffer("color", 4)
        const createColor = (name:string) => createButton(color_model, name)
        
        this.rateSlider = createRotative("rateSlider")
        this.lifetimeSlider = createRotative("lifetimeSlider")
        this.forceSlider = createRotative("forceSlider")
        this.weightSlider = createRotative("weightSlider")
        this.cohesionSlider = createRotative("cohesionSlider")
        this.hueSlider = createColor("hueSlider")
        this.hueSlider.instancedBuffers.color = new B.Color4(1,1,1,1)
        this.motionSlider = createRotative("motionSlider")
        
        return this
    }

    setHue(mesh: AbstractMesh, hue: number){
        const {babylon:B} = this.context
        mesh.instancedBuffers.color = B.Color3.FromHSV(hue, 1, 1).toColor4(1)
    }

    setRotation(mesh: AbstractMesh, value: number){
        const rotation = value * Math.PI + Math.PI/2
        mesh.rotation.y = rotation
    }

    // Particle management
    setParticles(count: number, colors: Float32Array, matrixes: Float32Array){
        // Set blending
        let prev_alpha = 0
        this.particle.registerBeforeRender(()=>{
            prev_alpha = this.particle.getScene().getEngine().getAlphaMode()
            this.particle.getScene().getEngine().setAlphaMode(Engine.ALPHA_ONEONE)
        })
        this.particle.registerAfterRender(()=>{
            this.particle.getScene().getEngine().setAlphaMode(prev_alpha)
        })
        // Set other settings
        this.particle.isPickable = false
        this.particle.checkCollisions = false
        // Set matrix
        this.particle.setParent(null)
        this.particle.resetLocalMatrix()
        this.particle.thinInstanceSetBuffer("matrix", matrixes, 16, false)
        this.particle.thinInstanceSetBuffer("color", colors, 4, false)
    }

    updateParticleMatrix(){
        this.particle.thinInstanceBufferUpdated("matrix")
        this.particle.thinInstanceRefreshBoundingInfo()
    }

    updateParticleColor(){
        this.particle.thinInstanceBufferUpdated("color")
    }

    async dispose(){
        this.particle.dispose()
    }

}

export class ParticleEmitterN3D implements Node3D{

    settings: ParticleEmitterSettings = {
        rate: 1,
        lifetime: 1,
        force: 0.5,
        weight: 0,
        cohesion: 0,
        hue: 0,
        motion: "straight"
    }

    constructor(context: Node3DContext, private gui: ParticleEmitterN3DGui){
        const {tools:T} = context
        const node = this

        context.addToBoundingBox(gui.body)

        const rateParam = new T.NumberN3DParameter(
            "rate",
            [gui.rateSlider],
            0.1,50,
            v => {
                node.settings.rate = v
                gui.setRotation(gui.rateSlider, v/50)
            },
            () => node.settings.rate,
            () => "Spawning Rate",
            " /s"
        )
        rateParam.setValue(0.5)
        context.createParameter(rateParam)

        const lifeTimeParam = new T.NumberN3DParameter(
            "lifetime",
            [gui.lifetimeSlider],
            0.1,10,
            v => {
                node.settings.lifetime = v
                gui.setRotation(gui.lifetimeSlider, v/10)
            },
            () => node.settings.lifetime,
            () => "Particle Lifetime",
            " s"
        )
        lifeTimeParam.setValue(this.settings.lifetime/10)
        context.createParameter(lifeTimeParam)

        const forceParam = new T.NumberN3DParameter(
            "force",
            [gui.forceSlider],
            0,100,
            v => {
                node.settings.force = v/100
                gui.setRotation(gui.forceSlider, v/100)
            },
            () => node.settings.force*100,
            () => "Initial Force",
            " %"
        )
        forceParam.setValue(.5)
        context.createParameter(forceParam)

        const weightParam = new T.NumberN3DParameter(
            "weight",
            [gui.weightSlider],
            -100,100,
            v => {
                node.settings.weight = v/100
                gui.setRotation(gui.weightSlider, (v+100)/200)
            },
            () => node.settings.weight*100,
            () => "Gravity",
            " %"
        )
        weightParam.setValue(.5)
        context.createParameter(weightParam)

        const cohesionParam = new T.NumberN3DParameter(
            "cohesion",
            [gui.cohesionSlider],
            -100,100,
            v => {
                node.settings.cohesion = v/100
                gui.setRotation(gui.cohesionSlider, (v+100)/200)
            },
            () => node.settings.cohesion*100,
            () => "Cohesion",
            " %"
        )
        cohesionParam.setValue(.5)
        context.createParameter(cohesionParam)

        const hueParam = new T.NumberN3DParameter(
            "hue",
            [gui.hueSlider],
            0,360,
            v => {
                node.settings.hue = v
                gui.setHue(gui.hueSlider, v)
            },
            () => node.settings.hue,
            () => "Color",
            "°"
        )
        hueParam.setValue(this.settings.hue)
        context.createParameter(hueParam)

        const choices = ["straight", "accelerate", "decelerate", "spiral", "wander", "sinusoidal"] as const
        gui.setRotation(gui.motionSlider, choices.indexOf(this.settings.motion)/choices.length)
        const motionParam = new T.ChoiceN3DParameter(
            "motion",
            [gui.motionSlider],
            choices.length,
            i =>{
                node.settings.motion = choices[i]
                gui.setRotation(gui.motionSlider, i/choices.length)
            },
            () => choices.indexOf(node.settings.motion),
            () => "Motion Pattern",
            i => choices[i]
        )
        motionParam.setValue(choices.indexOf(this.settings.motion)/choices.length)
        context.createParameter(motionParam)

        this.initParticles()
        let last = Date.now()/1000
        context.observe(gui.root.getScene().onAfterPhysicsObservable, ()=>{
            let newt = Date.now()/1000
            let delta = newt-last
            last = newt
            
            this.tickParticles(delta)
        })
    }

    async setState(){

    }

    async getState(){
        return undefined
    }

    getStateKeys(){
        return []
    }

    async dispose(){
    }


    // Particle Management
    private particles_matrix = new Float32Array(MAX_PARTICLES*16)
    private particles_color = new Float32Array(MAX_PARTICLES*4)

    private particles_states = new Float32Array(MAX_PARTICLES*PARTICLE_STATE_SIZE)// position

    private initParticles(){
        // Set default values
        const basePos = this.gui.emitter.getAbsolutePosition()
        for(let i=0; i<MAX_PARTICLES; i++){
            this.particles_matrix.set([.04,0,0,0, 0,.04,0,0, 0,0,.04,0, basePos.x,basePos.y,basePos.z,1], i*16)
            this.particles_color.set([1,1,1,1], i*4)
            this.particles_states.set([0,0,0, 0,0,0, 0], i*3)
        }
        this.gui.setParticles(MAX_PARTICLES, this.particles_color, this.particles_matrix)
    }

    private toSpawnCount = 0
    private lastSpawn = 0
    private _tempVec = new Vector3()
    private _tempVec2 = new Vector3()
    private gravityCenter = new Vector3()
    private hasGravityCenter = false
    private patternSeeds = new Float32Array(MAX_PARTICLES) // For wander pattern

    /**
     * Update the particle matrix and state for one frame given the time delta since the last frame.
     * Different frame rate could lead to different behavior even with a correct delta.
     */
    private tickParticles(delta: number){
        // Calculate the number of particles to spawn
        const now = Date.now()/1000
        const offset = (now - this.lastSpawn)
        this.lastSpawn = now
        this.toSpawnCount += offset * this.settings.rate
        if(this.toSpawnCount > MAX_PARTICLES) this.toSpawnCount = MAX_PARTICLES

        // Calculate center of gravity
        this._tempVec.set(0,0,0)
        let tempCount = 0

        for(let i=0; i<MAX_PARTICLES; i++){
            const b = i*PARTICLE_STATE_SIZE

            // Respawn
            if(this.particles_states[b+6]<=0){
                if(this.toSpawnCount>0){
                    const spawn_pos = this.gui.emitter.getAbsolutePosition()
                    const direction = this.gui.emitter.forward
                    // Lifetime
                    this.particles_states[b+6] = (.8+Math.random()*.2)*this.settings.lifetime
                    // Base position
                    this.particles_states[b+0] = spawn_pos.x
                    this.particles_states[b+1] = spawn_pos.y
                    this.particles_states[b+2] = spawn_pos.z
                    // Initial velocity
                    this.particles_states[b+3] = ((Math.random()-0.5)-direction.x*4)*this.settings.force
                    this.particles_states[b+4] = ((Math.random()-0.5)-direction.y*4)*this.settings.force
                    this.particles_states[b+5] = ((Math.random()-0.5)-direction.z*4)*this.settings.force
                    // Color
                    const color = Color3.FromHSV(this.settings.hue, 1, 1)
                    this.particles_color[i*4+0] = color.r
                    this.particles_color[i*4+1] = color.g
                    this.particles_color[i*4+2] = color.b
                    this.particles_color[i*4+3] = 1
                    this.gui.updateParticleColor()
                    this.toSpawnCount -= 1
                }
            }
            else{
                // Apply gravity
                if(this.settings.weight!=0){
                    this.particles_states[b+4] -= this.settings.weight * delta*10
                }

                // Apply cohesion
                if(this.settings.cohesion!=0 && this.hasGravityCenter){
                    
                    const CtoP = this._tempVec2
                        .set(
                            this.particles_states[b+0],
                            this.particles_states[b+1],
                            this.particles_states[b+2]
                        )
                        .subtractInPlace(this.gravityCenter)
                    const distance = CtoP.length()
                    CtoP.normalize()

                    const force = this.settings.cohesion * delta * 10 / (distance*distance+1)

                    CtoP.scaleInPlace(-force)
                    
                    this.particles_states[b+3] += CtoP.x
                    this.particles_states[b+4] += CtoP.y
                    this.particles_states[b+5] += CtoP.z
                }

                // Apply pattern
                switch(this.settings.motion){
                    case "accelerate":
                        // Increase velocity in direction of movement
                        const accelSpeed = Math.sqrt(this.particles_states[b+3]**2 + this.particles_states[b+4]**2 + this.particles_states[b+5]**2)
                        if(accelSpeed > 0.001){
                            this.particles_states[b+3] *= 1 + delta*2
                            this.particles_states[b+4] *= 1 + delta*2
                            this.particles_states[b+5] *= 1 + delta*2
                        }
                        break
                    
                    case "spiral":
                        // Rotate velocity vector around movement axis
                        const vel = this._tempVec2.set(this.particles_states[b+3], this.particles_states[b+4], this.particles_states[b+5])
                        const speed = vel.length()
                        if(speed > 0.001){
                            const angle = delta * 3 // radians per second
                            const cos = Math.cos(angle)
                            const sin = Math.sin(angle)
                            vel.normalize()
                            // Rotate perpendicular to velocity
                            const perpX = -vel.z
                            const perpY = 0
                            const perpZ = vel.x
                            const rotated = this._tempVec.set(
                                vel.x * cos + perpX * sin,
                                vel.y * cos + perpY * sin,
                                vel.z * cos + perpZ * sin
                            ).scaleInPlace(speed)
                            this.particles_states[b+3] = rotated.x
                            this.particles_states[b+4] = rotated.y
                            this.particles_states[b+5] = rotated.z
                        }
                        break
                    
                    case "wander":
                        // Add random perturbation
                        if(!this.patternSeeds[i]) this.patternSeeds[i] = Math.random() * 1000
                        this.particles_states[b+3] += (Math.random()-0.5) * delta * 8
                        this.particles_states[b+4] += (Math.random()-0.5) * delta * 8
                        this.particles_states[b+5] += (Math.random()-0.5) * delta * 8
                        break
                    
                    case "sinusoidal":
                        // Apply wave motion perpendicular to initial direction
                        const time = Date.now() * 0.001
                        const freq = 2
                        const amp = 2
                        this.particles_states[b+3] += Math.sin(time * freq + i) * amp * delta
                        this.particles_states[b+4] += Math.cos(time * freq + i * 0.5) * amp * delta
                        break
                    
                    case "decelerate":
                        // Already handled by damping, but can enhance it
                        this.particles_states[b+3] *= Math.pow(0.7, delta)
                        this.particles_states[b+4] *= Math.pow(0.7, delta)
                        this.particles_states[b+5] *= Math.pow(0.7, delta)
                        break
                    
                    case "straight":
                    default:
                        // No pattern applied
                        break
                }

                // Ground collision
                if(this.particles_states[b+1] < -1){
                    this.particles_states[b+4] = Math.max(-this.particles_states[b+4]*.5, this.particles_states[b+4]*.5, .1)
                }
                
                // Apply velocity
                this.particles_states[b+0] += this.particles_states[b+3]*delta
                this.particles_states[b+1] += this.particles_states[b+4]*delta
                this.particles_states[b+2] += this.particles_states[b+5]*delta

                // Damp velocity
                this.particles_states[b+3] *= Math.pow(0.98,delta)
                this.particles_states[b+4] *= Math.pow(0.98,delta)
                this.particles_states[b+5] *= Math.pow(0.98,delta)

                // Update gravity center
                this._tempVec.x += this.particles_states[b+0]
                this._tempVec.y += this.particles_states[b+1]
                this._tempVec.z += this.particles_states[b+2]

                // Age
                this.particles_states[b+6] -= delta
                if(this.particles_states[b+6]<=0){
                    this.particles_states[b+0] = 0
                    this.particles_states[b+1] = 0
                    this.particles_states[b+2] = 0
                }

                // Update matrix
                this.particles_matrix[i*16 + 12] = this.particles_states[b+0]
                this.particles_matrix[i*16 + 13] = this.particles_states[b+1]
                this.particles_matrix[i*16 + 14] = this.particles_states[b+2]

                tempCount++
            }
        }
        if(tempCount>0){
            this.gravityCenter.copyFrom(this._tempVec).scaleInPlace(1/tempCount)
            this.hasGravityCenter = true
        }
        else this.hasGravityCenter = false

        this.gui.updateParticleMatrix()
    }
}

export default {

    label: "Particle Emitter",

    description: "Emits particles in the scene (placeholder, no actual particles yet)",

    tags: ["visual","effect"],
    
    async createGUI(ctx: Node3DGUIContext){
        return await new ParticleEmitterN3DGui(ctx).initialize()
    },

    async create(ctx: Node3DContext, gui: ParticleEmitterN3DGui){
        return new ParticleEmitterN3D(ctx, gui)
    },

} as Node3DFactory<ParticleEmitterN3DGui, ParticleEmitterN3D>