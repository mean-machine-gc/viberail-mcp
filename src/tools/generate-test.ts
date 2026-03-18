import { z } from 'zod'
import { resolve, basename, dirname, join } from 'path'
import { writeFileSync } from 'fs'
import { loadSpecsWithModules, isSpec } from 'viberail'
import { resolveProjectPath } from '../utils.js'

function hasDeps(spec: any): boolean {
    if (!spec.steps) return false
    return spec.steps.some((s: any) => s.type === 'dep' || s.type === 'safe-dep')
}

function toCamelCase(kebab: string): string {
    return kebab.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
}

export const generateTestTool = {
    name: 'generate-test' as const,
    description:
        'Generate a test file from a .spec.ts file. Writes a minimal .test.ts with one testSpec() call.',
    parameters: z.object({
        projectPath: z.string().describe('Absolute or relative path to the project root'),
        specPath: z.string().describe('Relative path to the .spec.ts file (e.g. src/domain/foo/bar.spec.ts)'),
    }),
    execute: async ({ projectPath, specPath }: { projectPath: string; specPath: string }) => {
        const cwd = resolveProjectPath(projectPath)
        const absSpecPath = resolve(cwd, specPath)

        const { modules } = await loadSpecsWithModules({ cwd })
        const mod = modules.find(({ file }) => resolve(cwd, file) === absSpecPath)
        if (!mod) {
            throw new Error(`Spec file not found: ${specPath}`)
        }

        const specEntries = Object.entries(mod.mod).filter(([_, v]) => isSpec(v))
        if (specEntries.length === 0) {
            throw new Error(`No spec exports found in: ${specPath}`)
        }

        const hasTestDeps = 'testDeps' in mod.mod
        const [specExportName, specValue] = specEntries[0]
        const needsDeps = hasDeps(specValue)

        const stem = basename(specPath, '.spec.ts')
        const fnName = toCamelCase(stem)
        const implName = needsDeps ? `_${fnName}` : fnName
        const testFilePath = join(dirname(absSpecPath), `${stem}.test.ts`)

        let content: string

        if (hasTestDeps) {
            content = [
                `import { testSpec } from 'viberail'`,
                `import { ${specExportName}, testDeps } from './${stem}.spec'`,
                `import { ${implName} } from './${stem}'`,
                ``,
                `testSpec('${fnName}', ${specExportName}, ${implName}(testDeps))`,
                ``,
            ].join('\n')
        } else if (needsDeps) {
            content = [
                `import { testSpec } from 'viberail'`,
                `import { ${specExportName} } from './${stem}.spec'`,
                `import { ${implName} } from './${stem}'`,
                ``,
                `// TODO: define testDeps matching your function's Deps type`,
                `// const testDeps: Deps = {`,
                `//     yourDep: async (input) => ({ ok: true, value: ..., successType: ['...'] }),`,
                `// }`,
                ``,
                `testSpec('${fnName}', ${specExportName}, ${implName}(testDeps))`,
                ``,
            ].join('\n')
        } else {
            content = [
                `import { testSpec } from 'viberail'`,
                `import { ${specExportName} } from './${stem}.spec'`,
                `import { ${fnName} } from './${stem}'`,
                ``,
                `testSpec('${fnName}', ${specExportName}, ${fnName})`,
                ``,
            ].join('\n')
        }

        writeFileSync(testFilePath, content)

        return JSON.stringify({
            testFile: testFilePath,
            specExport: specExportName,
            fnName: implName,
            hasTestDeps,
            needsDeps,
        })
    },
}
