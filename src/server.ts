#!/usr/bin/env node
import { FastMCP } from 'fastmcp'
import { checkTool } from './tools/check.js'
import { genTool } from './tools/gen.js'
import { launchUiTool } from './tools/launch-ui.js'
import { listSpecsTool } from './tools/list-specs.js'
import { getSpecTool } from './tools/get-spec.js'
import { getTestResultsTool } from './tools/get-test-results.js'
import { getDependencyGraphTool } from './tools/get-dependency-graph.js'
import { initProjectTool } from './tools/init-project.js'
import { generateTestTool } from './tools/generate-test.js'
import { generateDocsTool } from './tools/generate-docs.js'
import { statusTool } from './tools/status.js'

const server = new FastMCP({ name: 'viberail-mcp', version: '0.1.0' })

server.addTool(checkTool)
server.addTool(genTool)
server.addTool(launchUiTool)
server.addTool(listSpecsTool)
server.addTool(getSpecTool)
server.addTool(getTestResultsTool)
server.addTool(getDependencyGraphTool)
server.addTool(initProjectTool)
server.addTool(generateTestTool)
server.addTool(generateDocsTool)
server.addTool(statusTool)

server.start({ transportType: 'stdio' })
