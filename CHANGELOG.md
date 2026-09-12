# Changelog

## 3.0.0

- One shared ETH/ERC-20 contract for any connected wallet, without an owner or token allowlist.
- Automatic connected-wallet token and balance discovery, refreshing on account changes.
- Native ETH and custom token selection with token-specific precision, approvals and review.
- Asset-bound drafts, payment fingerprints and receipt recovery including native value.
- Operator setup moved behind `?setup=1`; ordinary visitors only connect and send.
- Batch Desk branding and versioned universal Mac installer.

## 2.0.1

- Versioned universal Mac installers and release directories, driven by package.json.
- App version shown in the native launcher title and matching bundle metadata.
- Packaging signs staged files before producing the release and refuses to overwrite existing releases.
- SHA-256 checksum included with the installer.

## 2.0.0

- Shared USDT contract usable by any connected Ethereum wallet.
- Configured sending interface with setup controls omitted.
