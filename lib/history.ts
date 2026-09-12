import type { Action, Injected } from './wallet';
export const HISTORY_KEY='batch-desk:v2:transactions';
export type RecordEntry={id:string;title:string;kind:Action;fingerprint:string;total:string;count:number;status:'signing'|'pending'|'confirmed'|'failed'|'rejected'|'unknown';hash?:string;created:string;data:string;to:string;nonce:number;from:string;contract:string};
export function loadHistory():RecordEntry[]{
  const raw=localStorage.getItem(HISTORY_KEY),legacy=raw?JSON.parse(raw):[];
  if(!Array.isArray(legacy))throw new Error('Could not read transaction history. Keep it intact and check MetaMask activity.');
  const entries=new Map<string,RecordEntry>(legacy.map((e:RecordEntry)=>[e.id,e]));
  for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith(HISTORY_KEY+':')){const value=localStorage.getItem(key);if(value){const entry=JSON.parse(value) as RecordEntry;if(!entry.id||!entry.from||!entry.contract)throw new Error('Transaction history is damaged. Check MetaMask activity before sending.');entries.set(entry.id,entry)}}}
  return [...entries.values()].sort((a,b)=>b.created.localeCompare(a.created));
}
export function forWallet(entries:RecordEntry[],account:string,contract:string){return entries.filter(e=>e.from?.toLowerCase()===account.toLowerCase()&&e.contract?.toLowerCase()===contract.toLowerCase());}
// Independent record keys prevent another wallet/tab from overwriting a new intent.
export function saveRecord(record:RecordEntry){localStorage.setItem(HISTORY_KEY+':'+record.id,JSON.stringify(record));return loadHistory();}
export function unresolved(entries:RecordEntry[]){return entries.some(e=>['signing','pending','unknown'].includes(e.status));}
export async function reconcile(injected:Injected,entry:RecordEntry, requireNonce=false):Promise<RecordEntry>{
  if(BigInt(await injected.request({method:'eth_chainId'}))!==1n) throw new Error('Switch to Ethereum mainnet to check transaction history.');
  if(!entry.hash) return entry;
  const [receipt,tx]=await Promise.all([injected.request({method:'eth_getTransactionReceipt',params:[entry.hash]}),injected.request({method:'eth_getTransactionByHash',params:[entry.hash]})]);
  if(!receipt||!tx) return {...entry,status:'pending'};
  if(BigInt(await injected.request({method:'eth_chainId'}))!==1n) throw new Error('Network changed while checking the receipt.');
  if(requireNonce && Number(BigInt(tx.nonce))!==entry.nonce) return {...entry,status:'unknown'};
  if(requireNonce && tx.from?.toLowerCase()===entry.from.toLowerCase() && tx.to?.toLowerCase()===entry.from.toLowerCase() && tx.input==='0x' && BigInt(tx.value)===0n && BigInt(receipt.status)===1n) return {...entry,status:'rejected'};
  const matches=tx.from?.toLowerCase()===entry.from.toLowerCase()&&tx.to?.toLowerCase()===entry.to.toLowerCase()&&tx.input?.toLowerCase()===entry.data.toLowerCase()&&BigInt(tx.value)===0n;
  return {...entry,status:!matches?'unknown':BigInt(receipt.status)===1n?'confirmed':'failed'};
}
