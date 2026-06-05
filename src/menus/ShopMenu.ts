import { Scene } from "@babylonjs/core"
import { Button, Container, Image, Rectangle, ScrollViewer, StackPanel, TextBlock } from "@babylonjs/gui"
import { Node3dManager } from "../app/Node3dManager"
import { AbstractMenu } from "./AbstractMenu"

export class ShopMenu extends AbstractMenu {

    constructor(
        scene: Scene,
        renderScene: Scene,
    ) {
        super(scene, renderScene)

        this.initPanel("shop_menu", 2, 1, 1024)
        this.initLabel("label")
        
        // Use arrow functions to capture 'this'
        
        // Item List
        const items = new Container()

        const setItems = (kinds: string[]) => {
            items.clearControls()
            const list = this.createItemList(4, kinds)
            this.place(list, 0, 0, 100, 100)
            items.addControl(list)
        }


        // Sub menu
        const submenu = new Container()

        const setSubMenu = (selection: string, submenus: Record<string, string[]>) => {
            const options = Object.entries(submenus)
            if (options.length === 1) selection = options[0][0]

            submenu.clearControls()
            const buttons = this.createButtons(
                options.map(([label, kinds]) => ({
                    label,
                    selected: label === selection,
                    action: () => {
                        setSubMenu(label, submenus)
                        setItems(kinds)
                    }
                }))
            )
            if (options.length === 1) setItems(options[0][1])
            submenu.addControl(buttons)
            buttons.horizontalAlignment = StackPanel.HORIZONTAL_ALIGNMENT_CENTER
            buttons.height = "100%"
        }


        // Menu
        const menu = new Container()

        const setMenu = (selection: string, menus: Record<string, Record<string, string[]>>) => {
            menu.clearControls()
            const buttons = this.createButtons(
                Object.entries(menus)
                    .map(([label, submenus]) => ({
                        label,
                        selected: label === selection,
                        action: () => {
                            setMenu(label, menus)
                            setSubMenu("", submenus)
                        }
                    }))
            )
            menu.addControl(buttons)
            buttons.horizontalAlignment = StackPanel.HORIZONTAL_ALIGNMENT_CENTER
            buttons.height = "100%"
        }


        // Clipboard
        const clipboard = this.createClipboard()

        const topbar = this.rect()
        this.place(topbar, 0, 0, 100, 15)
        this.texture.addControl(topbar)

        const body = this.rect()
        this.place(body, 0, 15, 100, 85)
        this.texture.addControl(body)

        body.addControl(items)
        this.place(items, 0, 0, 65, 100)

        body.addControl(clipboard)
        this.place(clipboard, 65, 0, 35, 100)

        topbar.addControl(menu)
        this.place(menu, 0, 0, 100, 50)

        topbar.addControl(submenu)
        this.place(submenu, 0, 50, 100, 50)

            // Init menu
            ; (async () => {
                const builder = Node3dManager.getInstance().builder
                const kinds = builder.FACTORY_KINDS
                const factories = (await Promise.all(kinds.map(async kind => {
                    const factory = await builder.getFactory(kind)
                    if (factory == null) return null
                    else return [kind, factory] as const
                })))
                    .filter(it => it != null)

                const menus = {
                    Video: {
                        Generator: [],
                        Effect: [],
                        Other: [],
                    },
                    Audio: {
                        Generator: [],
                        Effect: [],
                        Other: [],
                    },
                    MIDI: {
                        Generator: [],
                        Instrument: [],
                        Other: [],
                    },
                    Automation: {
                        Automation: [],
                    },
                    Other: {
                        Other: [],
                    },
                    Output: {
                        Output: []
                    },
                }

                for (const [kind, factory] of factories) {
                    const target = [] as string[][]

                    console.log(kind, factory.tags)

                    if (factory.tags.includes("consumer")) target.push(menus.Output.Output)

                    if (factory.tags.includes("automation")) target.push(menus.Automation.Automation)

                    if (factory.tags.includes("midi")) {
                        if (factory.tags.includes("generator")) target.push(menus.MIDI.Generator)
                        else if (factory.tags.includes("instrument")) target.push(menus.MIDI.Instrument)
                        else target.push(menus.MIDI.Other)
                    }
                    else if (factory.tags.includes("audio")) {
                        if (factory.tags.includes("generator")) target.push(menus.Audio.Generator)
                        else if (factory.tags.includes("effect")) target.push(menus.Audio.Effect)
                        else target.push(menus.Audio.Other)
                    }
                    else if (factory.tags.includes("video")) {
                        if (factory.tags.includes("generator")) target.push(menus.Video.Generator)
                        else if (factory.tags.includes("effect")) target.push(menus.Video.Effect)
                        else target.push(menus.Video.Other)
                    }
                    console.log(target)
                    if (target.length === 0) target.push(menus.Other.Other)

                    target.forEach(t => t.push(kind))
                }
                setMenu("", menus)
            })()
    }

    private createButtons(buttons: { label: string, selected: boolean, action: () => void }[] = []) {
        const list = new StackPanel()
        list.isVertical = false
        for (const { label, selected, action } of buttons) {
            const button = Button.CreateSimpleButton("button", label)
            button.color = "white"
            button.width = "150px"
            if (selected) button.background = "rgb(255,255,255,0.5)"
            else button.onPointerUpObservable.add(action)
            list.addControl(button)
        }
        return list
    }

    private updateClipboard: () => void = () => { }

    private createClipboard() {
        const container = new Rectangle()
        this.updateClipboard = async () => {
            container.clearControls()
            const kind = await navigator.clipboard.readText()
            const item = await this.createItem(kind)
            console.log("Clipboard updated:", kind, item)
            if (item) {
                item.width = "300px"
                item.height = "300px"
                container.addControl(item)
            }
        }
        this.updateClipboard()
        return container
    }

    private createItemList(columns: number, kinds: string[]) {
        const root = new Rectangle()

        const scroll = new ScrollViewer()
        scroll.width = "100%"
        scroll.height = "100%"
        root.addControl(scroll)

        const stack = Array.from({ length: columns }, (_, i) => {
            const stack = new StackPanel()
            scroll.addControl(stack)
            stack.width = (90 / columns) + "%"
            stack.horizontalAlignment = StackPanel.HORIZONTAL_ALIGNMENT_LEFT
            stack.left = `${i * (90 / columns) + 5}%`
            return stack
        })

        Promise.all(kinds.map(async kind => {
            const item = await this.createItem(kind)
            if (!item) return
            item.width = "150px"
            item.height = "150px"

            let min = Infinity
            let index = 0
            for (let i = 0; i < stack.length; i++) {
                if (stack[i].children.length < min) {
                    min = stack[i].children.length
                    index = i
                }
            }
            stack[index].addControl(item)
        }))

        return root
    }

    private async createItem(kind: string) {
        const factory = await Node3dManager.getInstance().builder.getFactory(kind)
        if (!factory) return

        const url = await Node3dManager.getInstance().builder.getThumbnail(kind).then(it => it?.url)

        const uiThumbnail = new Image("thumb", url)
        const uiName = new TextBlock("name", factory.label)

        const container = new Button("container")
        container.pointerEnterAnimation = () => {
            container.background = "rgb(255,255,255,0.2)"
            this.label!.set([
                { content: factory.label },
                { content: factory.description, size: .5 },
                { content: factory.tags.join(", "), size: .4, color: "#ffffff9d" },
            ])
            this.label!.show()
            this.label!.updatePosition()
        }
        container.pointerOutAnimation = () => {
            container.background = "rgb(0,0,0,0)"
            this.label!.hide()
            this.label!.updatePosition()
        }
        container.pointerUpAnimation = () => {
            this.hide()
            Node3dManager.getInstance().addNode3d(kind, this.plane.absolutePosition.clone())
        }

        container.addControl(uiThumbnail)
        uiThumbnail.width = "70%"
        uiThumbnail.height = "70%"

        container.addControl(uiName)
        uiName.verticalAlignment = TextBlock.VERTICAL_ALIGNMENT_BOTTOM
        uiName.color = "white"
        uiName.fontSize = 14
        container.width = "100%"
        uiName.height = "20%"

        return container
    }

    override show() {
        super.show()
        this.updateClipboard()
    }

}

