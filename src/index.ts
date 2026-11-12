/**
 * opencode-motion-video-director
 *
 * Server plugin that ships the `motion-video-director` skill for OpenCode:
 *  - registers the bundled skill (SKILL.md + helper scripts) with the server,
 *    so it is advertised to the model and loadable via the `skill` tool
 *  - adds the `/mvd-setup` command to start (or resume) a video project in the
 *    current directory and run the skill's Preflight checks
 *  - optionally registers the recommended MCP servers behind plugin options:
 *
 *      "plugins": [{
 *        "package": "opencode-motion-video-director",
 *        "options": { "mcps": ["playwright", "firecrawl", "elevenlabs", "lottiefiles"] }
 *      }]
 *
 *    Each MCP is only registered when its API key (if any) is already set in the
 *    project `.env` or the OpenCode process environment. Keys never end up in
 *    config: every server command runs through the bundled `with-env.sh`
 *    wrapper, which loads the project `.env` at spawn time.
 */
import { Plugin, Skill } from "@opencode/plugin"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

export const SKILL_ID = "motion-video-director"

export interface Frontmatter {
  name?: string
  description?: string
  content: string
}

/** Minimal frontmatter parser: a leading `---` block of `key: value` lines. */
export function parseFrontmatter(raw: string): Frontmatter {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
  if (!match) return { content: raw }
  const meta: Record<string, string> = {}
  for (const line of match[1].split(/\r?\n/)) {
    const m = /^([\w-]+):\s*(.*)$/.exec(line)
    if (m) meta[m[1]] = m[2].trim().replace(/^["'](.*)["']$/, "$1")
  }
  return { name: meta.name, description: meta.description, content: raw.slice(match[0].length) }
}

/** Resolve the bundled skill directory next to this module (`<pkg>/skill/<SKILL_ID>`). */
export function resolveSkillDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "skill", SKILL_ID)
}

export interface McpSpec {
  /** API key (env var name) that must be set in the project `.env` or the process environment before this server is registered. */
  env?: string
  /** Command executed after `bash with-env.sh` (which loads the project `.env`). */
  args: string[]
  /** Extra static environment for the server process. */
  envExtra?: Record<string, string>
}

/** Recommended MCP servers from skill §0b. Names map to `options.mcps`. */
export const MCP_CATALOG: Record<string, McpSpec> = {
  playwright: {
    args: ["npx", "@playwright/mcp@latest", "--user-data-dir", "./.browser-profile", "--output-dir", "./cache/browser"],
  },
  firecrawl: {
    env: "FIRECRAWL_API_KEY",
    args: ["npx", "-y", "firecrawl-mcp"],
  },
  elevenlabs: {
    env: "ELEVENLABS_API_KEY",
    args: ["uvx", "elevenlabs-mcp"],
    envExtra: { ELEVENLABS_MCP_BASE_PATH: "./assets" },
  },
  lottiefiles: {
    args: ["npx", "-y", "@lottiefiles/creator-mcp@latest"],
  },
}

/** Read `KEY=value` lines from an env file into a map (values are never logged). */
export function readEnvFile(path: string): Map<string, string> {
  const map = new Map<string, string>()
  if (!existsSync(path)) return map
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim())
    if (m) map.set(m[1], m[2].trim())
  }
  return map
}

/** True when the key is set in the project `.env` or the process environment. */
export function hasEnvKey(name: string, fileKeys: Map<string, string>): boolean {
  const fromFile = fileKeys.get(name)
  if (fromFile !== undefined && fromFile.length > 0) return true
  const fromEnv = process.env[name]
  return fromEnv !== undefined && fromEnv.length > 0
}

const LOG = "[motion-video-director]"

/** Prompt sent to the session when the user runs /mvd-setup. */
const SETUP_PROMPT = [
  "The motion-video-director skill is attached below.",
  "Begin it in the current working directory — treat this directory as the project folder (never write outside it). If a PROGRESS.md already exists here, read it first and resume from its next step instead of starting over.",
  "Follow the skill from the top: run Preflight (§0) with this directory as the working directory, produce the Tool | Status (✅/❌) | Version | Action checklist table, and ask me about each ❌ item (install / skip / alternative) before going further.",
  "Create the .env key file with the skill's scripts/create_env.sh, give me its full absolute path, and tell me which keys to paste where.",
  "Then send me the kickoff message (§0a) and wait for my references and story.",
].join("\n\n")

export default Plugin.define({
  id: "opencode-motion-video-director",
  async setup(ctx) {
    const options: Record<string, unknown> = ctx.options ?? {}
    const skillDir = resolveSkillDir()
    const skillMdPath = join(skillDir, "SKILL.md")

    if (!existsSync(skillMdPath)) {
      throw new Error(`${LOG} bundled skill not found at ${skillMdPath}`)
    }

    // 1) Register the bundled skill so the model can discover and load it.
    //    `path` points at the real bundled file so the agent also gets the
    //    skill's base directory and the `scripts/` supporting files.
    //    Note: a manually installed copy of the skill in a discovery location
    //    (e.g. ~/.config/opencode/skills) shadows this registration — see README.
    const raw = readFileSync(skillMdPath, "utf8")
    const { name, description, content } = parseFrontmatter(raw)
    await ctx.skill.transform((editor) => {
      editor.add({
        id: Skill.ID.make(SKILL_ID),
        name: Skill.Name.make(name ?? "Motion Video Director"),
        ...(description !== undefined ? { description } : {}),
        path: Skill.Info.fields.path.make(skillMdPath),
        content,
      })
    })
    console.log(`${LOG} skill registered from ${skillMdPath}`)

    // 2) /mvd-setup — start or resume a video project here, with Preflight.
    await ctx.command.transform((editor) => {
      editor.add({
        name: "mvd-setup",
        description: "Set up a motion-video-director project in this directory (preflight, .env key file, kickoff)",
        execute: async ({ sessionID, prompt, delivery }) => {
          const extra = prompt.text?.trim()
          const text = extra ? `${SETUP_PROMPT}\n\nUser request for this setup run: ${extra}` : SETUP_PROMPT
          await ctx.session.prompt({
            sessionID,
            text,
            skills: [{ id: SKILL_ID }],
            delivery,
          })
        },
      })
    })
    console.log(`${LOG} command registered: /mvd-setup`)

    // 3) Optional MCP auto-registration via options.mcps (default: off).
    const requested =
      options.mcps === true ? Object.keys(MCP_CATALOG) : Array.isArray(options.mcps) ? options.mcps.map(String) : []

    if (requested.length > 0) {
      const unknown = requested.filter((n) => !(n in MCP_CATALOG))
      if (unknown.length > 0) {
        console.warn(`${LOG} unknown MCP names ignored: ${unknown.join(", ")} (known: ${Object.keys(MCP_CATALOG).join(", ")})`)
      }
      const wanted = requested.filter((n) => n in MCP_CATALOG)
      const projectDir = ctx.location.directory
      const withEnvScript = join(skillDir, "scripts", "with-env.sh")

      await ctx.mcp.transform((editor) => {
        // Read inside the callback so a later reload() picks up new keys.
        const fileKeys = readEnvFile(join(projectDir, ".env"))
        const added: string[] = []
        const skippedNoKey: string[] = []
        const skippedExisting: string[] = []

        for (const name of wanted) {
          const spec = MCP_CATALOG[name]!
          if (spec.env && !hasEnvKey(spec.env, fileKeys)) {
            skippedNoKey.push(name)
            continue
          }
          if (editor.get(name)) {
            // The user already configured this server — never clobber it.
            skippedExisting.push(name)
            continue
          }
          editor.set(name, {
            type: "local",
            command: ["bash", withEnvScript, ...spec.args],
            cwd: projectDir,
            ...(spec.envExtra ? { environment: spec.envExtra } : {}),
          })
          added.push(name)
        }

        if (added.length > 0) console.log(`${LOG} MCP servers registered: ${added.join(", ")}`)
        if (skippedNoKey.length > 0) {
          console.log(`${LOG} MCP servers skipped (key not set in .env or environment): ${skippedNoKey.join(", ")}`)
        }
        if (skippedExisting.length > 0) {
          console.log(`${LOG} MCP servers skipped (already configured): ${skippedExisting.join(", ")}`)
        }
      })
    }
  },
})
