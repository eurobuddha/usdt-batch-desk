const {expect}=require('chai');
const {ethers,network}=require('hardhat');
const build=require('../../lib/contract-build.json');
const {ETH,validateBatch}=require('../../.test-build/batch.js');
const {loadAsset,readWallet,prepare,submit}=require('../../.test-build/wallet.js');
const {reconcile}=require('../../.test-build/history.js');
describe('SharedBatch: ETH and arbitrary ERC-20 tokens through the exported frontend build',function(){
 let a,b,c,d,batch,target,selected,provider;
 beforeEach(async()=>{
  if(network.name!=='hardhat')throw Error('Local tests only');
  await network.provider.send('hardhat_reset');[a,b,c,d]=await ethers.getSigners();
  batch=await new ethers.ContractFactory(build.abi,build.bytecode,a).deploy();target=await batch.getAddress();selected=a.address;
  provider={request:async req=>req.method==='eth_accounts'?[selected]:network.provider.request(req)};
 });
 for(const decimals of [0,6,8,18,24,255])it(`independent wallets send a non-USDT token with ${decimals} decimals`,async()=>{
  const token=await ethers.deployContract('DecimalToken',[decimals]);
  const tokenAddress=await token.getAddress();
  for(const sender of [a,b]){
   selected=sender.address;await token.mint(selected,decimals>80?10n:ethers.parseUnits('10',decimals));
   const asset=await loadAsset(provider,tokenAddress);expect(asset.decimals).to.equal(decimals);
   const payment=validateBatch([{address:c.address,amount:decimals>80?'0.'+'0'.repeat(decimals-1)+'1':decimals?'1.'+'0'.repeat(decimals-1)+'1':'1'}],target,selected,asset);
   const state=await readWallet(provider,target,asset);expect(state.account).to.equal(selected);
   await submit(provider,await prepare(provider,'approve',payment,target));
   const plan=await prepare(provider,'send',payment,target);expect(plan.to).to.equal(target);expect(plan.value).to.equal(0);
   const hash=await submit(provider,plan);
   expect((await reconcile(provider,{...plan,from:selected,hash,value:'0'})).status).to.equal('confirmed');
   expect(await token.allowance(selected,target)).to.equal(0);
  }
 });
 it('independent wallets send native ETH without approvals and receipts match its value',async()=>{
  const before=await ethers.provider.getBalance(c.address);
  for(const sender of [a,b]){
   selected=sender.address;
   const payment=validateBatch([{address:c.address,amount:'0.012345678901234567'}],target,selected,ETH);
   const plan=await prepare(provider,'send',payment,target);expect(plan.value).to.equal(payment.total);
   const hash=await submit(provider,plan);
   const entry={...plan,from:selected,hash,value:plan.value.toString()};
   expect((await reconcile(provider,entry)).status).to.equal('confirmed');
   expect((await reconcile(provider,{...entry,value:'0'})).status).to.equal('unknown');
   await expect(prepare(provider,'approve',payment,target)).to.be.rejectedWith('does not need');
  }
  expect(await ethers.provider.getBalance(c.address)-before).to.equal(ethers.parseEther('0.024691357802469134'));
  expect(await ethers.provider.getBalance(target)).to.equal(0);
 });
 it('requires exactly the native batch total, neither overpayment nor underpayment',async()=>{
  for(const value of [0,1,3])await expect(batch.disperseEther([c.address],[2],{value})).to.be.revertedWithCustomError(batch,'IncorrectEtherValue');
 });
 it('rolls back earlier ETH transfers if a later recipient rejects payment',async()=>{
  const reject=await ethers.deployContract('RejectEther'),before=await ethers.provider.getBalance(c.address);
  await expect(batch.disperseEther([c.address,await reject.getAddress()],[1,1],{value:2})).to.be.revertedWithCustomError(batch,'EtherTransferFailed');
  expect(await ethers.provider.getBalance(c.address)).to.equal(before);
 });
 it('blocks a recipient from reentering another batch',async()=>{
  const receiver=await ethers.deployContract('ReenterEther',[target]);
  await batch.disperseEther([await receiver.getAddress()],[2],{value:2});
  expect(await receiver.reentered()).to.equal(false);
  expect(await ethers.provider.getBalance(await receiver.getAddress())).to.equal(2);
 });
 it('rejects false-return ERC20 transfers and non-contract token addresses',async()=>{
  const token=await ethers.deployContract('FalseToken');
  await expect(batch.disperseToken(await token.getAddress(),[c.address],[1])).to.be.reverted;
  await expect(batch.disperseToken(b.address,[c.address],[1])).to.be.revertedWithCustomError(batch,'InvalidToken');
 });
 it('has no owner or privileged caller, and cannot use somebody else’s token approval',async()=>{
  expect(batch.interface.getFunction('owner')).to.equal(null);expect(batch.interface.getFunction('USDT')).to.equal(null);
  const token=await ethers.deployContract('DecimalToken',[18]);await token.mint(a.address,100);await token.approve(target,100);
  await expect(batch.connect(b).disperseToken(await token.getAddress(),[c.address],[10])).to.be.reverted;
  expect(await token.balanceOf(a.address)).to.equal(100);expect(await token.allowance(a.address,target)).to.equal(100);
 });
 it('validates array sizes, zero amounts, overflow and unsafe recipients',async()=>{
  await expect(batch.disperseEther([],[],{value:0})).to.be.revertedWithCustomError(batch,'InvalidBatch');
  await expect(batch.disperseEther([c.address],[],{value:0})).to.be.revertedWithCustomError(batch,'InvalidBatch');
  await expect(batch.disperseEther([c.address],[0],{value:0})).to.be.revertedWithCustomError(batch,'ZeroAmount');
  await expect(batch.disperseEther([c.address,d.address],[ethers.MaxUint256,1],{value:0})).to.be.revertedWithPanic(0x11);
  for(const r of [ethers.ZeroAddress,target])await expect(batch.disperseEther([r],[1],{value:1})).to.be.revertedWithCustomError(batch,'InvalidRecipient');
 });
 it('includes ETH principal in the balance needed for gas',async()=>{
  await network.provider.send('hardhat_setBalance',[a.address,ethers.toQuantity(ethers.parseEther('1'))]);
  const payment=validateBatch([{address:c.address,amount:'1'}],target,selected,ETH);
  await expect(prepare(provider,'send',payment,target)).to.be.rejected;
 });
 it('allows payments to another own address and explicit self-recipients',async()=>{
  await expect(batch.disperseEther([a.address,b.address],[1,1],{value:2})).not.to.be.reverted;
  const token=await ethers.deployContract('DecimalToken',[0]);await token.mint(a.address,5);await token.approve(target,2);
  await batch.disperseToken(await token.getAddress(),[a.address,b.address],[1,1]);
  expect(await token.balanceOf(a.address)).to.equal(4);expect(await token.balanceOf(b.address)).to.equal(1);
 });
 it('reflects token-defined transfer fees without a USDT-only exact-balance restriction',async()=>{
  const token=await ethers.deployContract('TetherToken',[0,'Tether USD','USDT',6]);await token.issue(1000000);await token.transfer(b.address,1000000);await token.setParams(10,1);await token.connect(b).approve(target,1000000);
  await batch.connect(b).disperseToken(await token.getAddress(),[c.address],[1000000]);
  expect(await token.balanceOf(c.address)).to.equal(999000);
 });
});
