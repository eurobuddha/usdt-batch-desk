const fs = require('node:fs');
const { artifacts, run } = require('hardhat');
const solc = require('solc');
const { TASK_FLATTEN_GET_FLATTENED_SOURCE } = require('hardhat/builtin-tasks/task-names');

async function main() {
  const name = 'contracts/SharedBatch.sol:SharedBatch';
  const build = await artifacts.getBuildInfo(name);
  const sourceName = 'SharedBatch.sol';
  const flattened = await run(TASK_FLATTEN_GET_FLATTENED_SOURCE, { files: ['contracts/SharedBatch.sol'] });
  const input = {
    language: 'Solidity',
    sources: { [sourceName]: { content: flattened } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'paris',
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  for (const error of output.errors || []) {
    if (error.severity === 'error') throw new Error(error.formattedMessage);
  }
  const compiled = output.contracts[sourceName].SharedBatch;
  const modular = build.output.contracts['contracts/SharedBatch.sol'].SharedBatch;
  // Solidity appends a CBOR metadata hash to runtime bytecode. Confirm that
  // flattening changed only that metadata, not the tested executable code.
  const executable = code => code.slice(0, -(parseInt(code.slice(-4), 16) + 2) * 2);
  if (executable(compiled.evm.deployedBytecode.object) !== executable(modular.evm.deployedBytecode.object)) {
    throw new Error('Flattened and modular executable bytecode differ');
  }
  // These deployment exports all correspond to the standalone source file.
  fs.mkdirSync('exports', { recursive: true });
  fs.writeFileSync(`exports/${sourceName}`, flattened);
  fs.writeFileSync('exports/SharedBatch.abi.json', JSON.stringify(compiled.abi, null, 2) + '\n');
  fs.writeFileSync('exports/SharedBatch.bytecode.txt', '0x' + compiled.evm.bytecode.object + '\n');
  fs.writeFileSync('exports/standard-input.json', JSON.stringify(input, null, 2) + '\n');
  fs.writeFileSync('exports/build-settings.json', JSON.stringify({
    compiler: build.solcLongVersion,
    settings: input.settings,
    contract: `${sourceName}:SharedBatch`,
    executableMatchesModularSource: true,
    constructor: 'No constructor arguments; no owner or admin',
    assets: 'Native ETH and caller-selected ERC-20 tokens',
    deployed: false,
  }, null, 2) + '\n');
  fs.writeFileSync('exports/SharedBatch.build.json', JSON.stringify({abi:compiled.abi, bytecode:'0x'+compiled.evm.bytecode.object, runtime:'0x'+compiled.evm.deployedBytecode.object, runtimeCodeHash:require('ethers').keccak256('0x'+compiled.evm.deployedBytecode.object)},null,2)+'\n');
  console.log('Exported standalone source, ABI, creation bytecode, standard compiler input and settings. Executable bytecode matches the modular contract.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
