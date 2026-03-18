import { z } from 'zod'
import { analyzeSpecs } from 'viberail'
import { loadProjectSpecs } from '../utils.js'

export const checkTool = {
    name: 'check' as const,
    description: 'Validate specs for completeness and correctness. Returns structured check results with errors and warnings.',
    parameters: z.object({
        projectPath: z.string().describe('Absolute or relative path to the project root'),
        specGlob: z.string().optional().describe('Glob pattern for spec files (default: src/domain/**/*.spec.ts)'),
    }),
    execute: async ({ projectPath, specGlob }: { projectPath: string; specGlob?: string }) => {
        const analysis = await loadProjectSpecs(projectPath, specGlob)
        const summary = analyzeSpecs(analysis)
        return JSON.stringify(summary, null, 2)
    },
}
