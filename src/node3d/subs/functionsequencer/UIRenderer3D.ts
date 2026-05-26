import { AbstractMesh, Color3, TransformNode } from "@babylonjs/core"
import { RemoteUIElement } from "./api/RemoteUI"
import { Node3DGUIContext } from "../../Node3DGUIContext"

/**
 * Résultat du rendu d'un élément UI avec ses interactions
 */
export type RenderedUIElement = {
    root: TransformNode
    meshes: AbstractMesh[]
    interactive: AbstractMesh[]
    dispose: () => void
}

/**
 * Convertit les RemoteUIElement en objets 3D BabylonJS
 */
export class UIRenderer3D {
    
    private context: Node3DGUIContext
    private renderedElements: Map<string, RenderedUIElement> = new Map()

    // Dimensions par défaut
    private readonly DEFAULT_BUTTON_SIZE = 0.08
    private readonly DEFAULT_KNOB_SIZE = 0.1
    private readonly DEFAULT_SLIDER_WIDTH = 0.2
    private readonly DEFAULT_SLIDER_HEIGHT = 0.05
    private readonly DEFAULT_LABEL_HEIGHT = 0.04
    private readonly DEFAULT_PADDING = 0.01

    constructor(context: Node3DGUIContext) {
        this.context = context
    }

    /**
     * Rend un élément UI complet
     */
    renderUI(element: RemoteUIElement): RenderedUIElement | null {
        // Nettoyer l'ancien rendu si existant
        this.dispose()

        const rendered = this.renderElement(element)
        if (rendered) {
            this.renderedElements.set(element.name, rendered)
        }
        
        return rendered
    }

    /**
     * Rend un élément UI récursivement
     */
    private renderElement(element: RemoteUIElement): RenderedUIElement | null {
        switch (element.type) {
            case "col":
                return this.renderColumn(element)
            case "row":
                return this.renderRow(element)
            case "action":
                return this.renderAction(element)
            case "toggle":
                return this.renderToggle(element)
            case "knob":
                return this.renderKnob(element)
            case "slider":
                return this.renderSlider(element)
            case "label":
                return this.renderLabel(element)
            case "select":
                return this.renderSelect(element)
            default:
                console.warn("Unknown UI element type:", element.type)
                return null
        }
    }

    /**
     * Rend une colonne (empilement vertical)
     */
    private renderColumn(element: RemoteUIElement): RenderedUIElement {
        const { babylon: B } = this.context
        const root = new B.TransformNode(`col_${element.name}`)
        const meshes: AbstractMesh[] = []
        const interactive: AbstractMesh[] = []
        const children: RenderedUIElement[] = []

        const padding = element.props.padding ?? this.DEFAULT_PADDING
        let currentY = 0

        // Rendre chaque enfant
        if (element.children) {
            for (const child of element.children) {
                const rendered = this.renderElement(child)
                if (rendered) {
                    children.push(rendered)
                    rendered.root.parent = root
                    rendered.root.position.y = currentY
                    
                    meshes.push(...rendered.meshes)
                    interactive.push(...rendered.interactive)

                    // Calculer la hauteur de l'enfant pour le positionnement suivant
                    const bounds = this.calculateBounds(rendered.meshes)
                    currentY -= bounds.height + padding
                }
            }
        }

        return {
            root,
            meshes,
            interactive,
            dispose: () => {
                children.forEach(c => c.dispose())
                root.dispose()
            }
        }
    }

    /**
     * Rend une ligne (empilement horizontal)
     */
    private renderRow(element: RemoteUIElement): RenderedUIElement {
        const { babylon: B } = this.context
        const root = new B.TransformNode(`row_${element.name}`)
        const meshes: AbstractMesh[] = []
        const interactive: AbstractMesh[] = []
        const children: RenderedUIElement[] = []

        const padding = element.props.padding ?? this.DEFAULT_PADDING
        let currentX = 0

        // Rendre chaque enfant
        if (element.children) {
            for (const child of element.children) {
                const rendered = this.renderElement(child)
                if (rendered) {
                    children.push(rendered)
                    rendered.root.parent = root
                    rendered.root.position.x = currentX
                    
                    meshes.push(...rendered.meshes)
                    interactive.push(...rendered.interactive)

                    // Calculer la largeur de l'enfant
                    const bounds = this.calculateBounds(rendered.meshes)
                    currentX += bounds.width + padding
                }
            }
        }

        return {
            root,
            meshes,
            interactive,
            dispose: () => {
                children.forEach(c => c.dispose())
                root.dispose()
            }
        }
    }

    /**
     * Rend un bouton d'action
     */
    private renderAction(element: RemoteUIElement): RenderedUIElement {
        const { babylon: B, tools: T } = this.context
        const size = element.props.width ?? this.DEFAULT_BUTTON_SIZE
        
        const root = new B.TransformNode(`action_${element.name}`)
        const button = B.CreateBox(`action_button_${element.name}`, { size }, this.context.scene)
        button.parent = root
        button.material = this.context.materialMat

        const color = element.props.highlighted 
            ? Color3.Yellow().toColor4()
            : Color3.Gray().toColor4()
        T.MeshUtils.setColor(button, color)

        return {
            root,
            meshes: [button],
            interactive: [button],
            dispose: () => {
                button.dispose()
                root.dispose()
            }
        }
    }

    /**
     * Rend un toggle (bouton on/off)
     */
    private renderToggle(element: RemoteUIElement): RenderedUIElement {
        const { babylon: B, tools: T } = this.context
        const size = element.props.width ?? this.DEFAULT_BUTTON_SIZE
        
        const root = new B.TransformNode(`toggle_${element.name}`)
        const button = B.CreateBox(`toggle_button_${element.name}`, { size }, this.context.scene)
        button.parent = root
        button.material = this.context.materialMat

        const color = element.props.highlighted 
            ? Color3.Green().toColor4()
            : Color3.Gray().toColor4()
        T.MeshUtils.setColor(button, color)

        return {
            root,
            meshes: [button],
            interactive: [button],
            dispose: () => {
                button.dispose()
                root.dispose()
            }
        }
    }

    /**
     * Rend un knob (potentiomètre rotatif)
     */
    private renderKnob(element: RemoteUIElement): RenderedUIElement {
        const { babylon: B, tools: T } = this.context
        const size = element.props.width ?? this.DEFAULT_KNOB_SIZE
        
        const root = new B.TransformNode(`knob_${element.name}`)
        const knob = B.CreateCylinder(`knob_cyl_${element.name}`, {
            height: size * 0.3,
            diameter: size
        }, this.context.scene)
        knob.parent = root
        knob.material = this.context.materialMat
        T.MeshUtils.setColor(knob, Color3.Blue().toColor4())

        // Indicateur de position
        const indicator = B.CreateBox(`knob_ind_${element.name}`, {
            width: size * 0.1,
            height: size * 0.3,
            depth: size * 0.5
        }, this.context.scene)
        indicator.parent = knob
        indicator.position.z = size * 0.3
        indicator.material = this.context.materialMat
        T.MeshUtils.setColor(indicator, Color3.White().toColor4())

        return {
            root,
            meshes: [knob, indicator],
            interactive: [knob],
            dispose: () => {
                indicator.dispose()
                knob.dispose()
                root.dispose()
            }
        }
    }

    /**
     * Rend un slider (curseur linéaire)
     */
    private renderSlider(element: RemoteUIElement): RenderedUIElement {
        const { babylon: B, tools: T } = this.context
        const width = element.props.width ?? this.DEFAULT_SLIDER_WIDTH
        const height = element.props.height ?? this.DEFAULT_SLIDER_HEIGHT
        
        const root = new B.TransformNode(`slider_${element.name}`)
        
        // Piste du slider
        const track = B.CreateBox(`slider_track_${element.name}`, {
            width,
            height: height * 0.5,
            depth: height * 0.5
        }, this.context.scene)
        track.parent = root
        track.material = this.context.materialMat
        T.MeshUtils.setColor(track, Color3.Gray().toColor4())

        // Curseur
        const thumb = B.CreateBox(`slider_thumb_${element.name}`, {
            width: height,
            height: height,
            depth: height
        }, this.context.scene)
        thumb.parent = root
        thumb.material = this.context.materialMat
        T.MeshUtils.setColor(thumb, Color3.White().toColor4())

        return {
            root,
            meshes: [track, thumb],
            interactive: [thumb],
            dispose: () => {
                thumb.dispose()
                track.dispose()
                root.dispose()
            }
        }
    }

    /**
     * Rend un label (texte statique)
     */
    private renderLabel(element: RemoteUIElement): RenderedUIElement {
        const { babylon: B, tools: T } = this.context
        const width = element.props.width ?? 0.2
        const height = element.props.height ?? this.DEFAULT_LABEL_HEIGHT
        
        const root = new B.TransformNode(`label_${element.name}`)
        const label = B.CreateBox(`label_box_${element.name}`, {
            width,
            height,
            depth: height * 0.2
        }, this.context.scene)
        label.parent = root
        label.material = this.context.materialMat
        T.MeshUtils.setColor(label, Color3.Black().toColor4(0.3))

        return {
            root,
            meshes: [label],
            interactive: [],
            dispose: () => {
                label.dispose()
                root.dispose()
            }
        }
    }

    /**
     * Rend un select (menu déroulant)
     */
    private renderSelect(element: RemoteUIElement): RenderedUIElement {
        const { babylon: B, tools: T } = this.context
        const width = element.props.width ?? 0.15
        const height = element.props.height ?? this.DEFAULT_BUTTON_SIZE
        
        const root = new B.TransformNode(`select_${element.name}`)
        const select = B.CreateBox(`select_box_${element.name}`, {
            width,
            height,
            depth: height
        }, this.context.scene)
        select.parent = root
        select.material = this.context.materialMat
        T.MeshUtils.setColor(select, Color3.Purple().toColor4())

        return {
            root,
            meshes: [select],
            interactive: [select],
            dispose: () => {
                select.dispose()
                root.dispose()
            }
        }
    }

    /**
     * Calcule les dimensions d'un ensemble de meshes
     */
    private calculateBounds(meshes: AbstractMesh[]): { width: number; height: number; depth: number } {
        if (meshes.length === 0) {
            return { width: 0, height: 0, depth: 0 }
        }

        // Simplification: utiliser les dimensions du premier mesh
        const mesh = meshes[0]
        const bounds = mesh.getBoundingInfo().boundingBox
        const size = bounds.maximumWorld.subtract(bounds.minimumWorld)

        return {
            width: Math.abs(size.x),
            height: Math.abs(size.y),
            depth: Math.abs(size.z)
        }
    }

    /**
     * Met à jour le highlight d'un élément
     */
    highlightElement(name: string, highlighted: boolean): void {
        const rendered = this.renderedElements.get(name)
        if (!rendered) return

        const { tools: T } = this.context
        const color = highlighted ? Color3.Yellow().toColor4() : Color3.Gray().toColor4()

        for (const mesh of rendered.meshes) {
            T.MeshUtils.setColor(mesh, color)
        }
    }

    /**
     * Récupère tous les meshes interactifs
     */
    getAllInteractiveMeshes(): AbstractMesh[] {
        const allInteractive: AbstractMesh[] = []
        this.renderedElements.forEach(rendered => {
            allInteractive.push(...rendered.interactive)
        })
        return allInteractive
    }

    /**
     * Nettoie tous les éléments rendus
     */
    dispose(): void {
        this.renderedElements.forEach(rendered => rendered.dispose())
        this.renderedElements.clear()
    }
}
