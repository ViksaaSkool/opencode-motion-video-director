import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import plugin, { MCP_CATALOG, SKILL_ID, hasEnvKey, parseFrontmatter, readEnvFile, resolveSkillDir } from "../src/index"

const repoRoot = join(import.meta.dir, "..")

describe("bundled skill", () => {
  const skillDir = resolveSkillDir()

  test("SKILL.md exists next to the plugin and frontmatter parses", () => {
    expect(existsSync(skillDir)).toBe(true)
    const raw = readFileSync(join(skillDir, "SKILL.md"), "utf8")
    const { name, description, content } = parseFrontmatter(raw)
    expect(name).toBe("Motion Video Director")
    expect(description).toContain("motion graphics")
    // content must be the body without frontmatter (a leading blank line is fine)
    expect(content.trimStart().startsWith("# Motion Video Director")).toBe(true)
    expect(content).not.toContain("---\nname:")
  })

  test("all helper scripts are bundled", () => {
    for (const script of [
      "preflight.sh",
      "preview.mjs",
      "create_env.sh",
      "normalize_env.py",
      "analyze_ref.sh",
      "with-env.sh",
    ]) {
      expect(existsSync(join(skillDir, "scripts", script))).toBe(true)
    }
  })
})

describe("plugin shape", () => {
  test("defines the server plugin with an id and setup", () => {
    expect(plugin.id).toBe("opencode-motion-video-director")
    expect(typeof plugin.setup).toBe("function")
  })

  test("skill id is kebab-case and matches the bundled directory", () => {
    expect(SKILL_ID).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    expect(resolveSkillDir().endsWith(SKILL_ID)).toBe(true)
  })
})

describe("MCP catalog", () => {
  test("known servers declare their required keys correctly", () => {
    expect(MCP_CATALOG.playwright!.env).toBeUndefined()
    expect(MCP_CATALOG.firecrawl!.env).toBe("FIRECRAWL_API_KEY")
    expect(MCP_CATALOG.elevenlabs!.env).toBe("ELEVENLABS_API_KEY")
    expect(MCP_CATALOG.elevenlabs!.envExtra).toEqual({ ELEVENLABS_MCP_BASE_PATH: "./assets" })
    expect(MCP_CATALOG.lottiefiles!.env).toBeUndefined()
  })

  test("every server command runs through the bundled with-env.sh wrapper", () => {
    const wrapper = join(resolveSkillDir(), "scripts", "with-env.sh")
    expect(existsSync(wrapper)).toBe(true)
    for (const spec of Object.values(MCP_CATALOG)) {
      expect(spec.args.length).toBeGreaterThan(0)
      expect(spec.args[0]).not.toBe("bash") // the wrapper adds bash, not the spec
    }
  })
})

describe("env helpers", () => {
  test("readEnvFile parses KEY=value lines and skips comments/empties", () => {
    const path = join(repoRoot, "test", "fixtures", ".env.sample")
    const keys = readEnvFile(path)
    expect(keys.get("PIXABAY_API_KEY")).toBe("abc-123")
    expect(keys.get("FIRECRAWL_API_KEY")).toBe("fc-xyz")
    expect(keys.has("EMPTY_KEY")).toBe(true)
    expect(keys.has("COMMENT")).toBe(false)
  })

  test("readEnvFile returns an empty map for a missing file", () => {
    expect(readEnvFile(join(repoRoot, "test", "fixtures", "does-not-exist.env")).size).toBe(0)
  })

  test("hasEnvKey checks the .env map and the process environment", () => {
    const keys = new Map([["SET_IN_FILE", "x"]])
    expect(hasEnvKey("SET_IN_FILE", keys)).toBe(true)
    expect(hasEnvKey("EMPTY_IN_FILE", new Map([["EMPTY_IN_FILE", ""]]))).toBe(false)
    expect(hasEnvKey("SET_IN_FILE", new Map())).toBe(false)
    process.env.FROM_PROCESS_ENV = "1"
    expect(hasEnvKey("FROM_PROCESS_ENV", new Map())).toBe(true)
    delete process.env.FROM_PROCESS_ENV
  })
})

describe("frontmatter edge cases", () => {
  test("handles missing frontmatter", () => {
    const { content, name } = parseFrontmatter("# Just a doc\n")
    expect(name).toBeUndefined()
    expect(content).toBe("# Just a doc\n")
  })

  test("handles CRLF line endings", () => {
    const raw = "---\r\nname: Test\r\ndescription: \"Quoted\"\r\n---\r\nBody\r\n"
    const fm = parseFrontmatter(raw)
    expect(fm.name).toBe("Test")
    expect(fm.description).toBe("Quoted")
    expect(fm.content).toBe("Body\r\n")
  })
})

test("catalog build produces a valid index.json", () => {
  const out = join(repoRoot, "catalog")
  rmSync(out, { recursive: true, force: true })
  Bun.spawnSync(["node", join(repoRoot, "scripts", "build-catalog.mjs")], { cwd: repoRoot })
  const index = JSON.parse(readFileSync(join(out, "index.json"), "utf8"))
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"))
  expect(index.skills).toHaveLength(1)
  expect(index.skills[0].name).toBe("motion-video-director")
  expect(index.skills[0].version).toBe(pkg.version)
  expect(index.skills[0].files).toContain("SKILL.md")
  expect(index.skills[0].files).toContain("scripts/preflight.sh")
  for (const file of index.skills[0].files) {
    expect(existsSync(join(out, "motion-video-director", file))).toBe(true)
  }
})

test("catalog build emits a human-readable landing page", () => {
  const html = readFileSync(join(repoRoot, "catalog", "index.html"), "utf8")
  // title from the SKILL.md frontmatter display name
  expect(html).toContain("<title>Motion Video Director — OpenCode plugin</title>")
  // install snippets for both distribution channels
  expect(html).toContain("opencode-motion-video-director")
  expect(html).toContain('"skills": ["https://viksaaskool.github.io/opencode-motion-video-director/"]')
  // the MCP table mirrors the plugin catalog
  expect(html).toContain("FIRECRAWL_API_KEY")
  expect(html).toContain("ELEVENLABS_API_KEY")
  // every catalog file is linked with a relative href that matches its Pages URL
  expect(html).toContain('href="motion-video-director/SKILL.md"')
  expect(html).toContain('href="motion-video-director/scripts/with-env.sh"')
  // well-formed enough: exactly one doctype, no raw unescaped template leftovers
  expect(html.match(/<!doctype html>/gi)).toHaveLength(1)
  expect(html).not.toContain("${")
  // hero graphic replaces the intro text: emitted into the site and referenced by the page
  expect(existsSync(join(repoRoot, "catalog", "explanation.jpg"))).toBe(true)
  expect(html).toContain('<img class="hero" src="explanation.jpg"')
  expect(html).not.toContain('<p class="tagline">')
  // brand assets: favicon + social preview, with absolute og:image URLs
  expect(existsSync(join(repoRoot, "catalog", "logo.png"))).toBe(true)
  expect(existsSync(join(repoRoot, "catalog", "og.png"))).toBe(true)
  expect(html).toContain('<link rel="icon" type="image/png" href="logo.png">')
  expect(html).toContain('<meta property="og:image" content="https://viksaaskool.github.io/opencode-motion-video-director/og.png">')
  expect(html).toContain('<meta name="twitter:card" content="summary_large_image">')
})
