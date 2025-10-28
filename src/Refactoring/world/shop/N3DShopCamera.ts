import { Vector3, WebXRFeatureName, TransformNode } from "@babylonjs/core";
import { XRManager } from "../../xr/XRManager";
import { N3DShop, N3DShopObject, N3DShopType } from "./N3DShop";

const TRANSITION_TIME = 250 // ms

const ANIMATED_TRANSITION = false

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

        if(this.cameras.length==1){
            const camera = XRManager.getInstance().xrHelper.baseExperience.camera
            
            shop.inputs.y_button.on_down.add(()=>{
                console.log(`[Y Button] pressed - selected: ${this.selected}, to_show: ${this.to_show}`)
                // Capture position IMMEDIATELY when Y is pressed, before any async operations
                const capturedPosition = this.selected === -1 ? camera.position.clone() : null
                const capturedRotation = this.selected === -1 ? camera.rotation.clone() : null
                
                this.animation = this.animation.then(async()=>{
                    if(this.selected==-1) await this.show(this.to_show, capturedPosition!, capturedRotation!)
                    else await this.show(-1)
                    await this.unload()
                })
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
        console.log(`[show] called - index: ${index}, current selected: ${this.selected}, cameras.length: ${this.cameras.length}`)
        if(index==this.selected) return

        const camera = XRManager.getInstance().xrHelper.baseExperience.camera
        console.log(`[show] camera position:`, camera.position, `rotation:`, camera.rotation, `initialPosition:`, this.initialPosition, `initialRotation:`, this.initialRotation)
        
        // From position and rotation
        let fromPosition: Vector3
        let fromRotation: Vector3

        if(this.selected==-1){
            // Use the captured position from Y button press (to avoid drift from async delay)
            // Store the EXACT position including Y - don't normalize
            this.initialPosition = capturedPosition ?? camera.position.clone()
            this.initialRotation = capturedRotation ?? camera.rotation.clone()
            
            console.log(`[show] Saved exact position:`, this.initialPosition, `rotation:`, this.initialRotation)
            
            // NOW disable movement and gravity
            if(XRManager.getInstance().xrFeaturesManager.getEnabledFeatures().includes(WebXRFeatureName.MOVEMENT))
                XRManager.getInstance().xrFeaturesManager.disableFeature(WebXRFeatureName.MOVEMENT)
            camera.applyGravity = false
            
            fromPosition = this.initialPosition
            fromRotation = this.initialRotation
            console.log(`[show] Going TO shop, fromPosition:`, fromPosition, `fromRotation:`, fromRotation)
        }
        else{
            fromPosition = this.cameras[this.selected].location.absolutePosition
            fromRotation = this.cameras[this.selected].location.absoluteRotation
            console.log(`[show] Switching cameras or going back, fromPosition:`, fromPosition)
        }

        console.log("after calc from")

        // To position and rotation
        let toPosition: Vector3
        let toRotation: Vector3

        if(index==-1){
            toPosition = this.initialPosition!
            toRotation = this.initialRotation!
            console.log(`[show] Going BACK to world, toPosition:`, toPosition, `toRotation:`, toRotation)
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
            console.log(`[show] Going to camera[${index}], localPos:`, localPos, `toPosition:`, toPosition)
            this.to_show = index
        }

        const newShown = index!=-1 ? this.cameras[index].options.show as string : null

        // Hide
        if(newShown!=null) await this.shop.showZone(newShown)

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
            camera.position.copyFrom(toPosition)
            if(camera.rotationQuaternion) camera.rotation = camera.rotationQuaternion.toEulerAngles()
            
            if(index === -1) {
                // Going back to world: restore EXACT rotation from when we left
                console.log(`[show] Restoring exact world rotation:`, toRotation)
                camera.rotation.copyFrom(toRotation)
                
                // Force camera to immediately apply gravity/collision constraints
                // This prevents floating above ground when first returning from shop
                camera._checkInputs()
            } else {
                // Going to shop: use shop camera rotation (Y only, keep horizon level)
                console.log(`[show] Setting shop camera rotation - Y: ${toRotation.y} (resetting X and Z to 0)`)
                camera.rotation.x = 0  // No pitch - look horizontally
                camera.rotation.y = toRotation.y  // Use shop camera's yaw
                camera.rotation.z = 0  // No roll - keep upright
            }
            
            camera.rotationQuaternion = camera.rotation.toQuaternion()
            console.log(`[show] After setting - position:`, camera.position, `rotation:`, camera.rotation)
        }
        
        // Manage unloads
        if(this.shown) this.to_unloads.add(this.shown)
        if(newShown) this.to_unloads.delete(newShown)

        this.shown = newShown
        this.selected = index

        console.log("after switch")
    }

    async unload(){
        for(const zone of this.to_unloads){
            await this.shop.hideZone(zone)
        }
        this.to_unloads.clear()
    }

}