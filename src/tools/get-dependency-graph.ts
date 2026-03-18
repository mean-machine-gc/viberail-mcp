import { z } from 'zod'
import { buildDependencyGraphMd } from 'viberail'
import { loadProjectSpecs } from '../utils.js'

export const getDependencyGraphTool = {
    name: 'get-dependency-graph' as const,
    description: 'Get the spec dependency graph as a mermaid flowchart with basic stats.',
    parameters: z.object({
        projectPath: z.string().describe('Absolute or relative path to the project root'),
        specGlob: z.string().optional().describe('Glob pattern for spec files (default: src/domain/**/*.spec.ts)'),
    }),
    execute: async ({ projectPath, specGlob }: { projectPath: string; specGlob?: string }) => {
        const analysis = await loadProjectSpecs(projectPath, specGlob)
        const { graph } = analysis

        const mermaid = buildDependencyGraphMd(graph)

        let nodeCount = 0
        let edgeCount = 0
        for (const [_, node] of graph.nodes) {
            nodeCount++
            edgeCount += node.edges.length
        }

        return JSON.stringify({ mermaid, nodeCount, edgeCount })
    },
}
