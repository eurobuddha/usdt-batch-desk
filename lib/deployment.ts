import { BrowserProvider, formatEther, getCreateAddress, toQuantity } from 'ethers';
import build from './contract-build.json';
import { connectedAccount, checkSession, verifyContract, type Injected } from './wallet';

export const DEPLOY_KEY='batch-desk:v2:deployment';
export type DeploymentPlan={account:string;nonce:number;expected:string;gas:string;fee:string};
export type DeploymentIntent=DeploymentPlan & {hash?:string;contract?:string;status:'signing'|'pending'|'unknown'|'rejected'|'failed'|'confirmed'};
export async function prepareDeployment(injected:Injected):Promise<DeploymentPlan>{
  const account=await connectedAccount(injected);
  const provider=new BrowserProvider(injected,'any',{cacheTimeout:-1});
  const [latest,pending,estimate,fees,balance]=await Promise.all([
    provider.getTransactionCount(account,'latest'),provider.getTransactionCount(account,'pending'),
    provider.estimateGas({from:account,data:build.bytecode,value:0n}),provider.getFeeData(),provider.getBalance(account)
  ]);
  if(latest!==pending)throw new Error('This wallet has a pending transaction. Finish it before deploying.');
  const gas=(estimate*120n+99n)/100n,fee=gas*(fees.maxFeePerGas??fees.gasPrice??0n);
  if(!fee||balance<fee)throw new Error('The connected wallet needs enough ETH for the deployment fee.');
  await checkSession(injected,account);
  return {account,nonce:pending,expected:getCreateAddress({from:account,nonce:pending}),gas:toQuantity(gas),fee:formatEther(fee)};
}
export async function submitDeployment(injected:Injected,plan:DeploymentPlan):Promise<string>{
  await checkSession(injected,plan.account);
  return injected.request({method:'eth_sendTransaction',params:[{from:plan.account,data:build.bytecode,value:'0x0',gas:plan.gas,nonce:toQuantity(plan.nonce),chainId:'0x1'}]});
}
export async function checkDeployment(injected:Injected,intent:DeploymentIntent):Promise<DeploymentIntent>{
  if(BigInt(await injected.request({method:'eth_chainId'}))!==1n)throw new Error('Switch MetaMask to Ethereum mainnet.');
  if(intent.hash){
    const [receipt,tx]=await Promise.all([
      injected.request({method:'eth_getTransactionReceipt',params:[intent.hash]}),
      injected.request({method:'eth_getTransactionByHash',params:[intent.hash]})
    ]);
    if(!receipt||!tx)return {...intent,status:'pending'};
    if(tx.from?.toLowerCase()!==intent.account.toLowerCase()||tx.to!=null||tx.input?.toLowerCase()!==build.bytecode.toLowerCase()||BigInt(tx.value)!==0n)return {...intent,status:'unknown'};
    if(BigInt(receipt.status)!==1n)return {...intent,status:'failed'};
    const contract=await verifyContract(injected,receipt.contractAddress);
    return {...intent,status:'confirmed',contract};
  }
  // A persisted intent survives reload even if the wallet response was lost.
  const code=await injected.request({method:'eth_getCode',params:[intent.expected,'latest']});
  if(code==='0x')return intent;
  const contract=await verifyContract(injected,intent.expected);
  return {...intent,status:'confirmed',contract};
}
export async function clearUnsubmittedDeployment(injected:Injected,intent:DeploymentIntent){
  await checkSession(injected,intent.account);
  const counts=await Promise.all(['latest','pending'].map(tag=>injected.request({method:'eth_getTransactionCount',params:[intent.account,tag]})));
  if(counts.some(value=>Number(BigInt(value))!==intent.nonce))throw new Error('This wallet has advanced or pending activity. Recover the transaction hash instead of redeploying.');
  return {...intent,status:'rejected' as const};
}
