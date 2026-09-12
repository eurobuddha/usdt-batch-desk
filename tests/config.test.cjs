const {test}=require('node:test'),assert=require('node:assert/strict');
const {readWallet,prepare,connectedAccount,verifyContract}=require('../.test-build/wallet.js');
test('unconfigured contract cannot prepare spending',async()=>{let calls=0;const injected={request:async()=>{calls++;throw new Error('Unexpected wallet call')}};await assert.rejects(()=>readWallet(injected,''),/not been configured/);assert.equal(calls,0)});
test('any connected mainnet account can connect before shared contract setup',async()=>{for(const account of ['0x3333333333333333333333333333333333333333','0x5555555555555555555555555555555555555555'])assert.equal(await connectedAccount({request:async({method})=>method==='eth_chainId'?'0x1':[account]}),account)});
test('arbitrary or legacy contract runtime is rejected',async()=>{await assert.rejects(()=>verifyContract({request:async({method})=>method==='eth_chainId'?'0x1':'0x6000'},'0x4444444444444444444444444444444444444444'),/not the verified/)});
