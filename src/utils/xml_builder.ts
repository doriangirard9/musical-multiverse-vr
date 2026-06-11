
export interface XMLBuilderRules<T>{
    create(tag: string): T|null
    setProperty(obj: T, key: string, value: string): void
    addChild(parent: T, child: T): void
}

export function createFromXML<T>(rules: XMLBuilderRules<T>, xml: string): T|null{
    const parser = new DOMParser()
    const doc = parser.parseFromString(xml, "application/xml")
    const root = doc.documentElement
    function createNode(node: Element): T|null{
        const obj = rules.create(node.tagName)
        if(!obj) return null
        for(const attr of node.attributes){
            rules.setProperty(obj, attr.name, attr.value)
        }
        for(const child of node.children){
            const childObj = createNode(child)
            if(childObj) rules.addChild(obj, childObj)
        }
        return obj
    }
    return createNode(root)
}