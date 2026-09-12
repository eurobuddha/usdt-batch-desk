import { BrowserProvider, Contract, Interface, getAddress, keccak256, toQuantity, formatEther } from 'ethers';
import batchAbi from './batch-abi.json';
import { CONTRACT, TOKEN, OWNER, CODE_HASH, CONFIGURED, approvalStep, type Batch } from './batch';
export type Injected = {request:(args:{method:string;params?:unknown[]})=>Promise<any>;on?:(name:string,cb:(...args:any[])=>void)=>void;removeListener?:(name:string,cb:(...args:any[])=>void)=>void;isMetaMask?:boolean;providers?:Injected[]};
export type Action = 'reset'|'approve'|'send'|'revoke';
export type WalletState = {account:string;balance:bigint;eth:bigint;allowance:bigint;provider:BrowserProvider};
export type Plan = {kind:Action;to:string;data:string;gas:bigint;fee:string;batch:Batch;account:string;};
const tokenAbi = ['function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)','function decimals() view returns(uint8)','function approve(address,uint256)'];
export const batchInterface = new Interface(batchAbi);
const tokenInterface = new Interface(tokenAbi);
export async function readWallet(injected:Injected):Promise<WalletState> {
  if (!CONFIGURED) throw new Error('Local setup required: set owner, contract, and runtimeCodeHash in config.local.json, then rebuild.');
  const chain = await injected.request({method:'eth_chainId'});
  if (BigInt(chain)!==1n) throw new Error('Switch MetaMask to Ethereum mainnet.');
  const accounts = await injected.request({method:'eth_accounts'}) as string[];
  if (!accounts.length) throw new Error('Connect your Ledger account in MetaMask.');
  const account = getAddress(accounts[0]);
  if(account!==OWNER) throw new Error(`Select your owner account ${OWNER} in MetaMask.`);
  const provider = new BrowserProvider(injected,'any',{cacheTimeout:-1});
  const token = new Contract(TOKEN,tokenAbi,provider), contract = new Contract(CONTRACT,batchAbi,provider);
  const [code,owner,tokenAddress,decimals,balance,allowance,eth] = await Promise.all([
    provider.getCode(CONTRACT),contract.owner(),contract.USDT(),token.decimals(),token.balanceOf(account),token.allowance(account,CONTRACT),provider.getBalance(account)
  ]);
  if (keccak256(code)!==CODE_HASH || getAddress(owner)!==OWNER || getAddress(tokenAddress)!==TOKEN || decimals!==6n) throw new Error('Contract verification failed. No transaction will be requested.');
  await checkSession(injected,account);
  return {account,balance,allowance,eth,provider};
}
export async function checkSession(injected:Injected,account:string) {
  const [chain,accounts] = await Promise.all([injected.request({method:'eth_chainId'}),injected.request({method:'eth_accounts'})]);
  if(BigInt(chain)!==1n || !accounts[0] || getAddress(accounts[0])!==account) throw new Error('Wallet or network changed. Connect again and review the batch.');
}
export function actionData(kind:Action,batch:Batch) {
  if(kind==='send') return {to:CONTRACT,data:batchInterface.encodeFunctionData('disperseUSDT',[batch.addresses,batch.amounts])};
  return {to:TOKEN,data:tokenInterface.encodeFunctionData('approve',[CONTRACT,kind==='approve'?batch.total:0n])};
}
export async function prepare(injected:Injected,kind:Action,batch:Batch):Promise<Plan> {
  const state = await readWallet(injected);
  if(kind!=='revoke' && state.balance<batch.total) throw new Error('Your USDT balance is lower than the batch total.');
  if(kind!=='revoke' && approvalStep(state.allowance,batch.total)!==kind) throw new Error('The allowance changed. Refresh and review the next step.');
  if(kind==='revoke' && state.allowance===0n) throw new Error('Your allowance is already zero.');
  const {to,data}=actionData(kind,batch);
  const request={from:state.account,to,data,value:'0x0'};
  // Estimate and simulate the precise action before presenting the review.
  const [estimate,fees,block] = await Promise.all([state.provider.estimateGas(request),state.provider.getFeeData(),state.provider.getBlock('latest')]);
  const gas=(estimate*120n+99n)/100n;
  if(gas>16777216n || (block && gas>block.gasLimit)) throw new Error('This batch is too large for one transaction. Split it into smaller batches.');
  const fee=gas*(fees.maxFeePerGas??fees.gasPrice??0n);
  if(!fee) throw new Error('Could not read the network fee. Try again.');
  if(state.eth<fee) throw new Error('You need more ETH in your Ledger account to cover the estimated network fee.');
  await checkSession(injected,state.account);
  return {kind,to,data,gas,fee:formatEther(fee),batch,account:state.account};
}
export async function submit(injected:Injected,plan:Plan):Promise<string> {
  await checkSession(injected,plan.account);
  return injected.request({method:'eth_sendTransaction',params:[{from:plan.account,to:plan.to,data:plan.data,value:'0x0',gas:toQuantity(plan.gas),chainId:'0x1'}]});
}
export function friendlyError(error:unknown):string {
  const e=error as {code?:number|string;shortMessage?:string;message?:string;info?:{error?:{code?:number}}};
  if(e.code===4001||e.code==='ACTION_REJECTED'||e.info?.error?.code===4001) return 'Request canceled in MetaMask. No new transaction was submitted by this request.';
  return (e.shortMessage||e.message||'Something went wrong. Check MetaMask and try again.').slice(0,500);
}
export function isRejected(error:unknown) {const e=error as any;return e?.code===4001||e?.code==='ACTION_REJECTED'||e?.info?.error?.code===4001;}
