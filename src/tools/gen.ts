import { z } from 'zod'
import { writeFileSync } from 'fs'
import { resolve, basename } from 'path'
import {
    loadSpecsWithModules,
    isSpec,
    buildSpecMd,
    buildDependencyGraphMd,
} from 'viberail'
import { resolveProjectPath } from '../utils.js'

export const genTool = {
    name: 'gen' as const,
    description: 'Regenerate .spec.md files and dependency graph from spec definitions. Writes files to disk.',
    parameters: z.object({
        projectPath: z.string().describe('Absolute or relative path to the project root'),
        specGlob: z.string().optional().describe('Glob pattern for spec files (default: src/domain/**/*.spec.ts)'),
    }),
    execute: async ({ projectPath, specGlob }: { projectPath: string; specGlob?: string }) => {
        const cwd = resolveProjectPath(projectPath)
        const { analysis, modules } = await loadSpecsWithModules({
            cwd,
            specGlob,
        })
        const { graph } = analysis

        const filesGenerated: string[] = []
        const writtenPaths = new Set<string>()

        for (const { file, mod } of modules) {
            const resolvedPath = resolve(cwd, file)
            const mdPath = resolvedPath.replace(/\.spec\.ts$/, '.spec.md')
            if (writtenPaths.has(mdPath)) continue

            const specs = Object.entries(mod).filter(([_, v]) => isSpec(v))
            if (specs.length === 0) continue

            const primary =
                specs.find(([_, v]) => (v as any).document === true) ??
                specs.find(([_, v]) => (v as any).steps) ??
                specs[0]

            const [exportName, value] = primary
            const name = basename(file, '.spec.ts')
            const content = buildSpecMd(name, value, graph, mdPath)
            writeFileSync(mdPath, content)
            writtenPaths.add(mdPath)
            filesGenerated.push(mdPath)
        }

        // Generate dependency graph
        const graphMd = buildDependencyGraphMd(graph)
        const graphPath = resolve(cwd, 'docs/dependency-graph.md')
        writeFileSync(graphPath, graphMd)
        filesGenerated.push(graphPath)

        return JSON.stringify({ filesGenerated, count: filesGenerated.length })
    },
}
