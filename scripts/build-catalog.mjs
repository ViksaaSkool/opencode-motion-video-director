/**
 * Build the HTTP skills catalog (GitHub Pages) from the bundled skill.
 *
 * Layout on the site (per https://opencode.ai/docs/skills#catalogs):
 *   /index.json                          ← the catalog
 *   /motion-video-director/<file>        ← each file listed in the entry
 *
 * The entry `version` is the package version — bump it so clients refresh.
 */
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"))
const skillDir = join(repoRoot, "skill", "motion-video-director")
const outDir = join(repoRoot, "catalog")
const name = "motion-video-director"

rmSync(outDir, { recursive: true, force: true })
mkdirSync(join(outDir, name), { recursive: true })

// Every file under skill/motion-video-director, as relative POSIX paths.
const files = []
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full)
    else files.push(relative(skillDir, full).split("\\").join("/"))
  }
}
walk(skillDir)

for (const file of files) {
  const dest = join(outDir, name, file)
  mkdirSync(join(dest, ".."), { recursive: true })
  cpSync(join(skillDir, file), dest)
}

const index = {
  skills: [
    {
      name,
      version: pkg.version,
      files,
    },
  ],
}
writeFileSync(join(outDir, "index.json"), JSON.stringify(index, null, 2) + "\n")

console.log(`catalog built: ${outDir}`)
console.log(`  entry: ${name} v${pkg.version} (${files.length} files)`)
for (const f of files) console.log(`   - ${f}`)
