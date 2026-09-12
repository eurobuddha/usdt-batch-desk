const {test}=require('node:test'),assert=require('node:assert/strict');
const {CONFIGURED}=require('../.test-build/batch.js');
const {readWallet,prepare}=require('../.test-build/wallet.js');
test('blank public configuration cannot request wallet access or prepare a payment', {skip: CONFIGURED}, async()=>{
  let calls=0;
  const injected={request:async()=>{calls++;throw new Error('Unexpected wallet call')}};
  await assert.rejects(()=>readWallet(injected),/Local setup required/);
  await assert.rejects(()=>prepare(injected,'send',{}),/Local setup required/);
  assert.equal(calls,0);
});
