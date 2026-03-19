import { z } from 'zod'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const skillsSrc = resolve(__dirname, '..', 'skills')

const JEST_CONFIG = `/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
    preset: 'ts-jest/presets/default-esm',
    testEnvironment: 'node',
    testMatch: ['**/*.test.ts'],
    extensionsToTreatAsEsm: ['.ts'],
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
    },
    transform: {
        '^.+\\.tsx?$': ['ts-jest', { useESM: true, isolatedModules: true }],
    },
    reporters: [
        'default',
        '<rootDir>/node_modules/viberail/dist/reporters/json-reporter.js',
    ],
}
`

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": false,
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
`

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

        let pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))

        // 1a. Install viberail if not already a dependency
        const inPkgJson = pkg.dependencies?.viberail || pkg.devDependencies?.viberail
        const inNodeModules = existsSync(join(root, 'node_modules', 'viberail'))
        if (!inPkgJson && !inNodeModules) {
            execSync('npm install viberail', { cwd: root, stdio: 'pipe' })
            actions.push('installed viberail')
        } else {
            actions.push('viberail already installed')
        }

        // 1b. Install Jest + TypeScript dev dependencies if missing
        const devDeps = ['jest', 'ts-jest', '@types/jest', 'typescript', 'cross-env']
        const missingDevDeps = devDeps.filter(
            (d) => !pkg.devDependencies?.[d] && !pkg.dependencies?.[d],
        )
        if (missingDevDeps.length > 0) {
            execSync(`npm install --save-dev ${missingDevDeps.join(' ')}`, {
                cwd: root,
                stdio: 'pipe',
            })
            actions.push(`installed dev dependencies: ${missingDevDeps.join(', ')}`)
        } else {
            actions.push('jest/ts-jest dev dependencies already present')
        }

        // Re-read package.json after npm installs to capture the dependency entries npm wrote
        pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))

        // 2. Apply package.json changes: type, scripts
        let scriptsChanged = false

        if (pkg.type !== 'module') {
            pkg.type = 'module'
            scriptsChanged = true
            actions.push('set "type": "module" in package.json')
        } else {
            actions.push('"type": "module" already set')
        }

        if (!pkg.scripts) pkg.scripts = {}
        if (!pkg.scripts['vr:gen']) {
            pkg.scripts['vr:gen'] = 'npx viberail gen'
            scriptsChanged = true
        }
        if (!pkg.scripts['vr:check']) {
            pkg.scripts['vr:check'] = 'npx viberail check'
            scriptsChanged = true
        }
        if (!pkg.scripts['vr:test']) {
            pkg.scripts['vr:test'] =
                'cross-env NODE_OPTIONS=--experimental-vm-modules npx jest'
            scriptsChanged = true
        }
        if (scriptsChanged) {
            writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
            actions.push('updated package.json')
        } else {
            actions.push('package.json already up to date')
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

        // 4. Scaffold jest.config.js if missing
        const jestConfigPath = join(root, 'jest.config.js')
        if (!existsSync(jestConfigPath)) {
            writeFileSync(jestConfigPath, JEST_CONFIG)
            actions.push('created jest.config.js')
        } else {
            actions.push('jest.config.js already exists')
        }

        // 5. Scaffold tsconfig.json if missing
        const tsconfigPath = join(root, 'tsconfig.json')
        if (!existsSync(tsconfigPath)) {
            writeFileSync(tsconfigPath, TSCONFIG)
            actions.push('created tsconfig.json')
        } else {
            actions.push('tsconfig.json already exists')
        }

        // 6. Copy skills
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
