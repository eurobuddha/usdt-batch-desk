# Provenance

The frontend directly reuses its companion PersonalUSDTBatch ABI and ethers 6.16.0 integer amount/transaction encoding functions. The USDT allowance decision sequence preserves the established zero-first-reset and exact-approval behavior from an existing bridge implementation. The new batch editor replaces the bridge-specific deposit UI.

The earlier Disperse interface was inspected as a reference. It used Riot 3, ethers 4, a different contract ABI, and unlimited approvals; its full implementation was not copied.

Interface primitives come from the Shadcn/Base UI catalog supplied by the Sites starter. The public build removes all private Sites project metadata and the hosting plugin integration. It exports a local static app using Vinext; hosting dependencies remaining in the lockfile are not required by the local serving process.

Solidity source uses OpenZeppelin Contracts 5.4.0. The standalone source preserves its upstream MIT notices, and the OpenZeppelin license is included alongside it. This public snapshot contains no prior private Git history or deployed owner/contract configuration.
