/**
 * Declarative bundle of effects mounted on a target. Each entry maps a
 * registered effect id to its construction parameters. Effects own their
 * own animation; this profile carries no orchestration.
 */
export interface EffectProfile {
    readonly id: string
    readonly effects: Readonly<Record<string, Record<string, unknown>>>
}
