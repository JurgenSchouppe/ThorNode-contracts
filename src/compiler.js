'use strict'

const fs = require('fs')
const path = require('path')
const solc = require('solc')
const Spinner = require('cli-spinner').Spinner;

const { walkPathSync } = require('./utils')

module.exports.compile = function (filePath) {
    console.log(`○ trying to compile solidity sources in ${filePath}`)

    let files = walkPathSync(filePath).filter(file => file.slice(-4) === '.sol')

    console.log(`○ #${files.length} files found`)

    let sources = {}

    let spinner = new Spinner('compiling contracts')
    spinner.start()

    console.log()
    files.forEach((file, idx) => {
        let content = fs.readFileSync(file, 'utf-8')
        let name = file.substr(file.lastIndexOf('/') + 1)
        console.log(`\t${idx + 1} of ${files.length}:\t${name} `)
        sources[name] = content
    })

    function findImports(path) {
        let file = path.substr(path.lastIndexOf('/') + 1)
        if (sources[file]) {
            return {
                contents: sources[file]
            }
        } else {
            return {
                error: 'File not found'
            }
        }
    }

    let out = solc.compile({ sources: sources }, 1, findImports)

    spinner.stop()
    console.log()

    let hasError = false
    if (out.errors) {
        out.errors.forEach(e => {
            if (e.split('\n')[0].indexOf(': Error:') > 0) {
                hasError = true
                console.error(e)
            } else
                console.warn(e)
        })
    }

    if (hasError) {
        throw new Error('compiled failure!')
    }

    return {
        contracts: (() => {
            let ret = {}
            for (let k in out.contracts) {
                const c = out.contracts[k]
                ret[k] = {
                    bytecode: c.bytecode,
                    runtimeBytecode: c.runtimeBytecode,
                    interface: c.interface,
                    metadata: c.metadata
                }
            }
            return ret
        })(),
        errors: out.errors
    }

}