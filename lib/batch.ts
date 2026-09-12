import { getAddress, parseUnits, formatUnits, keccak256, toUtf8Bytes, MaxUint256, ZeroAddress } from 'ethers';
import config from '../config.local.json';
export const DEFAULT_CONTRACT = config.contract ? getAddress(config.contract) : '';
export const CONTRACT = DEFAULT_CONTRACT || ZeroAddress;
export const TOKEN = getAddress('0xdAC17F958D2ee523a2206206994597C13D831ec7');
export type Asset = {address:string;symbol:string;decimals:number};
export const ETH:Asset={address:ZeroAddress,symbol:'ETH',decimals:18};
export const USDT:Asset={address:TOKEN,symbol:'USDT',decimals:6};
export const isNative=(asset:Asset)=>getAddress(asset.address)===ZeroAddress;
export const formatAmount=(value:bigint,asset:Asset)=>{
  if(!Number.isInteger(asset.decimals)||asset.decimals<0||asset.decimals>255)throw new Error('Invalid token decimals.');
  if(asset.decimals<=80)return formatUnits(value,asset.decimals);
  // ethers FixedNumber has an 80-decimal ceiling; ERC-20 uses uint8 decimals.
  const digits=value.toString().padStart(asset.decimals+1,'0');
  return digits.slice(0,-asset.decimals)+'.'+(digits.slice(-asset.decimals).replace(/0+$/,'')||'0');
};
export type Row = { address: string; amount: string };
export type Batch = { rows: Row[]; addresses: string[]; amounts: bigint[]; total: bigint; fingerprint: string; duplicates: string[]; asset:Asset };
export function amountUnits(value: string, decimals=6): bigint {
  if(!Number.isInteger(decimals)||decimals<0||decimals>255)throw new Error('Invalid token decimals.');
  const pattern=new RegExp('^(?:0|[1-9]\\d*)'+(decimals?'(?:\\.\\d{1,'+decimals+'})?':'')+'$');
  if (!pattern.test(value.trim())) throw new Error(`Use a positive amount with up to ${decimals} decimals; no commas or scientific notation.`);
  const parts=value.trim().split('.');
  if(parts[0].length>78)throw new Error('Amount is outside the supported range.');
  const amount = decimals<=80?parseUnits(value.trim(), decimals):BigInt(parts[0]+(parts[1]??'').padEnd(decimals,'0'));
  if (amount <= 0n || amount > MaxUint256) throw new Error('Amount is outside the supported range.');
  return amount;
}
export const usdt = (value: bigint) => formatUnits(value, 6);
export function validateBatch(rows: Row[], contract = CONTRACT, sender = ZeroAddress, asset:Asset=USDT): Batch {
  if (!rows.length) throw new Error('Add at least one recipient.');
  if (rows.length > 500) throw new Error('Use at most 500 recipients per batch, then check the gas estimate.');
  const seen = new Set<string>(), duplicates = new Set<string>();
  let total = 0n;
  const normalized = rows.map((row, index) => {
    let address: string, amount: bigint;
    try { address = getAddress(row.address.trim()); } catch { throw new Error(`Row ${index + 1}: enter a valid Ethereum address (including its checksum).`); }
    if ([ZeroAddress, getAddress(contract || ZeroAddress), getAddress(asset.address)].includes(address)) throw new Error(`Row ${index + 1}: this destination is not permitted by your contract.`);
    try { amount = amountUnits(row.amount,asset.decimals); } catch (error) { throw new Error(`Row ${index + 1}: ${(error as Error).message}`); }
    total += amount;
    if (total > MaxUint256) throw new Error('Batch total exceeds the supported range.');
    if (seen.has(address)) duplicates.add(address);
    seen.add(address);
    return {address, amount:formatAmount(amount,asset)};
  });
  // Sorted canonical rows detect the same payment list even if its order changes.
  const canonical = normalized.map(r=>`${r.address.toLowerCase()}:${r.amount}`).sort();
  return {rows:normalized, addresses:normalized.map(r=>r.address), amounts:normalized.map(r=>amountUnits(r.amount,asset.decimals)), total,
    fingerprint:keccak256(toUtf8Bytes(`1:${contract.toLowerCase()}:${sender.toLowerCase()}:${getAddress(asset.address)}:${asset.decimals}:${canonical.join('|')}`)),duplicates:[...duplicates],asset};
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
export function toCSV(rows: Row[],asset:Asset=USDT,contract=CONTRACT,sender=ZeroAddress): string {
  const b = validateBatch(rows,contract,sender,asset);
  return 'address,amount\n'+b.rows.map(r=>`${r.address},${r.amount}`).join('\n')+'\n';
}
