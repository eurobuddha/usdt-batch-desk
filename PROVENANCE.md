# Provenance

Version 2 minimally adapts the tested PersonalUSDTBatch transfer loop to remove owner restrictions. It preserves OpenZeppelin 5.4.0 SafeERC20 and ReentrancyGuard, exact received-amount checks, atomicity and recipient validation. It follows the caller-funded structure of Disperse's `disperseTokenSimple` while retaining compatibility with USDT's missing return value. No upstream Solidity implementation was copied into the new contract.

Inspected references include Disperse's original Solidity contract and Brownie tests, its Riot transaction flow, and its newer Wagmi account/allowance and deployment components. Those complete frontend components use different framework dependencies and contract APIs, so this app reuses its existing ethers 6.16.0 frontend, validation, allowance sequence and transaction recovery instead. The new adaptations make the sender dynamic and carry wallet/contract identity through review and history.

UI primitives originate from the Shadcn/Base UI starter. Private hosting metadata is excluded. The site exports static files and has no hosting-provider requirement.

The legacy TetherToken test fixture is preserved unchanged. OpenZeppelin MIT license and source notices are retained. Historical owner-only contract source files are kept for reference; the v2 frontend accepts only SharedUSDTBatch bytecode.
