import { resolve } from 'path'
import { existsSync } from 'fs'
import { loadSpecs, type SpecAnalysis, type LoadOptions } from 'viberail'

/** Resolves and validates a project path */
export function resolveProjectPath(projectPath: string): string {
    const abs = resolve(projectPath)
    if (!existsSync(abs)) {
        throw new Error(`Project path does not exist: ${abs}`)
    }
    return abs
}

/** Reusable spec loading with cwd override */
export async function loadProjectSpecs(
    projectPath: string,
    specGlob?: string,
): Promise<SpecAnalysis> {
    const cwd = resolveProjectPath(projectPath)
    const opts: LoadOptions = { cwd }
    if (specGlob) opts.specGlob = specGlob
    return loadSpecs(opts)
}
