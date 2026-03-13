import type { WamEvent } from "@webaudiomodules/api"
import type { NoteDefinition, ParameterDefinition } from "./FunctionAPI"
import type { RemoteUIElement } from "./RemoteUI"


export interface FunctionKernel {

    highlight(name: string, value: boolean): void

    emitEvents(...event: WamEvent[]): void

    setNotelist(noteList?: NoteDefinition[]): void

    registerParameters(parameters: ParameterDefinition[]): void

    registerUI(element: RemoteUIElement): void

    setAdditionalState(name: string, value: any): void

    getAdditionalState(name: string): any

    readonly tempo: number

    readonly parameterIds: string[]

    readonly currentTime: number

    getParameterState(id: string): number

}