const {expect}=require('chai');
const {ethers,network}=require('hardhat');
const ui='../../.test-build/';
const build=require('../../lib/contract-build.json');
const {TOKEN,validateBatch}=require(ui+'batch.js');
const {readWallet,prepare,submit,verifyContract}=require(ui+'wallet.js');
const {reconcile}=require(ui+'history.js');
const {prepareDeployment,submitDeployment,checkDeployment,clearUnsubmittedDeployment}=require(ui+'deployment.js');

describe('Shared frontend against the exact exported contract and real Tether source',function(){
  this.timeout(60000);
  let issuer,senderA,senderB,recipient,token,contract,provider,selected;
  beforeEach(async()=>{
    if(network.name!=='hardhat')throw new Error('LOCAL NETWORK ONLY');
    await network.provider.send('hardhat_reset');
    [issuer,senderA,senderB,recipient]=await ethers.getSigners();
    const fixture=await ethers.deployContract('TetherToken',[0,'Tether USD','USDT',6]);
    const address=await fixture.getAddress();
    await network.provider.send('hardhat_setCode',[TOKEN,await ethers.provider.getCode(address)]);
    for(let slot=0;slot<32;slot++)await network.provider.send('hardhat_setStorageAt',[TOKEN,ethers.toBeHex(slot),await ethers.provider.getStorage(address,slot)]);
    token=await ethers.getContractAt('TetherToken',TOKEN,issuer);
    await token.issue(2000000000n);
    await token.transfer(senderA.address,1000000000n);
    await token.transfer(senderB.address,1000000000n);
    const deployed=await new ethers.ContractFactory(build.abi,build.bytecode,issuer).deploy();
    contract=await deployed.getAddress();selected=senderA.address;
    provider={request:async request=>request.method==='eth_accounts'?[selected]:network.provider.request(request)};
  });
  it('two wallets approve and send independently through one shared contract',async()=>{
    const amounts=['12.345678','0.000001'];
    for(const [index,sender] of [senderA,senderB].entries()){
      selected=sender.address;
      const state=await readWallet(provider,contract);expect(state.account).to.equal(selected);expect(state.allowance).to.equal(0n);
      const batch=validateBatch([{address:recipient.address,amount:amounts[index]}],contract,selected);
      await submit(provider,await prepare(provider,'approve',batch,contract));
      const plan=await prepare(provider,'send',batch,contract);
      const hash=await submit(provider,plan);
      expect(await token.allowance(selected,contract)).to.equal(0n);
      expect((await reconcile(provider,{from:selected,contract,hash,to:plan.to,data:plan.data,status:'pending'})).status).to.equal('confirmed');
    }
    expect(await token.balanceOf(recipient.address)).to.equal(12345679n);
    expect(await token.balanceOf(senderA.address)).to.equal(987654322n);
    expect(await token.balanceOf(senderB.address)).to.equal(999999999n);
  });
  it('switching wallets invalidates a prepared approval without spending either allowance',async()=>{
    const batch=validateBatch([{address:recipient.address,amount:'1'}],contract,selected);
    const plan=await prepare(provider,'approve',batch,contract);
    selected=senderB.address;
    await expect(submit(provider,plan)).to.be.rejectedWith('changed');
    expect(await token.allowance(senderA.address,contract)).to.equal(0n);
    expect(await token.allowance(senderB.address,contract)).to.equal(0n);
  });
  it('keeps zero-first reset and revoke scoped to the connected wallet',async()=>{
    await token.connect(senderA).approve(contract,1);
    await token.connect(senderB).approve(contract,7);
    const batch=validateBatch([{address:recipient.address,amount:'1'}],contract,selected);
    await submit(provider,await prepare(provider,'reset',batch,contract));
    await submit(provider,await prepare(provider,'approve',batch,contract));
    expect(await token.allowance(senderB.address,contract)).to.equal(7);
    await submit(provider,await prepare(provider,'revoke',{rows:[],addresses:[],amounts:[],total:0n,fingerprint:'revoke',duplicates:[]},contract));
    expect(await token.allowance(senderA.address,contract)).to.equal(0);
    expect(await token.allowance(senderB.address,contract)).to.equal(7);
  });
  it('rejects arbitrary runtime before asking for approval',async()=>{
    await expect(verifyContract(provider,TOKEN)).to.be.rejectedWith('not the verified');
  });
  it('deploys and recovers the exact new contract through the frontend',async()=>{
    const plan=await prepareDeployment(provider);
    const hash=await submitDeployment(provider,plan);
    const intent={...plan,hash,status:'pending'};
    const result=await checkDeployment(provider,intent);
    expect(result.status).to.equal('confirmed');expect(result.contract).to.equal(plan.expected);
    expect(await ethers.provider.getCode(result.contract)).to.equal(build.runtime);
    const recovered=await checkDeployment(provider,{...plan,status:'unknown'});
    expect(recovered.contract).to.equal(result.contract);
    await expect(clearUnsubmittedDeployment(provider,intent)).to.be.rejectedWith('advanced or pending');
    selected=senderB.address;
    expect((await readWallet(provider,result.contract)).account).to.equal(senderB.address);
  });
  it('cannot deploy from a different account after review',async()=>{
    const plan=await prepareDeployment(provider);selected=senderB.address;
    await expect(submitDeployment(provider,plan)).to.be.rejectedWith('changed');
    expect(await ethers.provider.getCode(plan.expected)).to.equal('0x');
  });
});
