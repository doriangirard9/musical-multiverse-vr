import { Button } from "@babylonjs/gui"
import { Observer, Quaternion, Scene } from "@babylonjs/core"
import { AbstractMenu } from "../../menus/AbstractMenu"
import { InputManager } from "../../xr/inputs/InputManager"
import { MicrophoneSystem } from "../MicrophoneSystem"
import { SceneManager } from "../SceneManager"
import { SocialCommunicationSystem } from "./SocialCommunicationSystem"

/** Compact communication wheel opened from the left hand menu. */
export class SocialWheelSystem {
    private static instance?: SocialWheelSystem

    static initialize(
        scenes: SceneManager,
        inputs: InputManager,
        microphone: MicrophoneSystem,
        social: SocialCommunicationSystem,
    ): SocialWheelSystem {
        this.instance?.dispose()
        this.instance = new SocialWheelSystem(scenes, inputs, microphone, social)
        return this.instance
    }

    static hasInstance(): boolean {
        return !!this.instance
    }

    static toggle(): void {
        this.instance?.toggle()
    }

    private readonly panel: SocialWheelPanel
    private readonly updateObserver: Observer<Scene>
    private constructor(
        private readonly scenes: SceneManager,
        private readonly inputs: InputManager,
        private readonly microphone: MicrophoneSystem,
        private readonly social: SocialCommunicationSystem,
    ) {
        this.panel = new SocialWheelPanel(scenes, microphone, {
            pingPlayer: () => this.social.pingPlayer(),
            pingPointed: () => this.social.pingPointed(),
            ready: () => this.social.ready(),
            toggleMic: () => void this.microphone.toggleOpenMic().then(() => this.panel.refresh()),
            toggleMonitor: () => void this.microphone.toggleMonitor().then(() => this.panel.refresh()),
            close: () => this.panel.hide(),
        })
        this.updateObserver = scenes.getScene().onBeforeRenderObservable.add(() => this.updatePosition())
    }

    toggle(): void {
        this.panel.toggle()
        if (this.panel.isVisible) {
            this.panel.refresh()
            this.inputs.left.pulse(0.3, 35)
        }
    }

    private updatePosition(): void {
        if (!this.panel.isVisible) return
        const pointer = this.inputs.left.pointer
        const position = pointer.origin
            .add(pointer.forward.scale(0.36))
            .add(pointer.up.scale(0.08))
        this.panel.root.position.copyFrom(position)
        this.panel.root.rotationQuaternion = Quaternion.FromLookDirectionLH(pointer.forward.scale(-1), pointer.up)
    }

    dispose(): void {
        this.scenes.getScene().onBeforeRenderObservable.remove(this.updateObserver)
        this.panel.dispose()
        if (SocialWheelSystem.instance === this) SocialWheelSystem.instance = undefined
    }
}

type SocialWheelActions = {
    pingPlayer: () => void
    pingPointed: () => void
    ready: () => void
    toggleMic: () => void
    toggleMonitor: () => void
    close: () => void
}

class SocialWheelPanel extends AbstractMenu {
    private readonly micButton: Button
    private readonly monitorButton: Button

    constructor(
        scenes: SceneManager,
        private readonly microphone: MicrophoneSystem,
        actions: SocialWheelActions,
    ) {
        super(scenes.getScene(), scenes.getUtilityLayer().utilityLayerScene)
        this.initPanel("social-wheel", 0.96, 0.96, 512)
        this.addAction("social-ping-player", "PING\nME", 35, 2, "#26d7ef", actions.pingPlayer)
        this.addAction("social-ping-point", "PING\nPOINT", 66, 28, "#ffbf4d", actions.pingPointed)
        this.addAction("social-ready", "READY", 51, 64, "#8ce99a", actions.ready)
        this.micButton = this.addAction("social-mic", "", 4, 28, "#ff8b8b", actions.toggleMic)
        this.monitorButton = this.addAction("social-monitor", "", 19, 64, "#a6c8ff", actions.toggleMonitor)
        this.addAction("social-close", "CLOSE", 35, 35, "#d6d6d6", actions.close, 30)
        this.hide()
        this.refresh()
    }

    refresh(): void {
        const state = this.microphone.getState()
        this.micButton.textBlock!.text = state.mode === "open_mic" ? "MIC\nON" : "MIC\nOFF"
        this.micButton.color = state.mode === "open_mic" ? "#8ce99a" : "#ff8b8b"
        this.monitorButton.textBlock!.text = state.monitorEnabled ? "MONITOR\nON" : "MONITOR\nOFF"
        this.monitorButton.color = state.monitorEnabled ? "#8ce99a" : "#a6c8ff"
    }

    private addAction(
        id: string,
        label: string,
        x: number,
        y: number,
        color: string,
        action: () => void,
        size: number = 25,
    ): Button {
        const button = Button.CreateSimpleButton(id, label)
        button.width = `${size}%`
        button.height = `${size}%`
        button.cornerRadius = 110
        button.color = color
        button.background = "rgba(8, 17, 24, 0.88)"
        button.thickness = 3
        button.fontSize = 35
        button.fontWeight = "bold"
        button.textBlock!.textWrapping = true
        button.pointerEnterAnimation = () => {
            button.background = "rgba(255, 255, 255, 0.2)"
            button.scaleX = 1.08
            button.scaleY = 1.08
        }
        button.pointerOutAnimation = () => {
            button.background = "rgba(8, 17, 24, 0.88)"
            button.scaleX = 1
            button.scaleY = 1
        }
        button.onPointerUpObservable.add(() => action())
        this.place(button, x, y, size, size)
        this.texture.addControl(button)
        return button
    }
}
