require('@nomicfoundation/hardhat-ethers');
require('@nomicfoundation/hardhat-chai-matchers');
const { subtask } = require('hardhat/config');
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require('hardhat/builtin-tasks/task-names');

// Pinned local compilers make builds independent of Solidity's download service.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD).setAction(async ({ solcVersion }, _, runSuper) => {
  const name = { '0.8.26': 'solc', '0.4.25': 'solc-legacy' }[solcVersion];
  if (!name) return runSuper();
  return {
    compilerPath: require.resolve(`${name}/soljson.js`),
    isSolcJs: true,
    version: solcVersion,
    longVersion: require(name).version(),
  };
});

module.exports = {
  solidity: {
    compilers: [
      { version: '0.8.26', settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'paris' } },
      { version: '0.4.25', settings: { optimizer: { enabled: true, runs: 200 } } },
    ],
  },
  // Local tests only; production deployment is signed through MetaMask.
  networks: {hardhat: {chainId: Number(process.env.TEST_CHAIN_ID || 1)}},
};
