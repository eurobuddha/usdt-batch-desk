# USDT Batch Desk

A public-site-ready USDT batch sender for Ethereum mainnet. **One shared contract, any connected wallet.** Each sender approves the contract from their own wallet and pays only from their own balance. The site operator does not control visitor funds.

## Version 2

`SharedUSDTBatch` has no owner, administrator, allowlist, or privileged withdrawal. Every transfer uses `safeTransferFrom(msg.sender, recipient, amount)`. Any wallet can call it through this frontend, another frontend, or directly. Existing owner-only deployments cannot be upgraded into this contract; deploy the replacement once. The previous contract sources remain under `contracts/PersonalUSDTBatch*` for historical reference only.

The frontend follows the selected MetaMask account, shows that sender in payment review, and isolates history and repeat-payment checks by wallet and contract. Changing accounts clears the prepared review and refreshes balances and allowances. Ledger accounts work through MetaMask; hardware signing is not required for other wallet types.

## Run or host your own site

```sh
npm ci
npm run build
```

Serve the contents of **`dist/client/`** from any static HTTPS host at the domain root. There is no application server, database, analytics, or private API key. MetaMask provides Ethereum RPC and signing. HTTPS (or localhost) is required for wallet and transaction-locking browser APIs.

1. Open the app and connect the account that will pay the one-time deployment gas fee.
2. Under **Choose the shared contract**, select **Review deployment cost**, inspect the fee, and continue to MetaMask. Sign there. No ETH is transferred to the contract; only gas is paid.
3. The app verifies the confirmed deployed bytecode and saves the shared address. Interrupted requests remain recoverable; check or recover an unfinished deployment before trying again.
4. Click **Download settings for your public site**. Put the resulting **`batch-config.json`** at the root of your static site, replacing the empty file supplied with the build. No rebuild is needed.
5. Visitors now see the configured contract. They connect their own wallet, enter recipients, approve the batch total, review, and send. They do not deploy a contract and do not need your permission.

You can also enter an existing deployment of the exact included `SharedUSDTBatch` build under **Shared contract settings**, use `?contract=0x…` in a link, or set the default `contract` in ignored `config.local.json` before building. The app verifies the complete runtime hash; an arbitrary contract address cannot bypass verification.

## Contract behavior

- USDT on Ethereum mainnet, six-decimal integer amounts, no contract fee.
- Exact-amount approvals, zero-first USDT allowance reset when needed, and revoke control for the connected sender.
- Direct wallet-to-recipient transfers. A failed transfer or underpayment reverts the entire batch.
- Rejects empty/mismatched arrays, zero amounts, and zero/sender/contract/token destinations. Duplicate recipients are paid once per row and require explicit frontend acknowledgement.
- No batch ID deduplication on-chain. The browser warns about previously confirmed lists for the same wallet and contract; other apps, origins, or cleared storage have separate history.
- No deposit function or recovery administrator. Do not transfer tokens directly to the batch contract; mistakenly deposited tokens cannot be recovered by this contract.

## Native Mac app

```sh
bash scripts/build-macos.sh
```

Open `release/USDT Batch Desk.dmg`, drag the app into Applications, and launch it. macOS 13+; Apple Silicon and Intel; Chrome with MetaMask. It bundles the same interface, runs without Node/Python/Terminal, and opens `http://127.0.0.1:38762/`. Version 2 uses its own local origin so it cannot silently reuse the old owner-only server. Old version history stays in its original browser origin.

The installer is ad-hoc signed, not Apple-notarized. Signing for public distribution requires your own Developer ID and notarization. The optional Python fallback is available through `npm run package:local`.

## Source and verification

- `contracts/SharedUSDTBatch.sol`: readable contract source.
- `contracts/SharedUSDTBatch.standalone.sol` and `.standard-input.json`: standalone and exact compiler input.
- `lib/contract-build.json`: deployment bytecode, runtime, ABI and expected hash. Contains no wallet or deployed address.
- `chain/`: reproducible Solidity 0.8.26 / optimizer 200 / EVM Paris build and tests, OpenZeppelin 5.4.0, plus the unchanged legacy Tether source as a local fixture.
- `lib/`, `app/`, `components/contract-setup.tsx`: frontend, wallet/history checks, and deployment flow.
- `macos/`, `scripts/`, `launcher/`: native packaging and optional local server.

```sh
npm test
npm run typecheck
npm run build
cd chain
npm ci
npm test
npm run export
```

Contract tests execute only on a local VM. Integration tests exercise the exact deployment bytes embedded in the frontend. This is not an independent security audit. Production deployment and payments always require the wallet holder's signature.

Private configuration, generated builds, payment exports and old private history are excluded from Git. Publishing a site with a shared contract necessarily publishes that contract address, but does not expose wallet keys.
