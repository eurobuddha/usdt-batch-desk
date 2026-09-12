'use client';
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import { DEPLOY_KEY, prepareDeployment, submitDeployment, checkDeployment, clearUnsubmittedDeployment, type DeploymentPlan, type DeploymentIntent } from '@/lib/deployment';
import { friendlyError, isRejected, type Injected } from '@/lib/wallet';
import { HISTORY_KEY, loadHistory, unresolved } from '@/lib/history';

export default function ContractSetup({injected,account,contract,busy,onSelect,onConnect}:{injected:Injected|null;account:string;contract:string;busy:boolean;onSelect:(address:string)=>Promise<void>;onConnect:()=>Promise<void>}){
  const [address,setAddress]=useState(contract),[error,setError]=useState(''),[working,setWorking]=useState(false),[plan,setPlan]=useState<DeploymentPlan|null>(null),[intent,setIntent]=useState<DeploymentIntent|null>(null),[hash,setHash]=useState('');
  const pending=!!intent&&['signing','pending','unknown'].includes(intent.status);
  const disabled=busy||working;
  const save=(value:DeploymentIntent)=>{localStorage.setItem(DEPLOY_KEY,JSON.stringify(value));setIntent(value)};
  useEffect(()=>{try{const saved=localStorage.getItem(DEPLOY_KEY);if(saved)setIntent(JSON.parse(saved))}catch{setError('Deployment history could not be read. Check wallet activity before deploying.')}},[]);
  useEffect(()=>{setPlan(null)},[account]);
  useEffect(()=>{setAddress(contract)},[contract]);
  async function run(fn:()=>Promise<void>){if(working)return;setWorking(true);setError('');try{await fn()}catch(e){setError(friendlyError(e))}finally{setWorking(false)}}
  async function check(value=intent){if(!injected||!value)return;const updated=await checkDeployment(injected,value);save(updated);if(updated.status==='confirmed'&&updated.contract){setAddress(updated.contract);await onSelect(updated.contract)}}
  useEffect(()=>{if(!injected||!intent||!pending)return;let stopped=false;let checking=false;const timer=setInterval(async()=>{if(checking)return;checking=true;try{const updated=await checkDeployment(injected,intent);if(!stopped&&updated.status!==intent.status){save(updated);if(updated.contract)await onSelect(updated.contract)}}catch(e){if(!stopped)setError(friendlyError(e))}finally{checking=false}},10000);return()=>{stopped=true;clearInterval(timer)}},[injected,intent,account,pending]);
  async function confirm(){
    if(!injected||!plan||!navigator.locks)throw new Error('Use Chrome with MetaMask to deploy.');
    const reviewed=plan;
    await navigator.locks.request(HISTORY_KEY,{ifAvailable:true},async lock=>{
      if(!lock)throw new Error('Another tab is deploying. Finish that request first.');
      if(unresolved(loadHistory().filter(e=>e.from.toLowerCase()===reviewed.account.toLowerCase())))throw new Error('This wallet has an unfinished payment or approval. Resolve it before deploying.');
      const saved=localStorage.getItem(DEPLOY_KEY),previous=saved?JSON.parse(saved):null;
      if(previous&&['signing','pending','unknown','confirmed'].includes(previous.status))throw new Error('A deployment already exists or is unfinished. Check it before deploying again.');
      const fresh=await prepareDeployment(injected);
      if(fresh.account!==reviewed.account||fresh.nonce!==reviewed.nonce||Number(fresh.fee)>Number(reviewed.fee)*1.2){setPlan(fresh);throw new Error('Account, nonce or fee changed. Review the new estimate.');}
      let record:DeploymentIntent={...fresh,status:'signing'};
      save(record);setPlan(null);
      try{record={...record,hash:await submitDeployment(injected,fresh),status:'pending'};save(record)}
      catch(e){save({...record,status:isRejected(e)?'rejected':'unknown'});throw e}
    });
  }
  function downloadSettings(){const blob=new Blob([JSON.stringify({contract},null,2)+'\n'],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='batch-config.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  return <details className="contract-setup paper" open={!contract}>
    <summary>{contract?'Shared contract settings':'Choose the shared contract'}<span>{contract?'Use the same address for every wallet':'One deployment · Any wallet · No owner permissions'}</span></summary>
    <div className="setup-body"><p>Everyone uses the same contract. Each connected wallet approves and spends only its own USDT.</p>
      {!account&&<button className="quiet" disabled={disabled} onClick={onConnect}>Connect MetaMask</button>}
      <label className="small-label" htmlFor="shared-contract">EXISTING SHARED CONTRACT</label>
      <div className="setup-row"><input id="shared-contract" className="address-input" value={address} onChange={e=>setAddress(e.target.value)} placeholder="0x… shared contract address"/><button className="quiet" disabled={disabled||!account||!address} onClick={()=>run(()=>onSelect(address))}>Verify & use</button></div>
      <p className="muted">The app verifies the complete deployed bytecode before approving any spending. The earlier owner-only contract cannot be used here.</p>
      {contract&&<button className="text-button" onClick={downloadSettings}>Download settings for your public site</button>}
      {!contract&&<div className="setup-deploy"><h3>Setting up your own site?</h3><p>Deploy the shared contract once. Your visitors will only connect, approve, and send; they do not deploy contracts.</p>
        <button className="quiet" disabled={disabled||!account||pending||intent?.status==='confirmed'} onClick={()=>run(async()=>{if(injected)setPlan(await prepareDeployment(injected))})}>Review deployment cost</button>
      </div>}
      {intent&&<div className="message"><b>Deployment: {intent.status}</b>{intent.hash&&<p><a href={`https://etherscan.io/tx/${intent.hash}`} target="_blank" rel="noreferrer">View transaction ↗</a></p>}{intent.contract&&<p className="full-address">{intent.contract}</p>}<button className="text-button" disabled={disabled||!injected} onClick={()=>run(()=>check())}>Check deployment</button>
        {pending&&<><p>Finish or recover this request before creating another contract.</p><input aria-label="Deployment transaction hash" placeholder="Paste deployment transaction hash if needed" value={hash} onChange={e=>setHash(e.target.value)}/><button className="text-button" disabled={disabled} onClick={()=>run(async()=>{if(!/^0x[\da-fA-F]{64}$/.test(hash))throw new Error('Enter a valid transaction hash.');await check({...intent,hash})})}>Recover by hash</button><button className="text-button" disabled={disabled||!injected} onClick={()=>run(async()=>{if(injected)save(await clearUnsubmittedDeployment(injected,intent))})}>I canceled in MetaMask — check and clear</button></>}
      </div>}
      {error&&<div className="message error" role="alert">{error}</div>}
    </div>
    <Dialog open={!!plan} onOpenChange={open=>{if(!open&&!working)setPlan(null)}}><DialogContent><DialogTitle>Deploy one shared batch contract</DialogTitle><DialogDescription>Ethereum mainnet. No owner, administrator, or wallet allowlist. No funds are sent with deployment; you pay the network fee.</DialogDescription>{plan&&<><p className="review-address">Deploying wallet<code>{plan.account}</code></p><p>Estimated maximum network fee: <b>{plan.fee} ETH</b></p><p className="muted">Check MetaMask’s final fee before signing. This deployment will work for all wallets.</p>{error&&<p role="alert">{error}</p>}<button className="primary" disabled={disabled} onClick={()=>run(confirm)}>{working?'Waiting for wallet…':'Deploy — continue to MetaMask'}</button></>}</DialogContent></Dialog>
  </details>
}
