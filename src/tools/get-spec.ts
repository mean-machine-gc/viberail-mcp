import { z } from 'zod'
import { resolve, basename } from 'path'
import { loadSpecsWithModules, isSpec, buildSpecMd } from 'viberail'
import { resolveProjectPath } from '../utils.js'

export const getSpecTool = {
    name: 'get-spec' as const,
    description: 'Read a specific spec\'s markdown representation (decision table / pipeline table).',
    parameters: z.object({
        projectPath: z.string().describe('Absolute or relative path to the project root'),
        specPath: z.string().describe('Relative path to the .spec.ts file (e.g. src/domain/foo/bar.spec.ts)'),
    }),
    execute: async ({ projectPath, specPath }: { projectPath: string; specPath: string }) => {
        const cwd = resolveProjectPath(projectPath)
        const absSpecPath = resolve(cwd, specPath)

        const { analysis, modules } = await loadSpecsWithModules({ cwd })
        const { graph } = analysis

        const mod = modules.find(({ file }) => resolve(cwd, file) === absSpecPath)
        if (!mod) {
            throw new Error(`Spec file not found: ${specPath}`)
        }

        const specs = Object.entries(mod.mod).filter(([_, v]) => isSpec(v))
        if (specs.length === 0) {
            throw new Error(`No spec exports found in: ${specPath}`)
        }

        const primary =
            specs.find(([_, v]) => (v as any).document === true) ??
            specs.find(([_, v]) => (v as any).steps) ??
            specs[0]

        const [exportName, value] = primary
        const name = basename(specPath, '.spec.ts')
        const mdPath = absSpecPath.replace(/\.spec\.ts$/, '.spec.md')
        const markdown = buildSpecMd(name, value, graph, mdPath)

        return JSON.stringify({ markdown, specName: exportName })
    },
}
