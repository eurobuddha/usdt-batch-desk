import { BrowserProvider, Contract, Interface, getAddress, keccak256, toQuantity, formatEther, ZeroAddress, decodeBytes32String } from 'ethers';
import batchAbi from './batch-abi.json';
import build from './contract-build.json';
export const CODE_HASH = build.runtimeCodeHash;
import { CONTRACT, USDT, isNative, validateBatch, approvalStep, type Asset, type Batch } from './batch';
export type Injected = {request:(args:{method:string;params?:unknown[]})=>Promise<any>;on?:(name:string,cb:(...args:any[])=>void)=>void;removeListener?:(name:string,cb:(...args:any[])=>void)=>void;isMetaMask?:boolean;providers?:Injected[]};
export type Action = 'reset'|'approve'|'send'|'revoke';
export type WalletState = {account:string;balance:bigint;eth:bigint;allowance:bigint;provider:BrowserProvider;asset:Asset};
export type Plan = {kind:Action;to:string;data:string;value:bigint;gas:bigint;fee:string;batch:Batch;account:string;contract:string;};
const tokenAbi = ['function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)','function decimals() view returns(uint8)','function symbol() view returns(string)','function approve(address,uint256)'];
export const batchInterface = new Interface(batchAbi);
const tokenInterface = new Interface(tokenAbi);
export async function connectedAccount(injected:Injected):Promise<string> {
  if(BigInt(await injected.request({method:'eth_chainId'}))!==1n) throw new Error('Switch MetaMask to Ethereum mainnet.');
  const accounts=await injected.request({method:'eth_accounts'}) as string[];
  if(!accounts.length)throw new Error('Connect an account in MetaMask.');
  return getAddress(accounts[0]);
}
export async function verifyContract(injected:Injected, address:string):Promise<string> {
  if(!address || getAddress(address)===ZeroAddress)throw new Error('The shared batch contract has not been configured yet.');
  if(BigInt(await injected.request({method:'eth_chainId'}))!==1n)throw new Error('Switch MetaMask to Ethereum mainnet.');
  const contract=getAddress(address);
  const code=await injected.request({method:'eth_getCode',params:[contract,'latest']});
  if(keccak256(code)!==CODE_HASH)throw new Error('This address is not the verified SharedBatch contract. Earlier USDT-only contracts are incompatible.');
  if(BigInt(await injected.request({method:'eth_chainId'}))!==1n)throw new Error('Network changed during verification.');
  return contract;
}
export async function loadAsset(injected:Injected,address:string):Promise<Asset> {
  const account=await connectedAccount(injected),tokenAddress=getAddress(address.trim());
  if(tokenAddress===ZeroAddress)throw new Error('Choose ETH for native currency. Enter a token contract address here.');
  const provider=new BrowserProvider(injected,'any',{cacheTimeout:-1});
  if(await provider.getCode(tokenAddress)==='0x')throw new Error('This address has no token contract on Ethereum.');
  const token=new Contract(tokenAddress,tokenAbi,provider);
  const decimals=Number(await token.decimals());
  let symbol=tokenAddress.slice(0,8)+'…'+tokenAddress.slice(-4);
  try{symbol=String(await token.symbol()).slice(0,32)||symbol}catch{
    try{const raw=await provider.call({to:tokenAddress,data:tokenInterface.encodeFunctionData('symbol')});symbol=decodeBytes32String(raw).slice(0,32)||symbol}catch{}
  }
  await token.balanceOf(account);
  await checkSession(injected,account);
  if(!Number.isInteger(decimals)||decimals<0||decimals>255)throw new Error('Invalid token decimals.');
  return {address:tokenAddress,symbol,decimals};
}
export async function readWallet(injected:Injected,address=CONTRACT,asset:Asset=USDT):Promise<WalletState> {
  const contractAddress=await verifyContract(injected,address);
  const account=await connectedAccount(injected);
  const provider=new BrowserProvider(injected,'any',{cacheTimeout:-1});
  let balance:bigint,allowance=0n;
  const eth=await provider.getBalance(account);
  if(isNative(asset)){
    if(asset.decimals!==18)throw new Error('ETH uses 18 decimals.');
    balance=eth;
  }else{
    const token=new Contract(getAddress(asset.address),tokenAbi,provider);
    const [decimals,b,a]=await Promise.all([token.decimals(),token.balanceOf(account),token.allowance(account,contractAddress)]);
    if(decimals!==BigInt(asset.decimals))throw new Error('Token decimals changed. Reload the token before reviewing.');
    balance=b;allowance=a;
  }
  await checkSession(injected,account);
  return {account,balance,allowance,eth,provider,asset};
}
export async function checkSession(injected:Injected,account:string) {
  const [chain,accounts] = await Promise.all([injected.request({method:'eth_chainId'}),injected.request({method:'eth_accounts'})]);
  if(BigInt(chain)!==1n || !accounts[0] || getAddress(accounts[0])!==account) throw new Error('Wallet or network changed. Connect again and review the batch.');
}
export function actionData(kind:Action,batch:Batch,contract=CONTRACT) {
  const asset=batch.asset??USDT;
  if(isNative(asset)){
    if(kind!=='send')throw new Error('ETH does not need token approval.');
    return {to:contract,data:batchInterface.encodeFunctionData('disperseEther',[batch.addresses,batch.amounts]),value:batch.total};
  }
  if(kind==='send') return {to:contract,data:batchInterface.encodeFunctionData('disperseToken',[asset.address,batch.addresses,batch.amounts]),value:0n};
  return {to:getAddress(asset.address),data:tokenInterface.encodeFunctionData('approve',[contract,kind==='approve'?batch.total:0n]),value:0n};
}
export async function prepare(injected:Injected,kind:Action,batch:Batch,contract=CONTRACT):Promise<Plan> {
  contract=getAddress(contract);
  const asset=batch.asset??USDT;
  const state = await readWallet(injected,contract,asset);
  if(kind!=='revoke')batch=validateBatch(batch.rows,contract,state.account,asset);
  if(kind!=='revoke' && state.balance<batch.total) throw new Error(`Your ${asset.symbol} balance is lower than the batch total.`);
  if(isNative(asset)){
    if(kind!=='send')throw new Error('ETH does not need token approval.');
  }else{
    if(kind!=='revoke' && approvalStep(state.allowance,batch.total)!==kind) throw new Error('The allowance changed. Refresh and review the next step.');
    if(kind==='revoke' && state.allowance===0n) throw new Error('Your allowance is already zero.');
  }
  const {to,data,value}=actionData(kind,batch,contract);
  const request={from:state.account,to,data,value:toQuantity(value)};
  const [estimate,fees,block] = await Promise.all([state.provider.estimateGas(request),state.provider.getFeeData(),state.provider.getBlock('latest')]);
  const gas=(estimate*120n+99n)/100n;
  if(gas>16777216n || (block && gas>block.gasLimit)) throw new Error('This batch is too large for one transaction. Split it into smaller batches.');
  const fee=gas*(fees.maxFeePerGas??fees.gasPrice??0n);
  if(!fee) throw new Error('Could not read the network fee. Try again.');
  if(state.eth<fee+value) throw new Error('You need enough ETH for both the batch value and estimated network fee.');
  await checkSession(injected,state.account);
  return {kind,to,data,value,gas,fee:formatEther(fee),batch,account:state.account,contract};
}
export async function submit(injected:Injected,plan:Plan):Promise<string> {
  await checkSession(injected,plan.account);
  return injected.request({method:'eth_sendTransaction',params:[{from:plan.account,to:plan.to,data:plan.data,value:toQuantity(plan.value??0n),gas:toQuantity(plan.gas),chainId:'0x1'}]});
}
export function friendlyError(error:unknown):string {
  const e=error as {code?:number|string;shortMessage?:string;message?:string;info?:{error?:{code?:number}}};
  if(e.code===4001||e.code==='ACTION_REJECTED'||e.info?.error?.code===4001) return 'Request canceled in MetaMask. No new transaction was submitted by this request.';
  return (e.shortMessage||e.message||'Something went wrong. Check MetaMask and try again.').slice(0,500);
}
export function isRejected(error:unknown) {const e=error as any;return e?.code===4001||e?.code==='ACTION_REJECTED'||e?.info?.error?.code===4001;}
