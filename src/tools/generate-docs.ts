import { z } from 'zod'
import { resolve, basename, dirname, relative } from 'path'
import { readFileSync, mkdirSync, writeFileSync } from 'fs'
import { loadSpecsWithModules, isSpec, inheritFromSteps } from 'viberail'
import type { Spec, AnyFn, FailGroup, SuccessGroup, AssertionGroup, StepInfo } from 'viberail'
import { resolveProjectPath } from '../utils.js'

function kebabToTitle(kebab: string): string {
    return kebab
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
}

function parseSpecFnFromSource(source: string): { input: string; output: string; failures: string; success: string } | null {
    const match = source.match(/SpecFn<\s*([\s\S]*?)>\s*$/m)
    if (!match) return null
    // Split on top-level commas (not inside angle brackets)
    const inner = match[1]
    const parts: string[] = []
    let depth = 0
    let current = ''
    for (const ch of inner) {
        if (ch === '<' || ch === '{' || ch === '(') depth++
        else if (ch === '>' || ch === '}' || ch === ')') depth--
        if (ch === ',' && depth === 0) {
            parts.push(current.trim())
            current = ''
        } else {
            current += ch
        }
    }
    parts.push(current.trim())
    if (parts.length < 4) return null
    return { input: parts[0], output: parts[1], failures: parts[2], success: parts[3] }
}

function buildFailureCasesTable(
    spec: Spec<AnyFn>,
): string[] {
    const lines: string[] = []
    lines.push('| Failure | Description | Source |')
    lines.push('|---|---|---|')

    // Resolve all failures (own + inherited)
    const resolved: Record<string, FailGroup<AnyFn>> = {}
    if (spec.steps) {
        const inherited = inheritFromSteps(spec.steps)
        for (const [key, group] of Object.entries(inherited)) {
            resolved[key] = group
        }
    }
    for (const [key, group] of Object.entries(spec.shouldFailWith) as [string, FailGroup<AnyFn>][]) {
        if (group) resolved[key] = group
    }

    for (const [failure, group] of Object.entries(resolved)) {
        const source = group.coveredBy ?? 'Own validation'
        lines.push(`| \`${failure}\` | ${group.description} | ${source} |`)
    }
    return lines
}

function buildOverviewTable(spec: Spec<AnyFn>): string[] {
    const lines: string[] = []
    lines.push('| Outcome | When | Result |')
    lines.push('|---|---|---|')
    for (const [successType, group] of Object.entries(spec.shouldSucceedWith) as [string, SuccessGroup<AnyFn>][]) {
        lines.push(`| **${successType}** | <!-- when: ${group.description} --> | <!-- result --> |`)
    }
    return lines
}

function buildAssertionsSection(spec: Spec<AnyFn>): string[] {
    const lines: string[] = []
    for (const [successType, assertionGroup] of Object.entries(spec.shouldAssert) as [string, AssertionGroup<AnyFn>][]) {
        const entries = Object.entries(assertionGroup)
        if (entries.length === 0) continue
        lines.push(`When ${successType}:`)
        for (const [_, assertion] of entries) {
            lines.push(`- ${assertion.description}`)
        }
        lines.push('')
    }
    return lines
}

function buildHappyPathsTable(spec: Spec<AnyFn>): string[] {
    const lines: string[] = []
    lines.push('| Scenario | Given | Then |')
    lines.push('|---|---|---|')
    for (const [successType, group] of Object.entries(spec.shouldSucceedWith) as [string, SuccessGroup<AnyFn>][]) {
        for (const example of group.examples) {
            const inputHint = JSON.stringify(example.whenInput, null, 0)
            const outputHint = JSON.stringify(example.then, null, 0)
            lines.push(`| **${successType}** | <!-- prose. input: ${inputHint} --> | <!-- prose. output: ${outputHint} --> |`)
        }
    }
    return lines
}

function buildPipelineSection(spec: Spec<AnyFn>, specMdRelPath: string): string[] {
    const lines: string[] = []
    if (spec.steps) {
        lines.push(`For the full pipeline table and decision table, see the auto-generated`)
        lines.push(`[spec.md](${specMdRelPath}).`)
        lines.push('')
        lines.push('| # | Name | Type | Description |')
        lines.push('|---|---|---|---|')
        spec.steps.forEach((step: StepInfo, i: number) => {
            lines.push(`| ${i + 1} | \`${step.name}\` | ${step.type.toUpperCase()} | ${step.description} |`)
        })
    } else {
        lines.push('This is an atomic function with no pipeline steps.')
    }
    return lines
}

export const generateDocsTool = {
    name: 'generate-docs' as const,
    description:
        'Generate a documentation page template from a .spec.ts file. Returns markdown with mechanical sections filled and prose placeholders marked with <!-- --> comments.',
    parameters: z.object({
        projectPath: z.string().describe('Absolute or relative path to the project root'),
        specPath: z.string().describe('Relative path to the .spec.ts file'),
        aggregate: z.string().describe('Parent aggregate name for navigation (e.g. "Cart", "Dispatches")'),
        navOrder: z.number().describe('Navigation order within the aggregate'),
    }),
    execute: async ({ projectPath, specPath, aggregate, navOrder }: {
        projectPath: string; specPath: string; aggregate: string; navOrder: number
    }) => {
        const cwd = resolveProjectPath(projectPath)
        const absSpecPath = resolve(cwd, specPath)

        // Load spec module
        const { modules } = await loadSpecsWithModules({ cwd })
        const mod = modules.find(({ file }) => resolve(cwd, file) === absSpecPath)
        if (!mod) throw new Error(`Spec file not found: ${specPath}`)

        const specEntries = Object.entries(mod.mod).filter(([_, v]) => isSpec(v))
        if (specEntries.length === 0) throw new Error(`No spec exports found in: ${specPath}`)

        const [specExportName, specValue] = specEntries[0] as [string, Spec<AnyFn>]

        // Read source for SpecFn type info
        const source = readFileSync(absSpecPath, 'utf-8')
        const specFnType = parseSpecFnFromSource(source)

        const stem = basename(specPath, '.spec.ts')
        const title = kebabToTitle(stem)

        // Compute relative path from docs page to .spec.md
        const specMdAbs = absSpecPath.replace(/\.spec\.ts$/, '.spec.md')
        const aggregateSlug = aggregate.toLowerCase().replace(/\s+/g, '-')
        const docsDir = resolve(cwd, 'docs', aggregateSlug)
        const specMdRel = relative(docsDir, specMdAbs)

        // Interface section
        const interfaceLines: string[] = []
        interfaceLines.push('| | |')
        interfaceLines.push('|---|---|')
        interfaceLines.push(`| **Name** | \`${stem}\` |`)
        if (specFnType) {
            interfaceLines.push(`| **Input** | \`${specFnType.input}\` |`)
            interfaceLines.push(`| **Output** | \`${specFnType.output}\` |`)
        } else {
            interfaceLines.push('| **Input** | <!-- could not parse from source --> |')
            interfaceLines.push('| **Output** | <!-- could not parse from source --> |')
        }
        const isAsync = !!(specValue.steps?.some((s: StepInfo) => s.type === 'dep' || s.type === 'safe-dep'))
        interfaceLines.push(`| **Sync/Async** | ${isAsync ? 'Async' : 'Sync'} |`)

        // Assemble full page
        const page = [
            '---',
            `title: ${title}`,
            `parent: ${aggregate}`,
            `nav_order: ${navOrder}`,
            '---',
            '',
            `# ${title}`,
            '',
            `> <!-- tagline: one sentence describing this operation in business terms -->`,
            '',
            '---',
            '',
            '## Overview',
            '',
            '<!-- overview: brief paragraph describing what this operation does in business terms -->',
            '',
            ...buildOverviewTable(specValue),
            '',
            '> The operation is protected by input validation and domain state checks.',
            '> No state is changed in any failure case.',
            '',
            '---',
            '',
            '## Interface',
            '',
            ...interfaceLines,
            '',
            '---',
            '',
            '## Business Scenarios',
            '',
            '### Happy Paths',
            '',
            ...buildHappyPathsTable(specValue),
            '',
            '### Failure Cases',
            '',
            'No state is modified in any of the following cases.',
            '',
            ...buildFailureCasesTable(specValue),
            '',
            '### Assertions',
            '',
            ...buildAssertionsSection(specValue),
            '---',
            '',
            '## Pipeline & Decision Table',
            '',
            ...buildPipelineSection(specValue, specMdRel),
            '',
        ].join('\n')

        // Write the file
        mkdirSync(docsDir, { recursive: true })
        const docFilePath = resolve(docsDir, `${stem}.md`)
        writeFileSync(docFilePath, page)

        return JSON.stringify({
            docFile: docFilePath,
            specExport: specExportName,
            title,
            aggregate,
            proseMarkers: ['tagline', 'overview', 'happy path when/then columns', 'overview table when/result columns'],
        })
    },
}
