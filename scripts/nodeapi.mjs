// Generates the declarations needed to write a Node3D outside the project:
//   nodeapi/modules/**    one .d.ts per module, reachable from node3d/Node3D.d.ts
//   nodeapi/node3dapi.d.ts  the same, merged into a single file
//
// 1. tsc emits a .d.ts for every .ts reachable from src/node3d/Node3D.d.ts, @internal stripped.
//    tsc keeps emitting when a file has type errors, so an error in a file outside the API
//    (a Node3D implementation for instance) does not block the generation.
// 2. The .d.ts sources of src/ are copied next to them, since tsc does not emit those.
// 3. The tree is pruned to what Node3D.d.ts imports, transitively, then cleaned up.
// 4. dts-bundle-generator merges the tree into one file.
//    Packages from node_modules (@babylonjs/core, ...) stay as imports.
import { execSync, spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const SRC = join(ROOT, "src")
const MODULES = join(ROOT, "nodeapi", "modules")
const ENTRY = join(MODULES, "node3d", "Node3D.d.ts")
const OUT = join(ROOT, "nodeapi", "node3dapi.d.ts")
const bin = name => join(ROOT, "node_modules", ".bin", process.platform === "win32" ? name + ".cmd" : name)

function* walk(dir) {
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry)
        if (statSync(path).isDirectory()) yield* walk(path)
        else if (path.endsWith(".d.ts")) yield path
    }
}

rmSync(join(ROOT, "nodeapi"), { recursive: true, force: true })
mkdirSync(MODULES, { recursive: true })

// 1. Emit declarations.
console.log("Emitting declarations...")
const tsc = spawnSync(bin("tsc"), ["-p", "tsconfig.nodeapi.json"], { cwd: ROOT, encoding: "utf8", shell: true })
if (tsc.status !== 0) console.warn(tsc.stdout.trim().split("\n").length + " type error(s) in the app, ignored:\n" + tsc.stdout)

// 2. Copy the .d.ts sources.
for (const file of walk(SRC)) {
    const target = join(MODULES, relative(SRC, file))
    mkdirSync(dirname(target), { recursive: true })
    cpSync(file, target)
}

// 3. Prune to the files Node3D.d.ts reaches through its imports, and clean them up.
const SPECIFIER = /(?:from\s*|import\s*\(\s*|import\s+)(["'])(\.[^"']+)\1/g
function resolveSpecifier(from, spec) {
    const base = resolve(dirname(from), spec.replace(/\.(d\.)?ts$/, ""))
    for (const candidate of [base + ".d.ts", join(base, "index.d.ts")]) if (existsSync(candidate)) return candidate
    console.warn(`Unresolved import ${spec} in ${relative(ROOT, from)}`)
}
const kept = new Set()
const queue = [ENTRY]
while (queue.length > 0) {
    const file = queue.pop()
    if (kept.has(file)) continue
    kept.add(file)
    for (const [, , spec] of readFileSync(file, "utf8").matchAll(SPECIFIER)) {
        const target = resolveSpecifier(file, spec)
        if (target) queue.push(target)
    }
}
for (const file of [...walk(MODULES)]) if (!kept.has(file)) rmSync(file)
function pruneEmptyDirs(dir) {
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry)
        if (statSync(path).isDirectory()) pruneEmptyDirs(path)
    }
    if (readdirSync(dir).length === 0) rmdirSync(dir)
}
pruneEmptyDirs(MODULES)

for (const file of kept) {
    let source = readFileSync(file, "utf8")
    // Private members say nothing to a consumer.
    source = source.replace(/^[ \t]*(private\s+[^\n]*|#private;)\n/gm, "")
    // `implements X` where X was an @internal interface, removed by stripInternal.
    source = source.replace(/\s+implements\s+([\w$.,\s]+?)(?=\s*\{)/g, (whole, list) => {
        const remaining = list.split(",").map(s => s.trim()).filter(name =>
            new RegExp(`\\b(interface|class|type)\\s+${name}\\b|\\bimport\\b[^\\n]*\\b${name.split(".")[0]}\\b`).test(source))
        return remaining.length === 0 ? "" : ` implements ${remaining.join(", ")}`
    })
    // Members named with a leading underscore are for the host, not for a Node3D.
    // Removed on the AST since a signature can span several lines.
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
    const ranges = []
    const visit = node => {
        if ((ts.isClassLike(node) || ts.isInterfaceDeclaration(node) || ts.isTypeLiteralNode(node)) && node.members)
            for (const member of node.members)
                if (member.name && ts.isIdentifier(member.name) && member.name.text.startsWith("_"))
                    ranges.push([member.getFullStart(), member.getEnd()])
        ts.forEachChild(node, visit)
    }
    visit(ast)
    for (const [start, end] of ranges.sort((a, b) => b[0] - a[0])) source = source.slice(0, start) + source.slice(end)
    writeFileSync(file, source)
}

// No bundler resolves `typeof import("./x")` when x is a local module: dts-bundle-generator drops
// it silently and rollup-plugin-dts crashes on it. Each one is replaced by an interface listing
// the value exports of that module, which is all `typeof import()` gives access to anyway.
const program = ts.createProgram([...kept], { ...ts.parseJsonConfigFileContent(ts.readConfigFile(join(ROOT, "tsconfig.nodeapi.json"), ts.sys.readFile).config, ts.sys, ROOT).options, noEmit: true })
const checker = program.getTypeChecker()
const importPath = (from, to) => "./" + relative(dirname(from), to).replaceAll("\\", "/").replace(/\.d\.ts$/, "")
const moduleInterfaces = new Map()
function moduleInterfaceOf(target) {
    if (moduleInterfaces.has(target)) return moduleInterfaces.get(target)
    const moduleSymbol = checker.getSymbolAtLocation(program.getSourceFile(target))
    const values = checker.getExportsOfModule(moduleSymbol)
        .filter(symbol => (checker.getMergedSymbol(symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol).flags & ts.SymbolFlags.Value) !== 0)
        .map(symbol => symbol.name)
    const stem = target.endsWith("index.d.ts") ? dirname(target) : target.replace(/\.d\.ts$/, "")
    const name = stem.split(/[\\/]/).pop().replace(/^./, c => c.toUpperCase()) + "Module"
    const path = join(dirname(target), name + ".d.ts")
    writeFileSync(path, [
        `import { ${values.join(", ")} } from "${importPath(path, target)}"`,
        ``,
        `export interface ${name} {`,
        ...values.map(v => `    readonly ${v}: typeof ${v}`),
        `}`,
        ``,
    ].join("\n"))
    moduleInterfaces.set(target, { name, path })
    return { name, path }
}
for (const file of kept) {
    let source = readFileSync(file, "utf8")
    const specs = [...new Set([...source.matchAll(/typeof import\((["']\.[^"']+["'])\)/g)].map(m => m[1]))]
    if (specs.length === 0) continue
    const header = []
    for (const spec of specs) {
        const { name, path } = moduleInterfaceOf(resolveSpecifier(file, spec.slice(1, -1)))
        header.push(`import { ${name} } from "${importPath(file, path)}"`)
        source = source.replaceAll(`typeof import(${spec})`, name)
    }
    writeFileSync(file, header.join("\n") + "\n" + source)
}
console.log(`${kept.size} declaration files in ${relative(ROOT, MODULES)}`)

// 4. Bundle from the declaration tree.
const tsconfig = join(ROOT, "nodeapi", "tsconfig.json")
writeFileSync(tsconfig, JSON.stringify({
    extends: "../tsconfig.json",
    compilerOptions: { types: ["vite/client", "node"], strict: false, noUnusedLocals: false, noUnusedParameters: false },
    include: ["modules/**/*.d.ts"],
}, null, 2))
console.log("Bundling...")
execSync(`"${bin("dts-bundle-generator")}" -o "${OUT}" --project "${tsconfig}" --no-check "${ENTRY}"`, { cwd: ROOT, stdio: "inherit", shell: true })
rmSync(tsconfig)
if (!existsSync(OUT)) process.exit(1)
console.log("Written " + relative(ROOT, OUT))
