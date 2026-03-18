import { z } from 'zod'
import { loadProjectSpecs } from '../utils.js'

export const listSpecsTool = {
    name: 'list-specs' as const,
    description: 'Discover all specs in a project with metadata: steps, failure codes, success types.',
    parameters: z.object({
        projectPath: z.string().describe('Absolute or relative path to the project root'),
        specGlob: z.string().optional().describe('Glob pattern for spec files (default: src/domain/**/*.spec.ts)'),
    }),
    execute: async ({ projectPath, specGlob }: { projectPath: string; specGlob?: string }) => {
        const analysis = await loadProjectSpecs(projectPath, specGlob)

        const specs = analysis.specs.map((loaded) => {
            const { exportName, filePath, spec } = loaded
            const steps = spec.steps ?? []
            const failureCodes = Object.keys(spec.shouldFailWith ?? {})
            const successTypes = Object.keys(spec.shouldSucceedWith ?? {})

            return {
                exportName,
                filePath,
                hasSteps: steps.length > 0,
                stepCount: steps.length,
                failureCodes,
                successTypes,
            }
        })

        return JSON.stringify(specs, null, 2)
    },
}
