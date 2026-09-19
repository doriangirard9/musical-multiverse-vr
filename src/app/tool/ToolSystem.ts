import { ControllerInput, InputManager } from "../../xr/inputs"
import { BlocksMenu, BMenuBlock } from "../../menus/BlocksMenu"
import { ARCH_TOOL_KIND, BRICK_TOOL_KIND, FLAIL_TOOL_KIND, FINGER_TOOL_KIND, MAGIC_TOOL_KIND, MAGNET_TOOL_KIND, ToolKind, ToolSlot, PARAMETER_TOOL_KIND, PENCIL_TOOL_KIND, POINTER_TOOL_KIND, CRANE_TOOL_KIND, RAY_TOOL_KIND, SOFT_WAND_TOOL_KIND, SWORD_TOOL_KIND, TWO_WAND_TOOL_KIND, WAND_TOOL_KIND } from "../../tool"
import { MenuSystem } from "../menu/MenuSystem"
import { SceneManager } from "../SceneManager"
import { PickFilter } from "../../xr/inputs/AbstractPointerInput"

/** The width of the selection menu, in grid cells. */
const MENU_WIDTH = 6

/** The side of one kind tile in the selection menu, in grid cells. Tiles wrap into rows. */
const ENTRY_SIDE = 2

/** The height of the scrollable grid of kinds, in grid cells. Longer grids scroll. */
const LIST_HEIGHT = 8

/** The frame and the label of the tile of the kind the hand holds. */
const HELD_COLOR = "#66ff66"

/** The frame and the label of the tile of the kind the other hand holds, between the two. */
const OTHER_HAND_COLOR = "#b8c2ce"

/** The frame and the label of the tiles of the kinds neither hand holds, dim next to the held one. */
const KIND_COLOR = "#8b97a6"

/**
 * The two hands of the user, and the menu used to choose what each of them holds.
 *
 * @remarks
 * Each hand is a {@link ToolSlot} bound to one controller. The X button opens the selection menu of
 * the left hand, the A button the one of the right hand, so the menu always concerns the hand that
 * asked for it. Selecting a kind swaps the tool of that hand alone.
 *
 * The system owns the catalog of the available kinds: a tool file declares its kind, and this
 * class decides which ones the user is offered.
 */
export class ToolSystem {


    /** The kind both hands hold at startup. */
    public static readonly DEFAULT_KIND = POINTER_TOOL_KIND

    /** The left hand of the user. */
    public readonly left: ToolSlot

    /** The right hand of the user. */
    public readonly right: ToolSlot

    constructor(
        readonly scenes: SceneManager,
        readonly inputs: InputManager,
        readonly menus: MenuSystem,
    ){
        const scene = scenes.getScene()

        this.left = new ToolSlot("left", inputs.left, scene, ToolSystem.DEFAULT_KIND)
        this.right = new ToolSlot("right", inputs.right, scene, ToolSystem.DEFAULT_KIND)

        inputs.x_button.onDown.add(() => this.toggleMenu(this.left))
        inputs.a_button.onDown.add(() => this.toggleMenu(this.right))
    }

    /**
     * Give a hand the tool of a kind.
     * @param slot - The hand to change.
     * @param kind - The kind to hold.
     */
    public select(slot: ToolSlot, kind: ToolKind): void {
        slot.select(kind)
    }

    /**
     * The hand holding a controller.
     * @param controller - The controller of one of the two hands.
     * @returns The slot of that hand, or undefined when the controller is not a hand.
     */
    public slotOf(controller: ControllerInput): ToolSlot|undefined {
        if(controller === this.left.controller) return this.left
        if(controller === this.right.controller) return this.right
        return undefined
    }

    /**
     * Give a hand a tool of a kind that is not in the catalog, and keep the way back.
     *
     * @remarks
     * The hand takes back what it held when the returned handle is disposed. The user stays in
     * charge of his hands: choosing another tool in the menu meanwhile drops the equipment, and
     * disposing it then changes nothing.
     *
     * @param controller - The controller of the hand to equip.
     * @param kind - The kind to put in that hand.
     */
    public equip(controller: ControllerInput, kind: ToolKind): {dispose(): void} {
        const slot = this.slotOf(controller)
        if(!slot) return { dispose(){} }

        const previous = slot.kind
        slot.select(kind)

        let equipped = true

        // The user chose something else himself : the hand is not ours anymore.
        const observer = slot.onChange.add(() => {
            if(slot.kind !== kind){
                equipped = false
                observer.remove()
            }
        })

        return {
            dispose(){
                observer.remove()
                if(!equipped) return
                equipped = false
                slot.select(previous)
            }
        }
    }

    /**
     * Restrict what the pointer of a hand can pick, for as long as its current tool is held.
     *
     * @remarks
     * The filter goes on the pointer of that side only, whatever the other hand holds, and is
     * attached to the tool of the hand, not to the hand: it is dropped as soon as the hand takes
     * another tool. Adding the same filter twice changes nothing.
     *
     * @param slot - The hand, or the controller of the hand.
     * @param filter - Refuses the meshes the pointer must pass through.
     */
    public addFilter(slot: ToolSlot|ControllerInput, filter: PickFilter): void {
        this.#slotOf(slot)?.pickFilters.add(filter)
    }

    /**
     * Remove a filter added by {@link addFilter} to a hand.
     * @param slot - The hand, or the controller of the hand.
     * @param filter - The filter to remove. Removing one the hand does not hold changes nothing.
     */
    public removeFilter(slot: ToolSlot|ControllerInput, filter: PickFilter): void {
        this.#slotOf(slot)?.pickFilters.remove(filter)
    }

    /** Does a hand hold a filter? */
    public hasFilter(slot: ToolSlot|ControllerInput, filter: PickFilter): boolean {
        return this.#slotOf(slot)?.pickFilters.has(filter) ?? false
    }

    /** The slot itself, or the slot of a controller. */
    #slotOf(slot: ToolSlot|ControllerInput): ToolSlot|undefined {
        return slot instanceof ToolSlot ? slot : this.slotOf(slot)
    }

    /** The kinds of tool offered to the user, in the order the menu lists them. */
    public get kinds(): readonly ToolKind[] { return ToolSystem.#KINDS }

    /**
     * The kinds the menu of a hand lists: the catalog, and what that hand holds when it comes from
     * elsewhere.
     *
     * @remarks
     * A tool can be put in a hand without passing by the menu, by {@link equip}: a drumstick taken
     * from a kit is not a kind the user may choose, it is a kind the world gave him. Listing it
     * anyway keeps the menu telling the truth about what the hand holds, and leaves the way back
     * visible next to it. It is listed first, so the entry marked as held never hides under a
     * scroll.
     *
     * @param slot - The hand the menu is opened for.
     */
    public kindsFor(slot: ToolSlot): readonly ToolKind[] {
        if(ToolSystem.#KINDS.includes(slot.kind)) return ToolSystem.#KINDS
        return [slot.kind, ...ToolSystem.#KINDS]
    }

    /**
     * Open the selection menu of a hand, or close it when it is the one already open.
     * @param slot - The hand the menu applies to.
     */
    public toggleMenu(slot: ToolSlot): void {
        if(this.#openedFor === slot && this.menus.current_menu === this.#menu){
            this.menus.close()
            return
        }

        this.#menu = this.#createMenu(slot)
        this.#openedFor = slot
        this.menus.open(this.#menu)
    }

    // Instance
    static _instance?: ToolSystem

    static async initialize(...parameters: ConstructorParameters<typeof ToolSystem>){
        this._instance = new ToolSystem(...parameters)
    }

    static getInstance(): ToolSystem {
        if(!this._instance) throw new Error("ToolSystem not initialized. Call initialize() first.")
        return this._instance
    }


    /** The kinds of tool offered to the user. */
    static readonly #KINDS: readonly ToolKind[] = [
        POINTER_TOOL_KIND, MAGNET_TOOL_KIND, BRICK_TOOL_KIND, CRANE_TOOL_KIND, PARAMETER_TOOL_KIND, PENCIL_TOOL_KIND, MAGIC_TOOL_KIND, FINGER_TOOL_KIND, RAY_TOOL_KIND,
        WAND_TOOL_KIND, SOFT_WAND_TOOL_KIND, TWO_WAND_TOOL_KIND, ARCH_TOOL_KIND, FLAIL_TOOL_KIND, SWORD_TOOL_KIND,
    ]

    #menu?: BlocksMenu

    #openedFor?: ToolSlot

    /**
     * The label of a kind in the menu, dotted on the side of each hand holding it.
     *
     * @remarks
     * The dot stands where the hand is: on the left of the name for the left hand, on the right for
     * the right hand, on both sides for a kind the two hands hold at once. So the menu of one hand
     * still tells what the other one is holding, and the two menus read the same way.
     */
    #labelOf(kind: ToolKind): string {
        const left = this.left.kind === kind ? "● " : ""
        const right = this.right.kind === kind ? " ●" : ""
        return `${left}${kind.label}${right}`
    }

    /** The title of the menu of a hand, the arrow pointing to the side of that hand. */
    static #titleOf(slot: ToolSlot): string {
        return slot.side === "left" ? "← Left hand" : "Right hand →"
    }

    /** Build the menu listing every kind of tool, the held one highlighted. */
    #createMenu(slot: ToolSlot): BlocksMenu {
        const entries = this.kindsFor(slot).map(kind => {
            const isHeld = kind === slot.kind
            const isHeldByTheOther = !isHeld && (this.left.kind === kind || this.right.kind === kind)
            return {
                text: this.#labelOf(kind),
                img: kind.thumbnail,
                color: isHeld ? HELD_COLOR : isHeldByTheOther ? OTHER_HAND_COLOR : KIND_COLOR,
                tooltip: [
                    { content: kind.label },
                    { content: kind.description, size: .5 },
                    { content: kind.tags.join(", "), size: .4, color: "#ffffff9d" },
                ],
                width: ENTRY_SIDE,
                height: ENTRY_SIDE,
                onClick: () => {
                    this.select(slot, kind)
                    this.menus.close()
                },
            } as BMenuBlock
        })

        return new BlocksMenu(
            this.scenes.getScene(),
            this.scenes.getUtilityScene(),
            {
                width: MENU_WIDTH,
                items: [
                    { text: ToolSystem.#titleOf(slot), width: MENU_WIDTH, height: 1 },
                    { sub: { width: MENU_WIDTH, items: entries }, width: MENU_WIDTH, height: LIST_HEIGHT },
                ],
            },
        )
    }

}
