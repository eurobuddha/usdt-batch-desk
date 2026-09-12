# Provenance

Version 3 reuses the tested caller-funded transfer loop from `contracts/SharedUSDTBatch.sol`, OpenZeppelin 5.4.0 `SafeERC20` and `ReentrancyGuard`, and this repository's ethers 6.16.0 wallet, validation, history, deployment/recovery, UI and native launcher. The minimum contract adaptations are a caller-selected token argument, removal of the fixed USDT and received-balance restrictions, and an exact-value native ETH batch function. No owner or administrator is added.

Previously inspected references include Disperse's original Solidity contract and Brownie tests, its Riot transaction flow, and its newer Wagmi account/allowance and deployment components. Their complete frontend components have different framework dependencies and contract APIs. This app retains its existing tested frontend instead. The caller-funded ERC-20 structure follows Disperse's `disperseTokenSimple`; the existing SafeERC20 adapter also handles tokens such as USDT that omit a boolean return. No upstream Solidity implementation was copied into SharedBatch.

Frontend adaptations carry the selected token, decimals and ETH transaction value through validation, exact approval, simulation, review and receipt recovery. Existing integer parsing/formatting from ethers is retained up to its supported 80 decimals; a bounded BigInt extension covers higher uint8 token precision. Existing session checks invalidate reviews when the wallet, network, asset or batch changes.

UI primitives originate from the Shadcn/Base UI starter. The site exports static files and has no hosting-provider requirement. The existing native server and versioned packaging are retained.

The legacy TetherToken test fixture is unchanged. OpenZeppelin MIT license and source notices are retained. Historical owner-only and USDT-only contract sources remain for reference; the v3 frontend accepts only the included SharedBatch runtime.

Automatic wallet-token discovery adds the Blockscout address-token endpoint documented at https://docs.blockscout.com/api-reference/token-balances-with-filtering-and-pagination. The existing `lib/wallet.ts` token loader remains the verification boundary. Searches of this repository, Disperse's Riot/Wagmi token loaders, and relevant web/tools/bridge sibling sources found no existing wallet-wide Ethereum discovery implementation. The added `lib/assets.ts` is a small dependency-free adapter with pagination and cancellation; token metadata from the indexer never supplies transaction calldata directly.
