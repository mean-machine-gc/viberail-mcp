#!/usr/bin/env tsx
import { FastMCP } from 'fastmcp'
import { checkTool } from './tools/check.js'
import { genTool } from './tools/gen.js'
import { launchUiTool } from './tools/launch-ui.js'
import { listSpecsTool } from './tools/list-specs.js'
import { getSpecTool } from './tools/get-spec.js'
import { getTestResultsTool } from './tools/get-test-results.js'
import { getDependencyGraphTool } from './tools/get-dependency-graph.js'

const server = new FastMCP({ name: 'viberail-mcp', version: '0.1.0' })

server.addTool(checkTool)
server.addTool(genTool)
server.addTool(launchUiTool)
server.addTool(listSpecsTool)
server.addTool(getSpecTool)
server.addTool(getTestResultsTool)
server.addTool(getDependencyGraphTool)

server.start({ transportType: 'stdio' })
