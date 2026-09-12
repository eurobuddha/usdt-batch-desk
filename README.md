# USDT Batch Desk

A public-site-ready USDT batch sender for Ethereum mainnet. **One shared contract, any connected wallet.** Each sender approves the contract from their own wallet and pays only from their own balance. The site operator does not control visitor funds.

## Version 2

`SharedUSDTBatch` has no owner, administrator, allowlist, or privileged withdrawal. Every transfer uses `safeTransferFrom(msg.sender, recipient, amount)`. Any wallet can call it through this frontend, another frontend, or directly. Existing owner-only deployments cannot be upgraded into this contract; deploy the replacement once. The previous contract sources remain under `contracts/PersonalUSDTBatch*` for historical reference only.

The frontend follows the selected MetaMask account, shows that sender in payment review, and isolates history and repeat-payment checks by wallet and contract. Changing accounts clears the prepared review and refreshes balances and allowances. Ledger accounts work through MetaMask; hardware signing is not required for other wallet types.

## Live shared contract

Ethereum mainnet: [0x8cAbbD6D61d4D8A6A1910De61aAe8e5A4a75b861](https://etherscan.io/address/0x8cAbbD6D61d4D8A6A1910De61aAe8e5A4a75b861). Deployment confirmed in block 25962930; the runtime and creation bytecode match the included build. Details are in `deployments/mainnet.json`.

The site and packaged app use this shared contract by default. **Visitors and other wallet holders do not deploy anything.** They connect, approve their own USDT, and send their own batch. The deployer has no privileged access.

## Run or host your own site

```sh
npm ci
npm run build
```

Serve the contents of **`dist/client/`** from any static HTTPS host at the domain root. There is no application server, database, analytics, or private API key. MetaMask provides Ethereum RPC and signing. HTTPS (or localhost) is required for wallet and transaction-locking browser APIs.

The default settings already select the live shared contract above. Upload the built files and visitors can connect their own MetaMask account immediately.

If you explicitly want a separate deployment for a different site, start with an empty `contract` in `config.local.json` and `public/batch-config.json` and rebuild. The setup screen provides **Review deployment cost**, wallet signing, confirmation/recovery, and **Download settings for your public site**. Put its resulting `batch-config.json` at the site root. A separate deployment is optional and is never required per visitor.

Setup controls are omitted from the configured public app. In an unconfigured build you can enter an existing deployment of the exact included `SharedUSDTBatch` build under **Shared contract settings**, use `?contract=0x…` in a link, or set the default `contract` in ignored `config.local.json` before building. The app verifies the complete runtime hash; an arbitrary contract address cannot bypass verification.

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
