

export class RandomUtils{

    private constructor(){}


    static randomID(complexity: number=8): string{
        let ret = ""
        for(let i=0; i<complexity; i++) ret += Math.floor(Math.random()*16*16*16).toString(16)
        return ret
    }

}