import { z } from 'zod'
import { resolve } from 'path'
import { readFileSync, existsSync } from 'fs'
import { resolveProjectPath } from '../utils.js'
import type { ViberailTestReport } from 'viberail'

export const getTestResultsTool = {
    name: 'get-test-results' as const,
    description: 'Read the viberail test report JSON. Shows which examples passed/failed per spec.',
    parameters: z.object({
        projectPath: z.string().describe('Absolute or relative path to the project root'),
        resultsFile: z.string().optional().describe('Path to results file (default: viberail-results.json)'),
    }),
    execute: async ({ projectPath, resultsFile }: { projectPath: string; resultsFile?: string }) => {
        const cwd = resolveProjectPath(projectPath)
        const file = resolve(cwd, resultsFile ?? 'viberail-results.json')

        if (!existsSync(file)) {
            throw new Error(
                `Test results file not found: ${file}. Run tests with the viberail JSON reporter first.`,
            )
        }

        const raw = readFileSync(file, 'utf-8')
        const report: ViberailTestReport = JSON.parse(raw)
        return JSON.stringify(report, null, 2)
    },
}
