import { z } from 'zod'
import { spawn } from 'child_process'
import open from 'open'
import { resolveProjectPath } from '../utils.js'

export const launchUiTool = {
    name: 'launch-ui' as const,
    description: 'Start viberail-ui dev server and open the browser for visual spec inspection.',
    parameters: z.object({
        projectPath: z.string().describe('Absolute or relative path to the project root'),
        port: z.number().optional().describe('Port for the UI server (default: auto-assigned by Vite)'),
    }),
    execute: async ({ projectPath, port }: { projectPath: string; port?: number }) => {
        const cwd = resolveProjectPath(projectPath)

        const args = ['viberail-ui']
        if (port) args.push('--port', String(port))

        const child = spawn('npx', args, {
            cwd,
            env: { ...process.env, VIBEGUARD_FOLDER: cwd },
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        })

        child.unref()

        // Wait for the Vite "ready" line to get the URL
        const url = await new Promise<string>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Timed out waiting for viberail-ui to start'))
            }, 15_000)

            const onData = (chunk: Buffer) => {
                const text = chunk.toString()
                const match = text.match(/https?:\/\/localhost:\d+/)
                if (match) {
                    clearTimeout(timeout)
                    child.stdout?.removeListener('data', onData)
                    resolve(match[0])
                }
            }

            child.stdout?.on('data', onData)
            child.stderr?.on('data', onData)

            child.on('error', (err) => {
                clearTimeout(timeout)
                reject(err)
            })
        })

        await open(url)

        return JSON.stringify({
            url,
            message: `viberail-ui started at ${url} and opened in browser`,
        })
    },
}
