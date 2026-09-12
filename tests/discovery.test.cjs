const {test}=require('node:test'),assert=require('node:assert/strict');
const {parseHolding,discoverAssets}=require('../.test-build/assets.js');
const {ETH}=require('../.test-build/batch.js');
const account='0x3333333333333333333333333333333333333333';
const a='0x1111111111111111111111111111111111111111',b='0x2222222222222222222222222222222222222222';
const item=(address=a,decimals='18')=>({value:'1000000000000000001',token:{type:'ERC-20',address_hash:address,decimals,symbol:'TEST',name:'Example'}});
const provider=(selected=()=>account)=>({request:async({method})=>method==='eth_chainId'?'0x1':method==='eth_accounts'?[selected()]:method==='eth_getBalance'?'0x123':Promise.reject(new Error('No signing calls allowed'))});
const result=data=>({ok:true,json:async()=>data});
test('discovery follows every page, deduplicates by contract and includes ETH',async()=>{
 let page=0;
 const portfolio=await discoverAssets(provider(),account,new AbortController().signal,async(url,options)=>{
  assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');
  if(page++===0)return result({items:[item()],next_page_params:{id:4,value:'2',fiat_value:null,items_count:50}});
  assert.equal(new URL(url).searchParams.get('fiat_value'),'');assert.equal(new URL(url).searchParams.get('id'),'4');assert.equal(new URL(url).searchParams.get('type'),'ERC-20');
  return result({items:[item(),item(b,'8')],next_page_params:null});
 });
 assert.equal(page,2);assert.equal(portfolio.items.length,3);assert.equal(portfolio.warning,'');assert.equal(portfolio.items[0].address,ETH.address);assert.equal(portfolio.items[0].balance,0x123n);assert.equal(portfolio.items[2].decimals,8);
});
test('same-symbol tokens remain separate and precision never uses floating point',()=>{assert.notEqual(parseHolding(item(a)).address,parseHolding(item(b)).address);assert.equal(parseHolding(item()).balance,1000000000000000001n);assert.equal(parseHolding(item(a,'255')).decimals,255)});
test('malformed metadata cannot create a token or suppress tokens with missing decimals',()=>{
 for(const bad of [null,{}, {...item(),value:'-1'},{...item(),value:'0'},{...item(),value:'1e18'},{...item(),token:{...item().token,type:'ERC-721'}},{...item(),token:{...item().token,address_hash:'javascript:alert(1)'}}])assert.equal(parseHolding(bad),null);
 assert.equal(parseHolding(item(a,null)).decimals,null);
 assert.equal(parseHolding({...item(),token:{...item().token,symbol:'\u202eTEST'}}).symbol,'TEST');
});
test('an account switch during lookup rejects the previous wallet result',async()=>{
 let selected=account;
 await assert.rejects(()=>discoverAssets(provider(()=>selected),account,new AbortController().signal,async()=>{selected=b;return result({items:[item()],next_page_params:null})}),/changed/);
});
test('failed or repeated pages show incomplete results explicitly',async()=>{
 let page=0;
 const portfolio=await discoverAssets(provider(),account,new AbortController().signal,async()=>page++===0?result({items:[item()],next_page_params:{id:1}}):{ok:false});
 assert.equal(portfolio.items.length,2);assert.match(portfolio.warning,/Some tokens/);
 const repeated=await discoverAssets(provider(),account,new AbortController().signal,async()=>result({items:[item()],next_page_params:{id:1}}));
 assert.match(repeated.warning,/Some tokens/);
});
test('indexer failure leaves native ETH and reports failure rather than an empty wallet',async()=>{
 const portfolio=await discoverAssets(provider(),account,new AbortController().signal,async()=>{throw Error('Offline')});
 assert.equal(portfolio.items.length,1);assert.match(portfolio.warning,/unavailable/);
});
test('aborted account lookup never returns stale holdings',async()=>{
 const controller=new AbortController();
 await assert.rejects(()=>discoverAssets(provider(),account,controller.signal,async()=>{controller.abort();return result({items:[item()],next_page_params:null})}),{name:'AbortError'});
});
