const {test}=require('node:test'),assert=require('node:assert/strict');
const {ETH,USDT,validateBatch,amountUnits,toCSV,parseRows}=require('../.test-build/batch.js');
const {actionData,batchInterface}=require('../.test-build/wallet.js');
const recipient='0x1111111111111111111111111111111111111111';
const contract='0x2222222222222222222222222222222222222222';
const sender='0x3333333333333333333333333333333333333333';
const custom={address:'0x4444444444444444444444444444444444444444',symbol:'TEST',decimals:8};
test('ETH and custom-token batches cannot collide in payment history',()=>{const rows=[{address:recipient,amount:'1'}];assert.equal(new Set([ETH,USDT,custom].map(asset=>validateBatch(rows,contract,sender,asset).fingerprint)).size,3)});
test('zero, eight and eighteen decimals preserve exact integer values',()=>{assert.equal(amountUnits('1',0),1n);assert.throws(()=>amountUnits('1.1',0));assert.equal(amountUnits('1.00000001',8),100000001n);assert.equal(amountUnits('0.000000000000000001',18),1n)});
test('ETH transaction includes exact total and never requests approval',()=>{const batch=validateBatch([{address:recipient,amount:'1.000000000000000001'}],contract,sender,ETH),tx=actionData('send',batch,contract);assert.equal(tx.value,1000000000000000001n);assert.equal(batchInterface.parseTransaction(tx).name,'disperseEther');assert.throws(()=>actionData('approve',batch,contract))});
test('arbitrary token approval targets that token, with zero native value',()=>{const batch=validateBatch([{address:recipient,amount:'1.00000001'}],contract,sender,custom),tx=actionData('approve',batch,contract);assert.equal(tx.to,custom.address);assert.equal(tx.value,0n);const send=batchInterface.parseTransaction(actionData('send',batch,contract));assert.equal(send.args[0],custom.address);assert.equal(send.args[2][0],100000001n)});
test('CSV uses selected asset precision without silently rounding to six decimals',()=>{const rows=[{address:recipient,amount:'1.000000000000000001'}];assert.deepEqual(validateBatch(parseRows(toCSV(rows,ETH)),contract,sender,ETH).rows,rows)});

test('uint8 token decimals above the ethers ceiling are parsed and displayed exactly',()=>{const {formatAmount}=require('../.test-build/batch.js');const asset={...custom,decimals:255},amount='0.'+'0'.repeat(254)+'1';assert.equal(amountUnits(amount,255),1n);assert.equal(formatAmount(1n,asset),amount);assert.throws(()=>amountUnits('1',255),/supported range/)});
