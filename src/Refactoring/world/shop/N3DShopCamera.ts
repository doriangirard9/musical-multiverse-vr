import { Vector3, WebXRFeatureName } from "@babylonjs/core";
import { XRManager } from "../../xr/XRManager";
import { N3DShop, N3DShopObject, N3DShopType } from "./N3DShop";
import { SceneManager } from "../../app/SceneManager";

const TRANSITION_TIME = 250 // ms

const ANIMATED_TRANSITION = false

export class N3DShopCamera implements N3DShopType {

    cameras = [] as N3DShopObject[]
    selected = -1
    to_show = 0
    initialPosition = new Vector3(0, 0, 0)
    initialRotation = new Vector3(0, 0, 0)
    animation = Promise.resolve()
    shown = null as string|null
    shop!: N3DShop
    to_unloads = new Set<string>()

    async create(object: N3DShopObject, shop: N3DShop): Promise<() => Promise<void>> {
        this.cameras.push(object)
        this.cameras.sort((a, b) => (a.options.order??0)-(b.options.order??0))
        this.shop = shop

        if(this.cameras.length==1){
            shop.inputs.y_button.on_down.add(()=>{
                this.animation = this.animation.then(async()=>{
                    if(this.selected==-1) await this.show(this.to_show)
                    else await this.show(-1)
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

            const camera = XRManager.getInstance().xrHelper.baseExperience.camera
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
            const camera = this.cameras[selected]
            if(true/*NOT EMPTY VERIFICATION*/)break
        }while(selected!=this.selected)
        await this.show(selected)
        await this.unload()
    }

    async show(index: number){
        if(index==this.selected) return

        const camera = XRManager.getInstance().xrHelper.baseExperience.camera
        
        // From position and rotation
        let fromPosition: Vector3
        let fromRotation: Vector3

        if(this.selected==-1){
            this.initialPosition = camera.position.clone()
            this.initialRotation = camera.rotation.clone()
            fromPosition = this.initialPosition
            fromRotation = this.initialRotation
            if(XRManager.getInstance().xrFeaturesManager.getEnabledFeatures().includes(WebXRFeatureName.MOVEMENT))
                XRManager.getInstance().xrFeaturesManager.disableFeature(WebXRFeatureName.MOVEMENT)
        }
        else{
            fromPosition = this.cameras[this.selected].location.absolutePosition
            fromRotation = this.cameras[this.selected].location.absoluteRotation
        }

        console.log("after calc from")

        // To position and rotation
        let toPosition: Vector3
        let toRotation: Vector3

        if(index==-1){
            toPosition = this.initialPosition
            toRotation = this.initialRotation
            if(!XRManager.getInstance().xrFeaturesManager.getEnabledFeatures().includes(WebXRFeatureName.MOVEMENT))
                XRManager.getInstance().xrFeaturesManager.enableFeature(WebXRFeatureName.MOVEMENT, "latest",
                {
                    xrInput: XRManager.getInstance().xrHelper.input,
                    movementSpeed: 0.2,
                    rotationSpeed: 0.3
                })
        }
        else{
            toPosition = this.cameras[index].location.absolutePosition
            toRotation = this.cameras[index].location.absoluteRotation
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
                    camera.rotation.copyFrom(Vector3.Lerp(fromRotation, toRotation, advancement))
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
            camera.rotation.copyFrom(toRotation)
            camera.rotationQuaternion = camera.rotation.toQuaternion()
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