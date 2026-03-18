import { z } from 'zod'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const skillsSrc = resolve(__dirname, '..', 'skills')

const DOCS_CONFIG = `title: Domain Specs
description: Business-friendly domain documentation
theme: just-the-docs
url: ""
baseurl: ""

mermaid:
  version: "10.6.0"

callouts:
  note:
    title: Note
    color: blue
  warning:
    title: Warning
    color: red
`

const DOCS_INDEX = `---
layout: default
title: Home
nav_order: 1
mermaid: true
---

# Domain

> Domain documentation — generated from spec declarations.
`

export const initProjectTool = {
    name: 'init-project' as const,
    description:
        'Initialize a project for viberail: installs the library, adds npm scripts, scaffolds docs, and copies skills. Idempotent.',
    parameters: z.object({
        projectPath: z.string().describe('Absolute or relative path to the project root'),
    }),
    execute: async ({ projectPath }: { projectPath: string }) => {
        const root = resolve(projectPath)
        if (!existsSync(root)) throw new Error(`Project path does not exist: ${root}`)

        const actions: string[] = []

        // 1. Install viberail if not already a dependency
        const pkgPath = join(root, 'package.json')
        if (!existsSync(pkgPath)) throw new Error(`No package.json found at: ${root}`)

        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
        const inPkgJson = pkg.dependencies?.viberail || pkg.devDependencies?.viberail
        const inNodeModules = existsSync(join(root, 'node_modules', 'viberail'))
        if (!inPkgJson && !inNodeModules) {
            execSync('npm install viberail', { cwd: root, stdio: 'pipe' })
            actions.push('installed viberail')
        } else {
            actions.push('viberail already installed')
        }

        // 2. Add npm scripts if missing
        if (!pkg.scripts) pkg.scripts = {}
        let scriptsChanged = false
        if (!pkg.scripts['vr:gen']) {
            pkg.scripts['vr:gen'] = 'npx viberail gen'
            scriptsChanged = true
        }
        if (!pkg.scripts['vr:check']) {
            pkg.scripts['vr:check'] = 'npx viberail check'
            scriptsChanged = true
        }
        if (scriptsChanged) {
            writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
            actions.push('added vr:gen and vr:check scripts')
        } else {
            actions.push('npm scripts already present')
        }

        // 3. Create docs scaffold if missing
        const docsDir = join(root, 'docs')
        const configPath = join(docsDir, '_config.yml')
        const indexPath = join(docsDir, 'index.md')

        mkdirSync(docsDir, { recursive: true })
        if (!existsSync(configPath)) {
            writeFileSync(configPath, DOCS_CONFIG)
            actions.push('created docs/_config.yml')
        } else {
            actions.push('docs/_config.yml already exists')
        }
        if (!existsSync(indexPath)) {
            writeFileSync(indexPath, DOCS_INDEX)
            actions.push('created docs/index.md')
        } else {
            actions.push('docs/index.md already exists')
        }

        // 4. Copy skills
        const skillsTarget = join(root, '.claude', 'skills')
        mkdirSync(skillsTarget, { recursive: true })

        const skillDirs = readdirSync(skillsSrc, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => d.name)

        for (const skill of skillDirs) {
            cpSync(join(skillsSrc, skill), join(skillsTarget, skill), {
                recursive: true,
                force: true,
            })
        }

        // Copy reference.md alongside skill directories
        const refSrc = join(skillsSrc, 'reference.md')
        if (existsSync(refSrc)) {
            cpSync(refSrc, join(skillsTarget, 'reference.md'), { force: true })
        }

        actions.push(`installed ${skillDirs.length} skills: ${skillDirs.join(', ')}`)

        return JSON.stringify({ actions, projectPath: root })
    },
}
