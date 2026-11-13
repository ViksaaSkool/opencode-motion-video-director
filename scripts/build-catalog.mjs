/**
 * Build the HTTP skills catalog (GitHub Pages) from the bundled skill.
 *
 * Layout on the site (per https://opencode.ai/docs/skills#catalogs):
 *   /index.json                          ← the catalog (machine-readable, contract — do not change)
 *   /index.html                          ← human-readable landing page (new; clients never fetch this)
 *   /motion-video-director/<file>        ← each file listed in the entry
 *
 * The entry `version` is the package version — bump it so clients refresh.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
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

// Hero graphic for the landing page (source: art/, optimized JPEG kept small).
const heroSource = join(repoRoot, "art", "explanation.jpg")
if (!existsSync(heroSource)) {
  throw new Error(`landing-page hero image missing: ${heroSource} — commit the optimized JPEG (converted from art/explanation.png) so CI can build the site`)
}
cpSync(heroSource, join(outDir, "explanation.jpg"))

console.log(`catalog built: ${outDir}`)
console.log(`  entry: ${name} v${pkg.version} (${files.length} files) + index.html`)
for (const f of files) console.log(`   - ${f}`)

/* ---------------------------------- landing page ---------------------------------- */

/** Escape a string for safe interpolation into HTML text/attribute context. */
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/** Skill display name / description from the bundled SKILL.md frontmatter. */
function skillMeta(dir) {
  const raw = readFileSync(join(dir, "SKILL.md"), "utf8")
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)
  const meta = {}
  if (match) {
    for (const line of match[1].split(/\r?\n/)) {
      const m = /^([\w-]+):\s*"?(.*?)"?$/.exec(line)
      if (m) meta[m[1]] = m[2]
    }
  }
  return { title: meta.name || "Motion Video Director", description: meta.description || "" }
}

/** Keep in sync with MCP_CATALOG in src/index.ts and the table in README.md. */
const MCPS = [
  { name: "playwright", key: null },
  { name: "firecrawl", key: "FIRECRAWL_API_KEY" },
  { name: "elevenlabs", key: "ELEVENLABS_API_KEY" },
  { name: "lottiefiles", key: null },
]

function landingPage(pkg, skillName, files) {
  const { title } = skillMeta(join(repoRoot, "skill", skillName))
  const display = files.slice().sort((a, b) => (a === "SKILL.md" ? -1 : b === "SKILL.md" ? 1 : a.localeCompare(b)))
  const fileList = display
    .map((f) => {
      const note = f === "SKILL.md" ? ' <span class="dim">— the skill instructions</span>' : ""
      return `      <li><a href="${skillName}/${escapeHtml(f)}"><code>${escapeHtml(f)}</code></a>${note}</li>`
    })
    .join("\n")
  const mcpRows = MCPS.map(
    (m) => `        <tr><td><code>${m.name}</code></td><td>${m.key ? "yes" : "no"}</td><td>${m.key ? `<code>${m.key}</code>` : "—"}</td></tr>`,
  ).join("\n")
  const built = new Date().toISOString().slice(0, 10)

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — OpenCode plugin</title>
<meta name="description" content="${escapeHtml(pkg.description)}">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: #0d1117; color: #e6edf3;
    font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  main { max-width: 780px; margin: 0 auto; padding: 48px 24px 64px; }
  h1 {
    margin: 0 0 4px; font-size: 2.1rem; line-height: 1.2;
    background: linear-gradient(90deg, #f778ba, #a371f7);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .badge {
    display: inline-block; margin: 0 0 18px; padding: 2px 10px; font-size: .8rem;
    border: 1px solid #30363d; border-radius: 999px; color: #9198a1;
  }
  h2 { font-size: 1.15rem; margin: 40px 0 12px; border-bottom: 1px solid #21262d; padding-bottom: 6px; }
  p.tagline { color: #b6c2cf; margin-top: 0; }
  img.hero {
    display: block; width: 100%; height: auto; margin: 10px 0 4px;
    border: 1px solid #30363d; border-radius: 12px; background: #0a0a0a;
  }
  p.lead { color: #9198a1; }
  pre {
    background: #161b22; border: 1px solid #30363d; border-radius: 8px;
    padding: 14px 16px; overflow-x: auto; font-size: .875rem; line-height: 1.5;
  }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .875em; }
  p code, li code, td code { background: #161b22; border: 1px solid #30363d; border-radius: 5px; padding: 1px 6px; }
  ul.files { list-style: none; padding: 0; margin: 0; }
  ul.files li { padding: 4px 0; border-bottom: 1px solid #21262d; }
  ul.files a { color: #a5b6fc; text-decoration: none; }
  ul.files a:hover { text-decoration: underline; }
  .dim { color: #9198a1; }
  table { border-collapse: collapse; width: 100%; font-size: .925rem; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #21262d; }
  th { color: #9198a1; font-weight: 500; }
  a { color: #a5b6fc; }
  footer { margin-top: 56px; padding-top: 16px; border-top: 1px solid #21262d; color: #9198a1; font-size: .875rem; }
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(title)}</h1>
  <span class="badge">OpenCode plugin &middot; v${escapeHtml(pkg.version)}</span>
  <img class="hero" src="explanation.jpg" width="1672" height="941"
       alt="Video creation workflow: 1 Plan (explain the process and goal) — 2 Input (you provide references and a story) — 3 Voiceover (paste-ready ElevenLabs script, generate the MP3 and return it) — 4 Build (create the video, add assets and sound) — 5 Preview (review and iterate) — 6 Render (export mp4 with ffmpeg and deliver). Tools: SVG, p5, Three.js, GSAP, Motion Canvas, Revideo, ElevenLabs, Firecrawl, Playwright, LottieFiles, Freesound, Pexels/Pixabay, ffmpeg. Use when you ask to make or edit a video, animate, caption, add voiceover, or design sound.">

  <h2>Install</h2>
  <p>Add the plugin to your <code>opencode.json(c)</code>:</p>
  <pre>{ "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-motion-video-director"] }</pre>
  <p>Optionally let it register the recommended MCP servers at runtime (each only when
  its key is set in the project <code>.env</code> or your environment — keys never land in config):</p>
  <pre>{ "$schema": "https://opencode.ai/config.json",
  "plugins": [
    { "package": "opencode-motion-video-director",
      "options": { "mcps": ["playwright", "firecrawl", "elevenlabs", "lottiefiles"] } }
  ] }</pre>
  <p class="lead">Prefer no plugin? The same skill is available as an HTTP skills catalog:</p>
  <pre>{ "$schema": "https://opencode.ai/config.json",
  "skills": ["https://viksaaskool.github.io/opencode-motion-video-director/"] }</pre>

  <h2>What you get</h2>
  <ul>
    <li><strong>The skill</strong> — the full director workflow: preflight, planning, voiceover script for ElevenLabs, code-drawn scenes with fast preview loops, final render &amp; asset/licence logging.</li>
    <li><strong><code>/mvd-setup</code></strong> — in your video project directory, it runs Preflight, walks you through missing tools, creates your gitignored <code>.env</code> key file, and sends the kickoff message.</li>
    <li><strong>MCP auto-setup</strong> — registers the recommended servers behind <code>options.mcps</code>; servers you configured yourself are never touched.</li>
  </ul>

  <h2>Recommended MCPs</h2>
  <table>
    <thead><tr><th>Name</th><th>Needs key</th><th>Key (project <code>.env</code> or environment)</th></tr></thead>
    <tbody>
${mcpRows}
    </tbody>
  </table>

  <h2>Catalog files</h2>
  <p class="lead">What OpenCode fetches from this catalog:</p>
  <ul class="files">
${fileList}
  </ul>

  <footer>
    <a href="${escapeHtml(pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, ""))}">GitHub</a>
    &middot; MIT license &middot; catalog v${escapeHtml(pkg.version)} &middot; built ${built}
  </footer>
</main>
</body>
</html>
`
}

writeFileSync(join(outDir, "index.html"), landingPage(pkg, name, files))
