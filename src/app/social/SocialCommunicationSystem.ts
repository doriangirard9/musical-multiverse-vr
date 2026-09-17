import { Color3, CreateCylinder, CreatePlane, CreateTorus, Mesh, Observer, Scene, StandardMaterial, Vector3 } from "@babylonjs/core"
import { AdvancedDynamicTexture, TextBlock } from "@babylonjs/gui"
import { NetworkManager } from "../../network/NetworkManager"
import { InputManager } from "../../xr/inputs/InputManager"
import { SceneManager } from "../SceneManager"
import { AvatarSystem } from "./AvatarSystem"
import { SocialEvent, SocialEventClient, SocialEventKind } from "./SocialEventClient"

type ActiveMarker = {
    mesh: Mesh
    material?: StandardMaterial
    texture?: AdvancedDynamicTexture
    sourceId: string
    fallbackPosition: Vector3
    followAvatar: boolean
    expiresAt: number
    startTime: number
    kind: SocialEventKind
}

const MAX_EVENT_TTL_MS = 6000
const POINT_PING_DISTANCE = 3

/** Transient social signals. Events are relayed by WebSocket and never saved. */
export class SocialCommunicationSystem {
    private static instance?: SocialCommunicationSystem

    static initialize(
        network: NetworkManager,
        inputs: InputManager,
        avatars: AvatarSystem,
        scenes: SceneManager,
    ): SocialCommunicationSystem {
        this.instance?.dispose()
        this.instance = new SocialCommunicationSystem(network, inputs, avatars, scenes)
        return this.instance
    }

    static getInstance(): SocialCommunicationSystem {
        if (!this.instance) throw new Error("SocialCommunicationSystem not initialized.")
        return this.instance
    }

    private readonly client: SocialEventClient
    private readonly markers = new Set<ActiveMarker>()
    private readonly updateObserver: Observer<Scene>
    private lastSentAt = 0

    private constructor(
        network: NetworkManager,
        private readonly inputs: InputManager,
        private readonly avatars: AvatarSystem,
        private readonly scenes: SceneManager,
    ) {
        this.client = new SocialEventClient(network.roomName, network.playerId, (sourceId, event) => {
            this.showEvent(sourceId, event)
        })
        this.updateObserver = scenes.getScene().onBeforeRenderObservable.add(() => this.updateMarkers())
    }

    pingPlayer(): void {
        this.send("ping-player", this.getLocalHeadPosition())
    }

    pingPointed(): void {
        const pointer = this.inputs.right.pointer
        const position = pointer.hit
            ? pointer.target.clone()
            : pointer.origin.add(pointer.forward.scale(POINT_PING_DISTANCE))
        this.send("ping-point", position)
    }

    ready(): void {
        this.send("ready", this.getLocalHeadPosition())
    }

    private send(kind: SocialEventKind, position: Vector3): void {
        if (performance.now() - this.lastSentAt < 350) return
        if (!this.isFinitePosition(position)) return
        this.lastSentAt = performance.now()
        this.client.send({ kind, position: this.toPosition(position) })
    }

    private showEvent(sourceId: string, event: SocialEvent): void {
        const fallbackPosition = this.toVector(event.position)
        if (!this.isFinitePosition(fallbackPosition)) return
        const now = performance.now()
        const marker = event.kind === "ready"
            ? this.createReadyMarker(sourceId, fallbackPosition, now, event.ttlMs)
            : this.createPingMarker(sourceId, fallbackPosition, now, event.ttlMs, event.kind)
        this.markers.add(marker)
        this.inputs.left.pulse(0.16, 25)
    }

    private createPingMarker(
        sourceId: string,
        position: Vector3,
        now: number,
        ttlMs: number | undefined,
        kind: "ping-player" | "ping-point",
    ): ActiveMarker {
        const scene = this.scenes.getScene()
        const mesh = kind === "ping-player"
            ? CreateTorus(`social-ping-player-${now}`, { diameter: 0.72, thickness: 0.06, tessellation: 24 }, scene)
            : CreateCylinder(`social-ping-point-${now}`, { height: 0.5, diameterTop: 0, diameterBottom: 0.28, tessellation: 16 }, scene)
        const material = new StandardMaterial(`social-ping-material-${now}`, scene)
        material.diffuseColor = kind === "ping-player" ? new Color3(0.2, 0.9, 1) : new Color3(1, 0.72, 0.18)
        material.emissiveColor = material.diffuseColor.scale(0.65)
        material.alpha = 0.9
        mesh.material = material
        mesh.isPickable = false
        mesh.position.copyFrom(position)
        if (kind === "ping-point") mesh.position.y += 0.3

        return {
            mesh,
            material,
            sourceId,
            fallbackPosition: position,
            followAvatar: kind === "ping-player",
            expiresAt: now + Math.min(MAX_EVENT_TTL_MS, eventTtl(ttlMs)),
            startTime: now,
            kind,
        }
    }

    private createReadyMarker(sourceId: string, position: Vector3, now: number, ttlMs?: number): ActiveMarker {
        const scene = this.scenes.getScene()
        const mesh = CreatePlane(`social-ready-${now}`, { width: 0.72, height: 0.2 }, scene)
        mesh.billboardMode = Mesh.BILLBOARDMODE_ALL
        mesh.isPickable = false
        const texture = AdvancedDynamicTexture.CreateForMesh(mesh, 512, 160)
        const text = new TextBlock()
        text.text = "READY"
        text.color = "#b9ffb2"
        text.fontSize = 76
        text.fontWeight = "bold"
        text.outlineColor = "#0b2412"
        text.outlineWidth = 7
        texture.addControl(text)
        mesh.position.copyFrom(position).addInPlaceFromFloats(0, 0.45, 0)

        return {
            mesh,
            texture,
            sourceId,
            fallbackPosition: position,
            followAvatar: true,
            expiresAt: now + Math.min(MAX_EVENT_TTL_MS, eventTtl(ttlMs)),
            startTime: now,
            kind: "ready",
        }
    }

    private updateMarkers(): void {
        const now = performance.now()
        for (const marker of this.markers) {
            if (now >= marker.expiresAt) {
                this.disposeMarker(marker)
                continue
            }
            const progress = (now - marker.startTime) / Math.max(1, marker.expiresAt - marker.startTime)
            const avatarPosition = marker.followAvatar
                ? this.avatars.findAvatarByPlayerId(marker.sourceId)?.getHeadPosition()
                : undefined
            const position = avatarPosition ?? marker.fallbackPosition
            marker.mesh.position.copyFrom(position)
            if (marker.kind === "ready") {
                marker.mesh.position.y += 0.55
                marker.mesh.visibility = 1 - progress * 0.55
            } else if (marker.kind === "ping-player") {
                marker.mesh.position.y -= 0.65
                marker.mesh.scaling.setAll(1 + progress * 0.8)
                marker.mesh.visibility = 1 - progress
            } else {
                marker.mesh.position.y += 0.3 + Math.sin(now / 120) * 0.035
                marker.mesh.scaling.setAll(1 + Math.sin(now / 100) * 0.08)
                marker.mesh.visibility = 1 - progress
            }
            if (marker.material) marker.material.alpha = Math.max(0, 0.9 * (1 - progress))
        }
    }

    private disposeMarker(marker: ActiveMarker): void {
        this.markers.delete(marker)
        marker.texture?.dispose()
        marker.material?.dispose()
        marker.mesh.dispose()
    }

    private getLocalHeadPosition(): Vector3 {
        return this.inputs.head.origin.clone()
    }

    private toPosition(vector: Vector3) {
        return { x: vector.x, y: vector.y, z: vector.z }
    }

    private toVector(position: { x: number; y: number; z: number }): Vector3 {
        return new Vector3(position.x, position.y, position.z)
    }

    private isFinitePosition(position: Vector3): boolean {
        return Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z)
    }

    dispose(): void {
        this.scenes.getScene().onBeforeRenderObservable.remove(this.updateObserver)
        this.client.dispose()
        for (const marker of [...this.markers]) this.disposeMarker(marker)
        if (SocialCommunicationSystem.instance === this) SocialCommunicationSystem.instance = undefined
    }
}

function eventTtl(ttlMs?: number): number {
    return Number.isFinite(ttlMs) ? Math.max(500, ttlMs!) : MAX_EVENT_TTL_MS
}
