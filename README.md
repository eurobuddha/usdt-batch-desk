# Batch Desk

A Disperse-style batch sender for Ethereum: **one shared contract, any connected wallet, native ETH and ERC-20 tokens selected by address**. Each sender spends only their own funds. There is no owner, wallet allowlist, administrator, or contract fee.

## Shared mainnet contract

[0x9678E1a14c1e5baf6FcE1b4D63d6dc04f874bEbd](https://etherscan.io/address/0x9678E1a14c1e5baf6FcE1b4D63d6dc04f874bEbd) is the confirmed SharedBatch deployment. Its creation bytecode and complete runtime match the included build. See deployments/mainnet.json. One deployment serves every sender; visitors do not deploy anything. Earlier owner-only and USDT-only contracts are incompatible with version 3 and remain historical source records.

## Sending a batch

1. Connect MetaMask. Use **Change wallet** to select any of your accounts, including Ledger accounts connected through MetaMask.
2. Choose ETH or a token from the dropdown, which automatically lists the connected account’s indexed Ethereum tokens and balances. **Refresh tokens** checks again. **Add a token manually** is a fallback for a token missing from discovery.
3. Enter recipients and amounts, paste a list, or import CSV. Review the complete batch and network fee.
4. For ERC-20 tokens, approve the batch total from the connected wallet when needed, then send. For ETH, send the exact batch total with the transaction; there is no approval.

Visitors do not deploy contracts. The site operator configures one deployment for everyone. Changing accounts or assets clears any prepared transaction review. Drafts retain their selected asset, and transaction history is scoped to the sending account and contract. Token identity and decimals are included in repeat-payment detection.

## Run or host

```sh
npm ci
npm run build
```

Serve `dist/client/` from a static HTTPS host at the domain root. There is no application server, database, analytics, or private API key. MetaMask provides RPC and signing. Token discovery queries Blockscout’s public Ethereum index with the connected public address; it uses no API key, cookies or referrer. The app follows pagination and reports incomplete or failed lookups. Indexing can lag recent transfers; token metadata and spending balances are checked again through MetaMask. HTTPS or localhost is required.

The operator's setup screen is available only at **`/?setup=1`**. It provides an existing-contract verifier, deployment cost review, wallet signing, and recovery of an unfinished deployment. After confirmation, **Download settings for your public site** produces `batch-config.json`. Put those settings in `config.local.json` and `public/batch-config.json`, then rebuild. The normal sending page has no deployment or contract-selection controls. Existing contracts must match the exact included runtime bytecode.

## Contract behavior

- `disperseToken(token, recipients, amounts)` calls OpenZeppelin `SafeERC20.safeTransferFrom(msg.sender, recipient, amount)` for each row. It never accepts a third-party source wallet.
- `disperseEther(recipients, amounts)` requires the transaction value to equal the batch total exactly. It sends ETH to each recipient with reentrancy protection.
- A failed transfer reverts the entire batch. Token-defined transfer fees, rebasing, pause rules, or blacklisting still apply; entered token amounts do not guarantee an identical recipient balance increase.
- Empty or mismatched arrays, zero amounts, overflowing totals, and zero/batch-contract/token-contract recipients are rejected. Other own wallets and self-recipients are allowed. Duplicate rows remain separate payments and require acknowledgement in the frontend.
- Token approvals are exact-amount when requested. Existing sufficient allowances can be used; an insufficient nonzero allowance is reset first for compatibility with tokens such as USDT. Revoke affects only the connected sender's selected token allowance.
- There is no token allowlist. The interface reads token metadata and preserves its precision; the underlying token must implement the ERC-20 operations it uses.
- There is no on-chain duplicate-batch prevention. Browser history detects repeats within the same origin; cleared storage or another site has separate history.
- There is no deposit or administrative recovery function. Tokens mistakenly transferred directly to the contract cannot be recovered through it.

## Native Mac app

```sh
npm run package:mac
```

Once configured, this builds `releases/3.0.0/Batch Desk-3.0.0-universal.dmg` and `Batch Desk.app`. macOS 13+, Apple Silicon and Intel, Chrome with MetaMask. The app bundles the static interface and runs without Node, Python, or Terminal, opening `http://127.0.0.1:38762/` in Chrome. Quit the older app before installing the replacement.

The installer filename, release directory, app metadata, and launcher title use the version in `package.json`. Packaging refuses to overwrite an existing release and writes `SHA256SUMS.txt`. The app is ad-hoc signed; public Apple notarization requires a Developer ID. The Python launcher is an optional fallback.

## Source and verification

- `contracts/SharedBatch.sol`: readable ETH/ERC-20 contract.
- `contracts/SharedBatch.standalone.sol` and `.standard-input.json`: standalone source and exact compiler input.
- `lib/contract-build.json`: deployment bytecode, runtime, ABI, and expected runtime hash.
- `chain/`: Solidity 0.8.26, optimizer 200, EVM Paris, OpenZeppelin 5.4.0, local tests and unchanged legacy Tether fixture.
- `lib/`, `app/`, `components/contract-setup.tsx`: payment validation, wallet/history handling, interface and operator setup.
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

The current suite has 51 frontend tests and 40 local contract/integration tests, including tests of the exact deployment bytes embedded in the frontend. Historical v2 contract tests remain separate. This is a local review, not an independent security audit. Mainnet deployment and payments require the wallet holder's signature.

Private configuration, payment exports, generated builds, hosting metadata and archived working files are excluded from Git. A deployed public contract's address and transactions are public blockchain data; wallet keys never belong in this repository.
