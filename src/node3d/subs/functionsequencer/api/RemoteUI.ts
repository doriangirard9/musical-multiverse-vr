import type { FunctionKernel } from "./FunctionKernel.ts"

export type RemoteUIElementProperties = {
    width?: number
    height?: number
    label?: string
    highlighted?: boolean
    padding?: number
    showValue?: boolean
    horizontal?: boolean
    centered?: boolean
}

export type RemoteUIElement = {
    type: "action" | "toggle" | "knob" | "slider" | "select" | "label" | "col" | "row"
    name: string
    props: RemoteUIElementProperties
    children?: RemoteUIElement[]
}

export class RemoteUI {

    #kernel

    constructor(kernel: FunctionKernel) {
        this.#kernel = kernel
    }

    Col(name: string, children: RemoteUIElement[], properties?: RemoteUIElementProperties): RemoteUIElement {
        return {
            type: "col",
            name,
            children,
            props: properties ?? {}
        }
    }

    Row(name: string, children: RemoteUIElement[], properties?: RemoteUIElementProperties): RemoteUIElement {
        return {
            type: "row",
            name,
            children,
            props: properties ?? {}
        }
    }

    Action(name: string, properties?: RemoteUIElementProperties): RemoteUIElement {
        return {
            type:"action",
            name,
            props: properties ?? {}
        }
    }

    Toggle(name: string, properties?: RemoteUIElementProperties): RemoteUIElement {
        return {
            type: "toggle",
            name,
            props: properties ?? {}
        }
    }

    Knob(name: string, properties?: RemoteUIElementProperties): RemoteUIElement {
        return {
            type: "knob",
            name,
            props: properties ?? {}
        }
    }

    Slider(name: string, properties?: RemoteUIElementProperties): RemoteUIElement {
        return {
            type: "slider",
            name,
            props: properties ?? {}
        }
    }

    Label(name: string, properties?: RemoteUIElementProperties): RemoteUIElement {
        return {
            type: "label",
            name,
            props: properties ?? {}
        }
    }

    Select(name: string, properties?: RemoteUIElementProperties): RemoteUIElement {
        return {
            type: "select",
            name,
            props: properties ?? {}
        }
    }

    Highlight(name: string, value: boolean) {
        this.#kernel.highlight(name, value)
    }
}

export interface RemoteUIBuilderEntry{
    x: number
    y: number
    width: number
    height: number
    element: RemoteUIElement
    childs?: RemoteUIBuilderEntry[]
}

export class RemoteUIBuilder {

    #maps = new Map<string, RemoteUIBuilderEntry>()
    readonly root

    constructor(ui: RemoteUIElement){
        this.root = this.any(ui)
        this.layout(this.root)
    }

    private any(element: RemoteUIElement) {
        if(element.type === "row") {
            return this.row(element)
        }
        else if(element.type === "col") {
            return this.col(element)
        }
        else {
            return this.base(element)
        }
    }

    private base(element: RemoteUIElement) {
        const entry = {x:0, y:0, width:10, height:10, element}
        this.#maps.set(element.name, entry)
        return entry as RemoteUIBuilderEntry
    }

    private row(element: RemoteUIElement) {
        const simple = this.base(element)

        const children = element.children ?? []
        const entries = children.map(child=>this.any(child))

        const width = element.props.width ?? entries.reduce((sum, entry) => sum + entry.width, 0)
        const height = element.props.height ?? entries.reduce((max, entry) => Math.max(max, entry.height), 0)

        for(let i=0; i < entries.length; i++) {
            const entry = entries[i]
            const xx = width/(children.length+1)*i
            const yy = height/2 - entry.height/2
            entry.x = xx
            entry.y = yy
        }

        simple.width = width
        simple.height = height
        simple.childs = entries

        return simple
    }

    private col(element: RemoteUIElement) {
        const simple = this.base(element)

        const children = element.children ?? []
        const entries = children.map(child=>this.any(child))

        const width = element.props.width ?? entries.reduce((max, entry) => Math.max(max, entry.width), 0)
        const height = element.props.height ?? entries.reduce((sum, entry) => sum + entry.height, 0)

        for(let i=0; i < entries.length; i++) {
            const entry = entries[i]
            const xx = width/2 - entry.width/2
            const yy = height/(children.length+1)*i
            entry.x = xx
            entry.y = yy
        }

        simple.width = width
        simple.height = height
        simple.childs = entries

        return simple
    }

    private layout(element: RemoteUIBuilderEntry) {
        if(element.childs) {
            for(const child of element.childs) {
                child.x += element.x
                child.y += element.y
                this.layout(child)
            }
        }
    }

    get(name: string): RemoteUIBuilderEntry | undefined {
        return this.#maps.get(name)
    }

}