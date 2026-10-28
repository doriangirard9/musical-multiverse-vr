// Starts the server and the client together, reachable from the other devices of the local network.
//
// Every IPv4 address of this machine is authorized by the server, so it works whichever network the
// headset or the phone is on (wifi, the Windows hotspot, ...) without a script per address.
import { spawn } from "node:child_process"
import { networkInterfaces } from "node:os"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const PORT = 5173

const addresses = Object.values(networkInterfaces())
    .flat()
    .filter(entry => entry && entry.family === "IPv4" && !entry.internal)
    .map(entry => entry.address)

if (addresses.length === 0) console.warn("No local network address found, only localhost will work.")

const origins = ["localhost", ...addresses].map(host => `https://${host}:${PORT}`)

console.log("Open the client at:")
for (const origin of origins) console.log(`    ${origin}`)
console.log()

const child = spawn("npm run all", {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, AUTHORIZED_ORIGINS: origins.join(",") },
})
child.on("exit", code => process.exit(code ?? 0))
