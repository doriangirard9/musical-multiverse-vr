import { Observable, Scene } from "@babylonjs/core"
import { Button, Container, Image, InputText, Rectangle, ScrollViewer, StackPanel, TextBlock, VirtualKeyboard } from "@babylonjs/gui"
import { Node3dManager } from "../app/Node3dManager"
import { AbstractMenu } from "./AbstractMenu"
import { Node3DFactory } from "../node3d/Node3D"
import { Visualizer } from "@magenta/music"

export class ShopMenu extends AbstractMenu {

    // Guard against double-spawn: the item button can receive pointer-up more
    // than once (both controllers / event re-dispatch) → spawned the node twice.
    // Allow at most one spawn per shop opening; reset in show().
    private spawnedThisOpen = false
    readonly onItemSelected = new Observable<string>()
    readonly onNavigationSelected = new Observable<{ level: "menu" | "submenu", label: string }>()

    constructor(
        scene: Scene,
        renderScene: Scene,
        private readonly allowedKinds?: ReadonlySet<string>,
    ) {
        super(scene, renderScene)

        this.initPanel("shop_menu", 2, 1, 1024)
        this.initLabel("label")
        
        // Use arrow functions to capture 'this'

        // All [kind, factory] entries, populated once the factories load. Used
        // by the search bar to filter across every category at once.
        let allEntries: [string,Node3DFactory<any,any>][] = []
        // Kinds of the currently selected category, restored when search clears.
        let categoryKinds: string[] = []

        // Item List
        const items = new Container()

        const setItems = async(kinds: string[]) => {
            items.clearControls()
            const list = await this.createItemList(4, kinds)
            this.place(list, 0, 0, 100, 100)
            items.addControl(list)
        }

        // ── Search: filter all kinds by label / kind / tag as the user types ──
        const search = new InputText()
        search.color = "white"
        search.background = "rgb(0,0,0,0.6)"
        search.focusedBackground = "rgb(0,0,0,0.85)"
        search.placeholderText = "Search instruments…"
        search.placeholderColor = "#9fb4bd"
        search.fontSize = 26
        search.text = ""

        const runSearch = (raw: string) => {
            const q = raw.trim().toLowerCase()
            if (!q) { setItems(categoryKinds); return }
            const matches = allEntries
                .filter(([kind,factory]) =>
                    kind?.toLowerCase().includes(q) ||
                    factory.label.toLowerCase().includes(q) ||
                    factory.description.toLowerCase().includes(q) ||
                    factory.tags.some(t => t.toLowerCase().includes(q)))
                .map(entry => entry[0])
            setItems(matches)
        }

        // Overlay virtual keyboard (VR has no system keyboard for canvas inputs).
        const keyboard = VirtualKeyboard.CreateDefaultLayout()
        keyboard.width = "100%"
        keyboard.connect(search)

        // Keyboard is shown while editing, hidden once the search is "submitted"
        // (Enter or the Done button) so the results fill the panel. Tapping the
        // field again brings it back. `kbDismissed` lets a non-empty query keep
        // the keyboard hidden after submit, while still guarding against a
        // virtual key-press momentarily blurring the field mid-typing.
        let searchFocused = false
        let kbDismissed = false
        const kbRow = new Rectangle()
        kbRow.background = "rgb(8,12,16,0.96)"
        kbRow.thickness = 0
        kbRow.isVisible = false
        const updateKbVisible = () => {
            kbRow.isVisible = (searchFocused || search.text.length > 0) && !kbDismissed
        }
        const dismissKeyboard = () => { kbDismissed = true; updateKbVisible() }

        search.onFocusObservable.add(() => { searchFocused = true; kbDismissed = false; updateKbVisible() })
        search.onBlurObservable.add(() => { searchFocused = false; updateKbVisible() })
        // Tapping the field re-opens the keyboard even if it was dismissed.
        search.onPointerDownObservable.add(() => { kbDismissed = false; updateKbVisible() })
        // Enter (hardware keyboard / desktop) submits → hide keyboard, keep query.
        search.onKeyboardEventProcessedObservable.add((evt) => {
            if (evt.key === "Enter") dismissKeyboard()
        })

        // Debounce the actual filtering so fast typing doesn't rebuild the grid
        // (and lazily render thumbnails) on every keystroke.
        let searchTimer: ReturnType<typeof setTimeout> | undefined
        search.onTextChangedObservable.add(() => {
            updateKbVisible()
            clearTimeout(searchTimer)
            searchTimer = setTimeout(() => runSearch(search.text), 140)
        })

        // Done: hide the keyboard without clearing the query (VR has no Enter key).
        const doneBtn = Button.CreateSimpleButton("search_done", "Done")
        doneBtn.color = "white"
        doneBtn.background = "rgb(20,70,40,0.7)"
        doneBtn.onPointerUpObservable.add(() => dismissKeyboard())

        const clearBtn = Button.CreateSimpleButton("search_clear", "✕")
        clearBtn.color = "white"
        clearBtn.background = "rgb(90,20,20,0.7)"
        clearBtn.onPointerUpObservable.add(() => { search.text = "" })


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
                        this.onNavigationSelected.notifyObservers({ level: "submenu", label })
                        setSubMenu(label, submenus)
                        categoryKinds = kinds
                        if (search.text) search.text = ""   // leave search mode
                        setItems(kinds)
                    }
                }))
            )
            if (options.length === 1) { categoryKinds = options[0][1]; setItems(options[0][1]) }
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
                            this.onNavigationSelected.notifyObservers({ level: "menu", label })
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

        // ── Layout ─────────────────────────────────────────────────────────────
        // Search row (input + clear), category bar, item body, then the keyboard
        // as an overlay over the lower body (only visible while searching).
        const searchRow = this.rect()
        this.place(searchRow, 0, 0, 100, 9)
        this.texture.addControl(searchRow)
        searchRow.addControl(search)
        this.place(search, 1, 0, 72, 100)
        searchRow.addControl(doneBtn)
        this.place(doneBtn, 74, 0, 12, 100)
        searchRow.addControl(clearBtn)
        this.place(clearBtn, 87, 0, 12, 100)

        const topbar = this.rect()
        this.place(topbar, 0, 9, 100, 14)
        this.texture.addControl(topbar)

        const body = this.rect()
        this.place(body, 0, 23, 100, 77)
        this.texture.addControl(body)

        body.addControl(items)
        this.place(items, 0, 0, 65, 100)

        body.addControl(clipboard)
        this.place(clipboard, 65, 0, 35, 100)

        topbar.addControl(menu)
        this.place(menu, 0, 0, 100, 50)

        topbar.addControl(submenu)
        this.place(submenu, 0, 50, 100, 50)

        // Keyboard overlay — added last so it renders on top of the body.
        this.texture.addControl(kbRow)
        this.place(kbRow, 0, 52, 100, 48)
        kbRow.addControl(keyboard)
        this.place(keyboard, 1, 2, 98, 96)

            // Init menu
            ; (async () => {
                const builder = Node3dManager.getInstance().builder
                const kinds = this.allowedKinds
                    ? builder.FACTORY_KINDS.filter(kind => this.allowedKinds!.has(kind))
                    : builder.FACTORY_KINDS
                

                const entries = await (async()=>{
                    const promises = kinds.map(kind => builder.getFactory(kind).then(it=>[kind,it] as [string,Node3DFactory<any,any>|null]))
                    const factories = (await Promise.all(promises))
                        .filter(([_,factory]) => factory != null) as [string,Node3DFactory<any,any>][]
                    return factories
                })();

                allEntries = entries

                const menus = {
                    Video: {
                        Generator: [],
                        Effect: [],
                        Other: [],
                    },
                    Audio: {
                        Generator: [],
                        Effect: [],
                        Visualizer: [],
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


                for (const [kind,{tags}] of entries) {
                                    console.log("::", kind, tags)

                    const target = [] as string[][]

                    if (tags.includes("consumer") && !tags.includes("visualizer")) target.push(menus.Output.Output)

                    if (tags.includes("automation")) target.push(menus.Automation.Automation)

                    if (tags.includes("instrument")) target.push(menus.MIDI.Instrument)

                    if (tags.includes("midi")) {
                        if (tags.includes("generator")) target.push(menus.MIDI.Generator)
                        else if (tags.includes("instrument")) target.push(menus.MIDI.Instrument)
                        else target.push(menus.MIDI.Other)
                    }

                    if (tags.includes("audio")) {
                        if (tags.includes("generator")) target.push(menus.Audio.Generator)
                        else if (tags.includes("visualizer")) target.push(menus.Audio.Visualizer)
                        else if (tags.includes("effect")) target.push(menus.Audio.Effect)
                        else target.push(menus.Audio.Other)
                    }

                    if (tags.includes("video")) {
                        if (tags.includes("generator")) target.push(menus.Video.Generator)
                        else if (tags.includes("effect")) target.push(menus.Video.Effect)
                        else target.push(menus.Video.Other)
                    }

                    if (target.length === 0) target.push(menus.Other.Other)

                    new Set(target).forEach(t => t.push(kind))
                }

                const visibleMenus = Object.fromEntries(
                    Object.entries(menus)
                        .map(([menuLabel, submenus]) => [
                            menuLabel,
                            Object.fromEntries(
                                Object.entries(submenus).filter(([, menuKinds]) => menuKinds.length > 0)
                            ),
                        ])
                        .filter(([, submenus]) => Object.keys(submenus).length > 0)
                )
                setMenu("", visibleMenus)
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
            try {
                const kind = await navigator.clipboard.readText()
                const item = await this.createItem(kind)
                if (item) {
                    item.width = "300px"
                    item.height = "300px"
                    container.addControl(item)
                }
            } catch (error) {
                console.warn('[ShopMenu] Clipboard access denied:', error)
                const errorText = new TextBlock("clipboard_error", "Clipboard access not available")
                errorText.color = "white"
                errorText.fontSize = 18
                container.addControl(errorText)
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
        this.scrollViewer = scroll   // enable joystick scrolling (latest item list)

        const stack = Array.from({ length: columns }, (_, i) => {
            const stack = new StackPanel()
            scroll.addControl(stack)
            stack.width = (90 / columns) + "%"
            stack.horizontalAlignment = StackPanel.HORIZONTAL_ALIGNMENT_LEFT
            stack.left = `${i * (90 / columns) + 5}%`
            return stack
        })

        Promise.all(kinds.map(async kind=>{
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
        const entry = await Node3dManager.getInstance().builder.getFactory(kind)
        if (!entry) return

        const thumbnailUrl = Node3dManager.getInstance().builder.getThumbnail(kind)
        const previewFrame = new Rectangle("thumb_frame")
        const uiThumbnail = new TextBlock("thumb", entry.tags.includes("midi") ? "MIDI" : entry.tags.includes("audio") ? "AUDIO" : entry.tags.includes("video") ? "VIDEO" : "NODE")
        const uiPreview = new Image("thumb_preview")
        const uiName = new TextBlock("name", entry.label)

        const container = new Button("container")
        container.thickness = 1
        container.cornerRadius = 18
        container.color = "rgba(255,255,255,0.16)"
        container.background = "rgba(255,255,255,0.04)"
        container.pointerEnterAnimation = () => {
            container.background = "rgba(255,255,255,0.16)"
            container.color = "rgba(86,214,201,0.9)"
            this.label!.set([
                { content: entry.label },
                { content: entry.description, size: .5 },
                { content: entry.tags.join(", "), size: .4, color: "#ffffff9d" },
            ])
            this.label!.show()
            this.label!.updatePosition()
        }
        container.pointerOutAnimation = () => {
            container.background = "rgba(255,255,255,0.04)"
            container.color = "rgba(255,255,255,0.16)"
            this.label!.hide()
            this.label!.updatePosition()
        }
        container.onPointerUpObservable.add(()=>{
            if (this.spawnedThisOpen) return   // ignore duplicate pointer-up events
            this.spawnedThisOpen = true
            this.onItemSelected.notifyObservers(kind)
            this.hide()
            Node3dManager.getInstance().addNode3d(kind, this._plane.absolutePosition.clone())
        })

        container.addControl(previewFrame)
        previewFrame.width = "74%"
        previewFrame.height = "66%"
        previewFrame.top = "-8%"
        previewFrame.thickness = 1
        previewFrame.cornerRadius = 16
        previewFrame.color = "rgba(255,255,255,0.12)"
        previewFrame.background = "rgba(4,10,14,0.58)"

        previewFrame.addControl(uiPreview)
        uiPreview.width = "100%"
        uiPreview.height = "100%"
        uiPreview.stretch = Image.STRETCH_UNIFORM
        uiPreview.isVisible = false

        previewFrame.addControl(uiThumbnail)
        uiThumbnail.width = "70%"
        uiThumbnail.height = "70%"
        uiThumbnail.color = "white"
        uiThumbnail.fontSize = 22
        uiThumbnail.textHorizontalAlignment = TextBlock.HORIZONTAL_ALIGNMENT_CENTER
        uiThumbnail.textVerticalAlignment = TextBlock.VERTICAL_ALIGNMENT_CENTER

        container.addControl(uiName)
        uiName.verticalAlignment = TextBlock.VERTICAL_ALIGNMENT_BOTTOM
        uiName.color = "white"
        uiName.fontSize = 14
        uiName.textWrapping = true
        container.width = "100%"
        uiName.height = "26%"

        void thumbnailUrl.then(result => {
            if (!result?.url) return
            uiPreview.source = result.url
            uiPreview.isVisible = true
            uiThumbnail.isVisible = false
        }).catch(() => {
            uiPreview.isVisible = false
            uiThumbnail.isVisible = true
        })

        return container
    }

    override show() {
        super.show()
        this.spawnedThisOpen = false   // allow one spawn per opening
        this.updateClipboard()
    }

}
