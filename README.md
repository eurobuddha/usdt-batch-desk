# USDT Batch Desk

A local browser app for owner-only USDT batch payments on Ethereum mainnet. Runs in Chrome with MetaMask and a Ledger account. No hosted website or cloud account is required.

## Features

- Editable recipient rows, pasted lists, and CSV import/export.
- Exact six-decimal amounts, checksummed addresses, and total validation.
- USDT's zero-first allowance reset; approve only the required total.
- Full recipient review, gas estimation, and Ledger signing through MetaMask.
- On-chain owner, token, network, and deployed bytecode verification before preparing transactions.
- Browser-local drafts, transaction history, duplicate warnings, and pending-request recovery.
- A macOS double-click launcher that serves bundled static files on `127.0.0.1:38761`.

## Local setup

Requires Node.js 22.13+ and npm to build the interface. Building the native Mac app also requires Xcode command-line tools. The finished app needs macOS 13+, Google Chrome, and MetaMask. It supports Apple Silicon and Intel Macs, and runs without Node, Python, or a Terminal window. Signing stays in MetaMask and your Ledger.

```sh
npm ci
npm run prebuild
```

Edit the newly created **`config.local.json`**:

| Setting | Value |
| --- | --- |
| `owner` | The Ethereum address that owns your batch contract |
| `contract` | Your deployed `PersonalUSDTBatch` address |
| `runtimeCodeHash` | Keccak-256 of the contract's deployed runtime bytecode, including metadata |

Use a deployment you have independently verified. Runtime bytecode can be read with Ethereum `eth_getCode`; hash those bytes with ethers `keccak256`. This pins the complete deployed code and is separate from the deployment transaction hash. No secret, seed phrase, private key, password, or API token belongs in this configuration. Empty configuration disables wallet connection and transaction preparation.

```sh
npm run build
bash scripts/build-macos.sh
```

Open **`release/USDT Batch Desk.dmg`**, drag **USDT Batch Desk** into Applications, then open it. The native app starts a loopback-only static server and opens Chrome. Quit the app with Command-Q to stop its server. Closing the small launcher window leaves the server running; click its Dock icon to reopen Chrome.

The build is locally ad-hoc signed, not Apple-notarized. To distribute your own installer broadly, use your Developer ID and Apple's notarization process. Configured installers embed your wallet/deployment settings; keep them private if you do not want that association published.

The optional Python fallback remains available through `npm run package:local` and `launcher/Launch USDT Batch Desk.command`. If an earlier launcher is running, the native app reuses that session. Stop the old launcher once and reopen the native app to transfer server ownership.

Internet is still needed for MetaMask's Ethereum RPC requests and transaction broadcast. The local server only serves files; it receives no recipient lists and cannot sign transactions.

## Payment flow

1. Connect the owner account in MetaMask on Ethereum mainnet.
2. Enter or import recipients and amounts, then inspect the total.
3. Reset an existing insufficient nonzero allowance when required, then approve the exact batch total.
4. Review every destination and the fee estimate, then request the batch transaction in MetaMask and sign on the Ledger.
5. Wait for confirmation in transaction history. Resolve an unfinished request before retrying.

Each batch is atomic: if one transfer fails, the whole batch reverts. ETH is needed for gas. Repeated recipient rows make separate payments and require acknowledgement. Previously confirmed lists trigger a repeat-payment warning.

## Source layout

- `app/`: frontend and styles.
- `lib/`: validation, ABI, wallet checks, and history.
- `launcher/`: Python local server and macOS launcher.
- `macos/`: native Swift app, loopback HTTP server, and icon generator.
- `scripts/`: configuration and local packaging helpers.
- `contracts/`: Solidity source and standalone flattened source; Solidity 0.8.26, optimizer 200 runs, EVM Paris, OpenZeppelin 5.4.0.
- `tests/`: unit tests for validation, transaction construction, and receipt recovery.

The repository is configuration-free. `config.local.json`, generated bundles, payment exports, environment files, private hosting metadata, and logs are ignored. A configured build embeds public wallet/deployment settings; **do not commit or publicly upload that build** if you want to keep the association private.

## Checks

```sh
npm test
npm run typecheck
npm run build
python3 tests/native-server.py /path/to/USDTBatchDesk dist/client
```

This app is not independently audited. Browser-local history cannot detect payments made through another app, browser, or cleared storage. The smart contract does not enforce unique batch IDs. Check wallet activity before repeating an uncertain payment. Drafts and history belong to the fixed localhost origin and are separate from other website origins.
