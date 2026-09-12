import { getAddress, MaxUint256, ZeroAddress } from 'ethers';
import { ETH } from './batch';
import { checkSession, type Injected } from './wallet';

export type Holding = {address:string;symbol:string;name:string;decimals:number|null;balance:bigint};
export type Portfolio = {account:string;items:Holding[];warning:string};
const endpoint='https://eth.blockscout.com/api/v2/addresses/';
const text=(value:unknown,fallback:string)=>typeof value==='string'&&value.trim()?value.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,'').trim().slice(0,64)||fallback:fallback;

// Indexer metadata is for discovery only. loadAsset rechecks a selected token
// through the connected wallet before it becomes a payment asset.
export function parseHolding(item:unknown):Holding|null {
  if(!item||typeof item!=='object')return null;
  const row=item as {token?:Record<string,unknown>;value?:unknown},token=row.token;
  if(!token||token.type!=='ERC-20'||typeof row.value!=='string'||!/^\d{1,78}$/.test(row.value))return null;
  try{
    const address=getAddress(String(token.address_hash));
    const balance=BigInt(row.value);
    if(address===ZeroAddress||balance<=0n||balance>MaxUint256)return null;
    const raw=token.decimals,places=typeof raw==='string'&&/^\d{1,3}$/.test(raw)?Number(raw):NaN;
    const decimals=Number.isInteger(places)&&places>=0&&places<=255?places:null;
    const symbol=text(token.symbol,address.slice(0,8)+'…'+address.slice(-4));
    return {address,symbol,name:text(token.name,symbol),decimals,balance};
  }catch{return null}
}

export async function discoverAssets(injected:Injected,account:string,signal:AbortSignal,fetcher:typeof fetch=fetch):Promise<Portfolio>{
  account=getAddress(account);
  await checkSession(injected,account);
  const balance=BigInt(await injected.request({method:'eth_getBalance',params:[account,'latest']}));
  const found=new Map<string,Holding>([[ETH.address,{...ETH,name:'Ether',balance}]]);
  const cursors=new Set<string>();
  let params=new URLSearchParams({type:'ERC-20'}),warning='';
  try{
    for(let page=0;page<200;page++){
      signal.throwIfAborted();
      const response=await fetcher(endpoint+account+'/tokens?'+params,{signal:AbortSignal.any([signal,AbortSignal.timeout(15000)]),credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store'});
      if(!response.ok)throw new Error('Token lookup is unavailable.');
      const raw:unknown=await response.json();
      if(!raw||typeof raw!=='object')throw new Error('Invalid token lookup response.');
      const data=raw as {items?:unknown;next_page_params?:unknown};
      if(!Array.isArray(data.items))throw new Error('Invalid token lookup response.');
      for(const item of data.items){const holding=parseHolding(item);if(holding)found.set(holding.address,holding)}
      if(data.next_page_params==null)break;
      if(typeof data.next_page_params!=='object'||Array.isArray(data.next_page_params))throw new Error('Invalid token lookup cursor.');
      params=new URLSearchParams({type:'ERC-20'});
      for(const [key,value] of Object.entries(data.next_page_params)){
        if(!/^[a-z_]{1,40}$/.test(key)||key==='type'||(value!==null&&!['string','number'].includes(typeof value))||String(value).length>200)throw new Error('Invalid token lookup cursor.');
        params.set(key,value===null?'':String(value));
      }
      const cursor=params.toString();
      if(cursors.has(cursor)||page===199)throw new Error('Token lookup is incomplete.');
      cursors.add(cursor);
    }
  }catch(error){
    signal.throwIfAborted();
    warning=found.size>1?'Some tokens could not be loaded. Refresh to try again.':'Token lookup is unavailable. Refresh to try again; ETH and manual token entry are still available.';
  }
  signal.throwIfAborted();
  await checkSession(injected,account);
  return {account,items:[...found.values()],warning};
}
