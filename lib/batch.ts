import { getAddress, parseUnits, formatUnits, keccak256, toUtf8Bytes, MaxUint256, ZeroAddress } from 'ethers';
import config from '../config.local.json';
export const CONTRACT = getAddress(config.contract || ZeroAddress);
export const TOKEN = getAddress('0xdAC17F958D2ee523a2206206994597C13D831ec7');
export const OWNER = getAddress(config.owner || ZeroAddress);
export const CODE_HASH = config.runtimeCodeHash || '0x' + '0'.repeat(64);
export const CONFIGURED = CONTRACT !== ZeroAddress && OWNER !== ZeroAddress && /^0x[0-9a-fA-F]{64}$/.test(CODE_HASH) && CODE_HASH !== '0x' + '0'.repeat(64);
export type Row = { address: string; amount: string };
export type Batch = { rows: Row[]; addresses: string[]; amounts: bigint[]; total: bigint; fingerprint: string; duplicates: string[] };
export function amountUnits(value: string): bigint {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(value.trim())) throw new Error('Use a positive amount with up to 6 decimals; no commas or scientific notation.');
  const amount = parseUnits(value.trim(), 6);
  if (amount <= 0n || amount > MaxUint256) throw new Error('Amount is outside the supported range.');
  return amount;
}
export const usdt = (value: bigint) => formatUnits(value, 6);
export function validateBatch(rows: Row[]): Batch {
  if (!rows.length) throw new Error('Add at least one recipient.');
  if (rows.length > 500) throw new Error('Use at most 500 recipients per batch, then check the gas estimate.');
  const seen = new Set<string>(), duplicates = new Set<string>();
  let total = 0n;
  const normalized = rows.map((row, index) => {
    let address: string, amount: bigint;
    try { address = getAddress(row.address.trim()); } catch { throw new Error(`Row ${index + 1}: enter a valid Ethereum address (including its checksum).`); }
    if ([ZeroAddress, CONTRACT, TOKEN, OWNER].includes(address)) throw new Error(`Row ${index + 1}: this destination is not permitted by your contract.`);
    try { amount = amountUnits(row.amount); } catch (error) { throw new Error(`Row ${index + 1}: ${(error as Error).message}`); }
    total += amount;
    if (total > MaxUint256) throw new Error('Batch total exceeds the supported range.');
    if (seen.has(address)) duplicates.add(address);
    seen.add(address);
    return {address, amount:usdt(amount)};
  });
  // Sorted canonical rows detect the same payment list even if its order changes.
  const canonical = normalized.map(r=>`${r.address.toLowerCase()}:${r.amount}`).sort();
  return {rows:normalized, addresses:normalized.map(r=>r.address), amounts:normalized.map(r=>amountUnits(r.amount)), total,
    fingerprint:keccak256(toUtf8Bytes(`1:${CONTRACT}:${TOKEN}:${canonical.join('|')}`)),duplicates:[...duplicates]};
}
export function parseRows(text: string): Row[] {
  if (text.length > 200000) throw new Error('The import is too large. Limit each batch to 500 recipients.');
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if (/^(?:address|recipient)[,;\t ]+(?:amount|usdt)$/i.test(lines[0] ?? '')) lines.shift();
  if (!lines.length) throw new Error('Paste an address and amount on each line.');
  return lines.map((line,index)=>{
    const match = /^(0x[\da-fA-F]{40})(?:\s*[,;\t]\s*| +)(\S+)$/.exec(line);
    if (!match) throw new Error(`Import line ${index + 1}: expected address,amount. Nothing was imported.`);
    return {address:match[1],amount:match[2]};
  });
}
// Preserves the bridge SwapWidget's zero-first USDT allowance sequence.
export function approvalStep(allowance: bigint, total: bigint): 'reset' | 'approve' | 'send' {
  if (total <= 0n || allowance < 0n) throw new Error('Invalid allowance or total.');
  if (allowance >= total) return 'send';
  return allowance > 0n ? 'reset' : 'approve';
}
export function toCSV(rows: Row[]): string {
  const b = validateBatch(rows);
  return 'address,amount\n'+b.rows.map(r=>`${r.address},${r.amount}`).join('\n')+'\n';
}
