'use strict'
const fs = require('fs')
const path = require('path')
const program = require('commander')

const Spinner = require('cli-spinner').Spinner

const Web3 = require('web3')
const thorify = require("thorify").thorify

const compiler = require('./compiler')


program
    .version('0.0.1')
    .option('--endpoint <endpoint>', '[required] Thor RESTful Endpoint', '')
    .option('--operator <priv>', '[optional] Private Key with 0x prefixed', '')

program
    .command('deploy')
    .description('deploy the contracts')
    .action(doDeploy)


let web3
let operator
let output = {}
let compiled = {}

program.parse(process.argv)

async function doDeploy() {
    if (!program.endpoint || !/^http(s)?/.test(program.endpoint)) {
        return program.help()
    }

    console.log(`○ connect to blockchain network ${program.endpoint}`)

    web3 = thorify(new Web3(), program.endpoint)
    web3.eth.accounts.wallet.add(program.operator)
    operator = web3.eth.accounts.privateKeyToAccount(program.operator)

    try {
        await web3.eth.getChainTag()
    } catch (e) {
        console.error(e, 'connect to blockchain failure')
    }

    console.log(`√ connection successfully activated`)

    // compile contracts
    console.log()
    let contractPath = path.join(__dirname, '../contracts')
    compiled = compiler.compile(contractPath)
 
    console.log(`\n√ compile successfully`)

    // deploy token contract
    return _deployContract('TokenAuction.sol:TokenAuction')
    .then(() => {
        // deploy auction contract
        let args = [output['TokenAuction.sol:TokenAuction'], operator.address]
        return _deployContract('auction/ClockAuction.sol:ClockAuction', {args})
    })
    .then(() => {
        // setSaleAuction
        let spinner = new Spinner(`set sale auction to token contract...`)
        spinner.start()

        let contract = compiled.contracts['TokenAuction.sol:TokenAuction']
        let contractInst = new web3.eth.Contract(JSON.parse(contract.interface), output['TokenAuction.sol:TokenAuction'])

        return contractInst.methods.setSaleAuctionAddress(output['auction/ClockAuction.sol:ClockAuction'])
        .send({ from: operator.address, gas: 500000 })
            .then(receipt => {
                spinner.stop()
                if (!receipt || receipt.reverted) {
                    throw new Error('fail to set sale auction address')
                }

                console.log(`\n√ set sale auction address successfully.`)
            })
    })
    .then(async () => {
        // add operators
        let contract = compiled.contracts['TokenAuction.sol:TokenAuction']
        let contractInst = new web3.eth.Contract(JSON.parse(contract.interface), output['TokenAuction.sol:TokenAuction'])

        let spinner = new Spinner(`add operator to contract...`)
        spinner.start()

        return contractInst.methods.addOperator(operator.address).send({ from: operator.address, gas: 500000 })
        .then(receipt => {
            spinner.stop()
            if (!receipt || receipt.reverted) {
                throw new Error('fail to add operator')
            }

            console.log(`\n√ add operator ${operator.address} successfully: TxID=${receipt.meta.txID}`)
        })
    })
    .then(() => {
        console.log('\n============================================ result ============================================\n')
        console.log(output)

        console.log(`\n√ save the result to output.txt`)
        fs.writeFileSync(path.join(__dirname, "../output.txt"), JSON.stringify(output))

        process.exit(0)
    })
    .catch(err => {
        console.error(err)
        process.exit(1)
    })
}

async function _deployContract(cpath, opt={}) {
    let args = opt.args || []

    let contract = compiled.contracts[cpath]
    let contractInst

    if (!contract) {
        return
    }

    if (opt.address) {
        contractInst = new web3.eth.Contract(JSON.parse(contract.interface), opt.address)
    } else {
        contractInst = new web3.eth.Contract(JSON.parse(contract.interface))
    }

    if (!contractInst) {
        return
    }

    let spinner = new Spinner(`start to deploy contract ${cpath}...`)
    spinner.start()

    return contractInst.deploy({ data: contract.bytecode, arguments: args })
    .send({ from: operator.address, gas: opt.gas || 8000000 })
    .on('transactionHash', function(hash){
        console.log('\n', cpath, hash)
    })
    .then(receipt => {
        spinner.stop()
        if (!receipt['_address']) {
            throw new Error(`fail to deploy contract ${cpath}`)
        }

        console.log(`\n√ ${cpath} deployed successfully.`)

        output[cpath] = receipt['_address']
        return
    })
    .catch(err => {
        spinner.stop()
        throw err
    })
}


process.on('unhandledRejection', (reason, p) => {
    console.error(p)
    process.exit(1)
})

