import { Color3 } from "@babylonjs/core"


export class RandomUtils{

    private constructor(){}


    static randomID(complexity: number=8): string{
        let ret = ""
        for(let i=0; i<complexity; i++) ret += Math.floor(Math.random()*16*16*16).toString(16)
        return ret
    }

    static randomName(): string{
        let result = ""

        // Name
        const syllables = ["ka","lo","mi","ra","su","te","na","vi","do","fa","ze","xi"]
        const count = Math.floor(Math.random()*3)+1
        for(let i=0; i<count; i++) result += syllables[Math.floor(Math.random()*syllables.length)]
        result = result.charAt(0).toUpperCase() + result.slice(1)

        // Connector
        result += [" the "," of the "," "][Math.floor(Math.random()*3)]

        // Adjective
        result += ["Brave","Big","Silent","Mighty", "Fast","Little", "Wise", "Happy", "Sad"][Math.floor(Math.random()*9)]

        result += " "

        // Noun
        result += ["Dragon","Phoenix","Tiger","Wolf","Bear","Eagle","Shark","Lion"][Math.floor(Math.random()*8)]

        return result
    }

    static randomColor(): Color3{
        const hue = Math.random()*360
        const saturation = 0.5 + Math.random()*0.5
        const value = 0.5 + Math.random()*0.5
        return Color3.FromHSV(hue, saturation, value)
    }

}