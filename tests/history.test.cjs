const {test}=require('node:test'),assert=require('node:assert/strict');
const {reconcile,unresolved}=require('../.test-build/history.js');const {OWNER,CONTRACT}=require('../.test-build/batch.js');
const entry={id:'one',hash:'0x123',status:'pending',data:'0x1234',to:CONTRACT};
function provider(receipt,tx){return {request:async({method})=>method==='eth_chainId'?'0x1':method==='eth_getTransactionReceipt'?receipt:tx}}
test('missing receipt stays pending and blocks another request',async()=>{const r=await reconcile(provider(null,null),entry);assert.equal(r.status,'pending');assert.equal(unresolved([r]),true)});
test('successful matching transaction confirms',async()=>{const tx={from:OWNER,to:CONTRACT,input:'0x1234',value:'0x0'};assert.equal((await reconcile(provider({status:'0x1'},tx),entry)).status,'confirmed')});
test('reverted transaction is not shown as paid',async()=>{const tx={from:OWNER,to:CONTRACT,input:'0x1234',value:'0x0'};assert.equal((await reconcile(provider({status:'0x0'},tx),entry)).status,'failed')});
test('modified wallet transaction remains unknown and blocks retry',async()=>{const tx={from:OWNER,to:CONTRACT,input:'0xabcd',value:'0x0'};const r=await reconcile(provider({status:'0x1'},tx),entry);assert.equal(r.status,'unknown');assert.equal(unresolved([r]),true)});
test('unfinished signing intent survives reload as unresolved',()=>assert.equal(unresolved([{status:'signing'}]),true));
test('recovery rejects an old identical payment with a different nonce',async()=>{const tx={from:OWNER,to:CONTRACT,input:'0x1234',value:'0x0',nonce:'0x10'};assert.equal((await reconcile(provider({status:'0x1'},tx),{...entry,nonce:17},true)).status,'unknown')});
test('recovery recognizes a confirmed cancellation at the same nonce',async()=>{const tx={from:OWNER,to:OWNER,input:'0x',value:'0x0',nonce:'0x11'};assert.equal((await reconcile(provider({status:'0x1'},tx),{...entry,nonce:17},true)).status,'rejected')});
