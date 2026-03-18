import { z } from 'zod'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, basename, dirname, join, relative } from 'node:path'
import { execSync } from 'node:child_process'
import { analyzeSpecs } from 'viberail'
import type { CheckResult, ViberailTestReport, SpecTestResult } from 'viberail'
import { loadProjectSpecs, resolveProjectPath } from '../utils.js'

function findDocFile(cwd: string, specStem: string): boolean {
    const docsDir = join(cwd, 'docs')
    if (!existsSync(docsDir)) return false
    return scanDirForFile(docsDir, `${specStem}.md`)
}

function scanDirForFile(dir: string, target: string): boolean {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (scanDirForFile(join(dir, entry.name), target)) return true
        } else if (entry.name === target) {
            return true
        }
    }
    return false
}

function matchTestResult(
    report: ViberailTestReport,
    exportName: string,
): SpecTestResult | undefined {
    return report.specs.find((s) => s.specName === exportName)
}

/** Get mtime of a file in ms, or 0 if it doesn't exist */
function mtime(filePath: string): number {
    try {
        return statSync(filePath).mtimeMs
    } catch {
        return 0
    }
}

/**
 * Find the most recent modification time across all source files
 * related to specs: .spec.ts, .test.ts, .ts (impl)
 */
function getLatestSourceMtime(specFilePaths: string[]): number {
    let latest = 0
    for (const specPath of specFilePaths) {
        const stem = basename(specPath, '.spec.ts')
        const dir = dirname(specPath)

        latest = Math.max(latest, mtime(specPath))
        latest = Math.max(latest, mtime(join(dir, `${stem}.test.ts`)))
        latest = Math.max(latest, mtime(join(dir, `${stem}.ts`)))
    }
    return latest
}

function runProjectTests(cwd: string): void {
    // Prefer vr:test script if available, fall back to direct jest invocation
    const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf-8'))
    const hasVrTest = !!pkg.scripts?.['vr:test']

    const cmd = hasVrTest
        ? 'npm run vr:test'
        : 'npx jest --reporters=default --reporters=viberail/dist/reporters/json-reporter.js'

    execSync(cmd, { cwd, stdio: 'pipe', timeout: 120_000 })
}

type SpecStatus = {
    name: string
    specFile: string
    stepCount: number
    failureCount: number
    successCount: number
    checkErrors: string[]
    checkWarnings: string[]
    testFileExists: boolean
    implFileExists: boolean
    docFileExists: boolean
    testResults: {
        pass: number
        fail: number
        skip: number
        todo: number
        failing: string[]
    } | null
}

type ProjectSummary = {
    totalSpecs: number
    check: { pass: number; warnings: number; errors: number }
    testFiles: { exist: number; missing: number }
    implFiles: { exist: number; missing: number }
    docFiles: { exist: number; missing: number }
    tests: {
        pass: number
        fail: number
        skip: number
        todo: number
        stale: boolean
        reportTimestamp: string | null
    } | null
}

export const statusTool = {
    name: 'status' as const,
    description:
        'Get a bird\'s-eye view of project health: per-spec status matrix (check, test, impl, docs), project summary, and prioritized next actions. Use runTests: true to get fresh test results.',
    parameters: z.object({
        projectPath: z.string().describe('Absolute or relative path to the project root'),
        specGlob: z.string().optional().describe('Glob pattern for spec files (default: src/domain/**/*.spec.ts)'),
        runTests: z.boolean().optional().describe('Run tests before reporting to ensure fresh results (default: false)'),
    }),
    execute: async ({ projectPath, specGlob, runTests }: { projectPath: string; specGlob?: string; runTests?: boolean }) => {
        const cwd = resolveProjectPath(projectPath)

        // 1. Load specs and run checks
        const analysis = await loadProjectSpecs(projectPath, specGlob)
        const { results: checkResults } = analyzeSpecs(analysis)

        // 2. Run tests if requested
        if (runTests) {
            try {
                runProjectTests(cwd)
            } catch {
                // Tests may fail (expected when impl is incomplete) —
                // the reporter still writes results on failure
            }
        }

        // 3. Read test report + detect staleness
        let testReport: ViberailTestReport | null = null
        let testResultsStale = false
        const reportPath = resolve(cwd, 'viberail-results.json')
        if (existsSync(reportPath)) {
            try {
                testReport = JSON.parse(readFileSync(reportPath, 'utf-8'))

                // Staleness check: compare report mtime against latest source file mtime
                const reportMtime = mtime(reportPath)
                const latestSourceMtime = getLatestSourceMtime(
                    analysis.specs.map((s) => s.filePath),
                )
                testResultsStale = latestSourceMtime > reportMtime
            } catch {
                // corrupted or empty — treat as absent
            }
        }

        // 4. Build per-spec status
        const specs: SpecStatus[] = analysis.specs.map((loaded) => {
            const { exportName, filePath, modulePath, spec } = loaded
            const stem = basename(filePath, '.spec.ts')

            // Check results for this spec
            const specChecks = checkResults.filter(
                (r: CheckResult) => r.specFile === modulePath || r.specFile === filePath,
            )
            const checkErrors = specChecks
                .filter((r: CheckResult) => r.severity === 'error')
                .map((r: CheckResult) => r.message)
            const checkWarnings = specChecks
                .filter((r: CheckResult) => r.severity === 'warning')
                .map((r: CheckResult) => r.message)

            // Sibling files
            const dir = dirname(filePath)
            const testFileExists = existsSync(join(dir, `${stem}.test.ts`))
            const implFileExists = existsSync(join(dir, `${stem}.ts`))
            const docFileExists = findDocFile(cwd, stem)

            // Test results
            let testResults: SpecStatus['testResults'] = null
            if (testReport) {
                const specResult = matchTestResult(testReport, exportName)
                if (specResult) {
                    const failing: string[] = []
                    for (const group of Object.values(specResult.failures)) {
                        for (const ex of group.examples) {
                            if (ex.status === 'fail') failing.push(ex.description)
                        }
                    }
                    for (const group of Object.values(specResult.successes)) {
                        for (const ex of group.examples) {
                            if (ex.status === 'fail') failing.push(ex.description)
                        }
                    }
                    testResults = {
                        pass: specResult.passed,
                        fail: specResult.failed,
                        skip: specResult.skipped,
                        todo: specResult.todo,
                        failing,
                    }
                }
            }

            // Metadata
            const steps = spec.steps ?? []
            const failureCodes = Object.keys(spec.shouldFailWith ?? {})
            const successTypes = Object.keys(spec.shouldSucceedWith ?? {})

            return {
                name: stem,
                specFile: relative(cwd, filePath),
                stepCount: steps.length,
                failureCount: failureCodes.length,
                successCount: successTypes.length,
                checkErrors,
                checkWarnings,
                testFileExists,
                implFileExists,
                docFileExists,
                testResults,
            }
        })

        // 5. Project summary
        const summary: ProjectSummary = {
            totalSpecs: specs.length,
            check: {
                pass: specs.filter((s) => s.checkErrors.length === 0 && s.checkWarnings.length === 0).length,
                warnings: specs.filter((s) => s.checkWarnings.length > 0).length,
                errors: specs.filter((s) => s.checkErrors.length > 0).length,
            },
            testFiles: {
                exist: specs.filter((s) => s.testFileExists).length,
                missing: specs.filter((s) => !s.testFileExists).length,
            },
            implFiles: {
                exist: specs.filter((s) => s.implFileExists).length,
                missing: specs.filter((s) => !s.implFileExists).length,
            },
            docFiles: {
                exist: specs.filter((s) => s.docFileExists).length,
                missing: specs.filter((s) => !s.docFileExists).length,
            },
            tests: null,
        }

        if (testReport) {
            summary.tests = {
                pass: testReport.passed,
                fail: testReport.failed,
                skip: testReport.skipped,
                todo: testReport.todo,
                stale: testResultsStale,
                reportTimestamp: testReport.timestamp,
            }
        }

        // 6. Prioritized next actions
        const nextActions: string[] = []

        // Stale test results — always surface this first
        if (testResultsStale) {
            nextActions.push('Test results are stale — re-run with status({ runTests: true }) for accurate data')
        }

        // No test report at all and test files exist — need to run tests
        if (!testReport && specs.some((s) => s.testFileExists)) {
            nextActions.push('No test results found — run with status({ runTests: true }) to generate them')
        }

        for (const s of specs) {
            if (s.checkErrors.length > 0) {
                nextActions.push(`Fix spec errors in ${s.specFile}: ${s.checkErrors[0]}`)
            }
        }
        for (const s of specs) {
            if (!s.testFileExists) {
                nextActions.push(`Generate test for ${s.specFile}`)
            }
        }
        for (const s of specs) {
            if (!s.implFileExists) {
                nextActions.push(`Implement ${s.specFile.replace('.spec.ts', '.ts')}`)
            }
        }
        if (!testResultsStale) {
            for (const s of specs) {
                if (s.testResults && s.testResults.fail > 0) {
                    nextActions.push(
                        `Fix failing tests in ${s.specFile.replace('.spec.ts', '.ts')} (${s.testResults.fail} failing)`,
                    )
                }
            }
        }
        for (const s of specs) {
            if (!s.docFileExists) {
                nextActions.push(`Generate docs for ${s.specFile}`)
            }
        }

        if (nextActions.length === 0) {
            nextActions.push('All specs complete')
        }

        return JSON.stringify({ summary, specs, nextActions }, null, 2)
    },
}
