import { CreateBox, Vector3, WebXRFeatureName } from "@babylonjs/core";
import { XRManager } from "../../xr/XRManager";
import { N3DShop, N3DShopObject, N3DShopType } from "./N3DShop";

const TRANSITION_TIME = 250 // ms

const ANIMATED_TRANSITION = false

const DEBUG_LOG = false // Set to true to enable debug logs

export class N3DShopCamera implements N3DShopType {

    cameras = [] as N3DShopObject[]
    selected = -1
    to_show = 0
    initialPosition: Vector3 | null = null
    initialRotation: Vector3 | null = null
    animation = Promise.resolve()
    shown = null as string|null
    shop!: N3DShop
    to_unloads = new Set<string>()

    async create(object: N3DShopObject, shop: N3DShop): Promise<() => Promise<void>> {
        this.cameras.push(object)
        this.cameras.sort((a, b) => (a.options.order??0)-(b.options.order??0))
        this.shop = shop

        const block = CreateBox("block", {size: 0.1}, shop.shared.scene)
        block.position = object.location.absolutePosition.clone()
        block.rotation = object.location.absoluteRotation.clone()

        if(this.cameras.length==1){
            const camera = XRManager.getInstance().xrHelper.baseExperience.camera
            
            shop.inputs.y_button.on_down.add(()=>{
                if(DEBUG_LOG) console.log(`[Y Button] pressed - selected: ${this.selected}, to_show: ${this.to_show}`)
                
                if(this.selected === -1) {
                    // Entering shop - execute transition SYNCHRONOUSLY
                    const targetIndex = this.to_show
                    
                    // CRITICAL: Disable movement FIRST
                    if(XRManager.getInstance().xrFeaturesManager.getEnabledFeatures().includes(WebXRFeatureName.MOVEMENT))
                        XRManager.getInstance().xrFeaturesManager.disableFeature(WebXRFeatureName.MOVEMENT)
                    camera.applyGravity = false
                    
                    // Stop camera velocity
                    this._stopCameraVelocity(camera)
                    
                    // Capture current position and rotation IMMEDIATELY
                    this.initialPosition = camera.globalPosition.clone()
                    if(camera.rotationQuaternion) {
                        this.initialRotation = camera.rotationQuaternion.toEulerAngles()
                    } else {
                        this.initialRotation = camera.rotation.clone()
                    }
                    
                    if(DEBUG_LOG) console.log(`[Y Button] Captured:`, this.initialPosition, `rotation.y:`, this.initialRotation.y)
                    
                    // Calculate shop target position SYNCHRONOUSLY
                    const localPos = this.cameras[targetIndex].location.position
                    const parent = this.cameras[targetIndex].location.parent as TransformNode
                    const toPosition = Vector3.TransformCoordinates(localPos, parent.getWorldMatrix())
                    const toRotation = this.cameras[targetIndex].location.absoluteRotation
                    
                    // Add small offset backwards (away from wall) - 0.5 units
                    const offset = 0.5
                    const forwardX = Math.sin(toRotation.y)
                    const forwardZ = Math.cos(toRotation.y)
                    toPosition.x -= forwardX * offset
                    toPosition.z -= forwardZ * offset
                    
                    // TELEPORT IMMEDIATELY - no async delay
                    camera.position.copyFrom(toPosition)
                    if(camera.rotationQuaternion) camera.rotation = camera.rotationQuaternion.toEulerAngles()
                    camera.rotation.y = toRotation.y
                    camera.rotationQuaternion = camera.rotation.toQuaternion()
                    
                    this.selected = targetIndex
                    this.to_show = targetIndex
                    
                    if(DEBUG_LOG) console.log(`[Y Button] INSTANT teleport to shop:`, toPosition, `rotation.y:`, toRotation.y)
                    
                    // Show zone asynchronously (UI stuff)
                    const newShown = this.cameras[targetIndex].options.show as string
                    if(this.shown) this.to_unloads.add(this.shown)
                    if(newShown) this.to_unloads.delete(newShown)
                    this.shown = newShown
                    
                    this.animation = this.animation.then(async()=>{
                        if(newShown) await this.shop.showZone(newShown)
                        await this.unload()
                    })
                }
                else {
                    // Returning from shop - execute SYNCHRONOUSLY
                    
                    // TELEPORT BACK IMMEDIATELY
                    camera.position.copyFrom(this.initialPosition!)
                    if(camera.rotationQuaternion) camera.rotation = camera.rotationQuaternion.toEulerAngles()
                    camera.rotation.y = this.initialRotation!.y
                    camera.rotationQuaternion = camera.rotation.toQuaternion()
                    
                    // Re-enable movement and gravity
                    if(!XRManager.getInstance().xrFeaturesManager.getEnabledFeatures().includes(WebXRFeatureName.MOVEMENT))
                        XRManager.getInstance().setMovement(["rotation", "translation"])
                    camera.applyGravity = true
                    
                    this.selected = -1
                    
                    if(DEBUG_LOG) console.log(`[Y Button] INSTANT teleport back to world:`, this.initialPosition, `rotation.y:`, this.initialRotation!.y)
                    
                    // Reset
                    this.initialPosition = null
                    this.initialRotation = null
                    
                    // Unload zones asynchronously
                    this.animation = this.animation.then(async()=>{
                        await this.unload()
                    })
                }
            })
            shop.inputs.b_button.on_down.add(()=>{
                this.animation = this.animation.then(async()=>{
                    if(this.selected!=-1) await this.show(-1)
                    await this.unload()
                })
            })
            shop.inputs.left_thumbstick.on_left_down.add(()=>{
                this.animation = this.animation.then(async()=>{
                    if(this.selected!=-1) await this.switch(-1)
                })
                
            })
            shop.inputs.left_thumbstick.on_right_down.add(()=>{
                this.animation = this.animation.then(async()=>{
                    if(this.selected!=-1) await this.switch(1)
                })
            })

            shop.on_start_drag.add((previewer) => {
                this.animation = this.animation.then(async()=>{
                    await this.show(-1)
                })
                const ondrop = ()=>{
                    this.animation = this.animation.then(async()=>{
                        await this.unload()
                    })
                }
                previewer.on_drop = ondrop
                previewer.on_no_drop = ondrop
            })
        }


        return async () => {
            this.cameras.splice(this.cameras.indexOf(object), 1)
        }
    }

    async switch(offset: number){
        let selected = this.selected
        do{
            selected = (selected + offset + this.cameras.length) % this.cameras.length
            // const camera = this.cameras[selected]  // Reserved for future empty verification
            if(true/*NOT EMPTY VERIFICATION*/)break
        }while(selected!=this.selected)
        await this.show(selected)
        await this.unload()
    }

    async show(index: number, capturedPosition?: Vector3, capturedRotation?: Vector3){
        if(DEBUG_LOG) console.log(`[show] called - index: ${index}, current selected: ${this.selected}, cameras.length: ${this.cameras.length}`)
        
        if(index==this.selected) return

        const camera = XRManager.getInstance().xrHelper.baseExperience.camera
        
        // From position and rotation
        let fromPosition: Vector3
        let fromRotation: Vector3

        if(this.selected==-1){
            // Use the captured WORLD position from Y button press (movement already disabled in button handler)
            // Store the EXACT world position including Y - don't normalize
            this.initialPosition = capturedPosition ?? camera.globalPosition.clone()
            // Save the Y rotation from the captured rotation
            if(capturedRotation) {
                this.initialRotation = capturedRotation.clone()
            } else {
                // Get current rotation from quaternion
                if(camera.rotationQuaternion) camera.rotation = camera.rotationQuaternion.toEulerAngles()
                this.initialRotation = camera.rotation.clone()
            }
            
            if(DEBUG_LOG) console.log(`[show] Saved exact WORLD position:`, this.initialPosition, `rotation:`, this.initialRotation)
            
            // Movement and gravity already disabled in button handler
            
            fromPosition = this.initialPosition
            fromRotation = this.initialRotation
            if(XRManager.getInstance().xrFeaturesManager.getEnabledFeatures().includes(WebXRFeatureName.MOVEMENT)){
                XRManager.getInstance().xrFeaturesManager.disableFeature(WebXRFeatureName.MOVEMENT)
            }
            camera.cameraDirection.setAll(0)
            await new Promise(r=>setTimeout(r,100))
        }
        else{
            fromPosition = this.cameras[this.selected].location.absolutePosition
            fromRotation = this.cameras[this.selected].location.absoluteRotation
            if(DEBUG_LOG) console.log(`[show] Switching cameras or going back, fromPosition:`, fromPosition)
        }

        if(DEBUG_LOG) console.log("after calc from")

        // To position and rotation
        let toPosition: Vector3
        let toRotation: Vector3

        if(index==-1){
            toPosition = this.initialPosition!
            toRotation = this.initialRotation!
            if(DEBUG_LOG) console.log(`[show] Going BACK to world, toPosition:`, toPosition, `toRotation:`, toRotation)
            if(!XRManager.getInstance().xrFeaturesManager.getEnabledFeatures().includes(WebXRFeatureName.MOVEMENT))
                XRManager.getInstance().setMovement(["rotation", "translation"])
            // Re-enable gravity when returning to world - will be applied after position is set
            camera.applyGravity = true
            // Reset initial position so it's recaptured next time
            this.initialPosition = null
            this.initialRotation = null
        }
        else{
            // Use position (local to parent) instead of absolutePosition because parent has negative Y scaling
            // Transform the local position using the parent's world matrix
            const localPos = this.cameras[index].location.position
            const parent = this.cameras[index].location.parent as TransformNode
            toPosition = Vector3.TransformCoordinates(localPos, parent.getWorldMatrix())
            toRotation = this.cameras[index].location.absoluteRotation
            if(DEBUG_LOG) console.log(`[show] Going to camera[${index}], localPos:`, localPos, `toPosition:`, toPosition)
            this.to_show = index
        }

        const newShown = index!=-1 ? this.cameras[index].options.show as string : null

        // Hide
        if(newShown!=null) await this.shop.showZone(newShown)

        // Stop camera velocity before teleporting to prevent drift
        this._stopCameraVelocity(camera)

        // Animate
        if(ANIMATED_TRANSITION){
            const startTime = Date.now()
            await new Promise<void>(resolve => {
                let observer = camera.getScene().onAfterAnimationsObservable.add(()=>{
                    const advancement = Math.min(1, (Date.now() - startTime) / TRANSITION_TIME)
                    camera.position.copyFrom(Vector3.Lerp(fromPosition, toPosition, advancement))
                    if(camera.rotationQuaternion) camera.rotation = camera.rotationQuaternion.toEulerAngles()
                    camera.rotation.y = Vector3.Lerp(fromRotation, toRotation, advancement).y
                    camera.rotationQuaternion = camera.rotation.toQuaternion()
                    if(advancement>=1){
                        observer.remove()
                        resolve()
                    }
                })  
            })
        }
        else{
            // Only teleport position and Y rotation - let headset control X and Z naturally
            camera.position.copyFrom(toPosition)
            // Get current rotation from quaternion to preserve headset's X and Z
            if(camera.rotationQuaternion) camera.rotation = camera.rotationQuaternion.toEulerAngles()
            // Set only Y rotation, keep X and Z from headset
            camera.rotation.y = toRotation.y
            // Convert back to quaternion so it takes effect
            camera.rotationQuaternion = camera.rotation.toQuaternion()
            if(DEBUG_LOG) console.log(`[show] After setting - position:`, camera.position, `rotation.y:`, toRotation.y)
        }
        
        // Manage unloads
        if(this.shown) this.to_unloads.add(this.shown)
        if(newShown) this.to_unloads.delete(newShown)

        this.shown = newShown
        this.selected = index

        if(DEBUG_LOG) console.log("after switch")
    }

    async unload(){
        for(const zone of this.to_unloads){
            await this.shop.hideZone(zone)
        }
        this.to_unloads.clear()
    }

    
    private _stopCameraVelocity(camera: any) {
        // Stop camera momentum/velocity to prevent drift during teleport
        // Try multiple properties that different camera types might use
        if(camera.cameraDirection) {
            camera.cameraDirection.setAll(0)
        }
        if(camera._cameraDirection) {
            camera._cameraDirection.setAll(0)
        }
        if(camera.inertialVelocityToRef) {
            camera.inertialVelocityToRef(Vector3.Zero())
        }
        // Stop rotation inertia
        if(camera.inertialAlphaOffset !== undefined) {
            camera.inertialAlphaOffset = 0
        }
        if(camera.inertialBetaOffset !== undefined) {
            camera.inertialBetaOffset = 0
        }
        if(camera.inertialRadiusOffset !== undefined) {
            camera.inertialRadiusOffset = 0
        }
        // Reset angular velocity for rotation
        if(camera.angularSensibility !== undefined) {
            // Clear any accumulated rotation velocity
            if(camera._localDirection) {
                camera._localDirection.setAll(0)
            }
        }
        // Reset physics velocity if present
        if(camera.physicsBody) {
            camera.physicsBody.setLinearVelocity(Vector3.Zero())
            camera.physicsBody.setAngularVelocity(Vector3.Zero())
        }
    }


}