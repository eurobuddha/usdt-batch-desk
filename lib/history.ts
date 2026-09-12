import type { Action, Injected } from './wallet';
import { CONTRACT, OWNER } from './batch';
export const HISTORY_KEY=`batch-desk:1:${CONTRACT}:transactions`;
export type RecordEntry={id:string;title:string;kind:Action;fingerprint:string;total:string;count:number;status:'signing'|'pending'|'confirmed'|'failed'|'rejected'|'unknown';hash?:string;created:string;data:string;to:string;nonce:number};
export function loadHistory():RecordEntry[]{const raw=localStorage.getItem(HISTORY_KEY);if(!raw)return [];const parsed=JSON.parse(raw);if(!Array.isArray(parsed))throw new Error('Could not read transaction history. Keep it intact and check MetaMask activity.');return parsed;}
export function saveRecord(record:RecordEntry){const entries=loadHistory();const next=[record,...entries.filter(e=>e.id!==record.id)];localStorage.setItem(HISTORY_KEY,JSON.stringify(next));return next;}
export function unresolved(entries:RecordEntry[]){return entries.some(e=>['signing','pending','unknown'].includes(e.status));}
export async function reconcile(injected:Injected,entry:RecordEntry, requireNonce=false):Promise<RecordEntry>{
  if(BigInt(await injected.request({method:'eth_chainId'}))!==1n) throw new Error('Switch to Ethereum mainnet to check transaction history.');
  if(!entry.hash) return entry;
  const [receipt,tx]=await Promise.all([injected.request({method:'eth_getTransactionReceipt',params:[entry.hash]}),injected.request({method:'eth_getTransactionByHash',params:[entry.hash]})]);
  if(!receipt||!tx) return {...entry,status:'pending'};
  if(BigInt(await injected.request({method:'eth_chainId'}))!==1n) throw new Error('Network changed while checking the receipt.');
  if(requireNonce && Number(BigInt(tx.nonce))!==entry.nonce) return {...entry,status:'unknown'};
  if(requireNonce && tx.from?.toLowerCase()===OWNER.toLowerCase() && tx.to?.toLowerCase()===OWNER.toLowerCase() && tx.input==='0x' && BigInt(tx.value)===0n && BigInt(receipt.status)===1n) return {...entry,status:'rejected'};
  const matches=tx.from?.toLowerCase()===OWNER.toLowerCase()&&tx.to?.toLowerCase()===entry.to.toLowerCase()&&tx.input?.toLowerCase()===entry.data.toLowerCase()&&BigInt(tx.value)===0n;
  return {...entry,status:!matches?'unknown':BigInt(receipt.status)===1n?'confirmed':'failed'};
}
