
export class WaveSimulator {

    private array

    constructor(
        readonly width: number,
        readonly height: number,
        readonly onChange: (x: number, y: number, value: number) => void = () => {}
    ){
        this.array = new Float32Array(width*height)
    }

    set(x: number, y: number, value: number){
        if(x<0 || x>=this.width || y<0 || y>=this.height) return
        this.array[x*this.height+y] = value
        this.onChange(x,y,value)
    }

    get(x: number, y: number){
        if(x<0 || x>=this.width || y<0 || y>=this.height) return 0
        return this.array[x*this.height+y]
    }

    private pointset = new Set<string>()
    private pointset2 = new Set<string>()

    private doUpdate(x: number, y: number, yes: boolean){
        const key = `${x},${y}`
        if(yes){
            this.pointset.add(key)
        } else {
            this.pointset.delete(key)
        }
    }

    update(){
        const temp = this.pointset
        this.pointset = this.pointset2
        this.pointset2 = temp
        this.pointset.clear()

        for(const key of this.pointset2){
            const [x,y] = key.split(",").map(Number)

            // Propagate to neighbors
            for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
                const targetValue = this.get(x+dx,y+dy)
                const myValue = this.get(x,y)
                const addable = Math.min(myValue*0.2, 1-targetValue)
                if(addable > 0.0){
                    this.set(x+dx,y+dy, targetValue+addable)
                    this.doUpdate(x+dx, y+dy, true)

                    const newSelf = myValue - addable
                    if(newSelf > 0.05){
                        this.set(x, y, newSelf)
                        this.doUpdate(x, y, true)
                    }
                    else{
                        this.set(x, y, 0)
                    }
                }
            }
            
        }
    }

    put(x: number, y: number, value: number){
        this.set(x, y, value)
        this.doUpdate(x, y, true)
    }
}