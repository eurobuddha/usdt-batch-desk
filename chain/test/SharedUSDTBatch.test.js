const { expect } = require('chai');
const { ethers, network } = require('hardhat');

const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const units = value => ethers.parseUnits(value, 6);

describe('SharedUSDTBatch with the unchanged local TetherToken source', function () {
  let issuer, owner, alice, bob, outsider, token, batch, target;

  beforeEach(async function () {
    await network.provider.send('hardhat_reset');
    [issuer, owner, alice, bob, outsider] = await ethers.getSigners();
    // Install a freshly constructed, zero-supply Tether fixture at the fixed
    // mainnet address on the local test chain only. No mainnet writes occur.
    const fixture = await ethers.deployContract('TetherToken', [0, 'Tether USD', 'USDT', 6]);
    const fixtureAddress = await fixture.getAddress();
    await network.provider.send('hardhat_setCode', [USDT, await ethers.provider.getCode(fixtureAddress)]);
    // Copy constructor-initialized scalar and short-string storage; with zero
    // supply, the balance and allowance mappings are empty in both instances.
    for (let slot = 0; slot < 32; slot++) {
      await network.provider.send('hardhat_setStorageAt', [
        USDT, ethers.toBeHex(slot), await ethers.provider.getStorage(fixtureAddress, slot),
      ]);
    }
    token = await ethers.getContractAt('TetherToken', USDT, issuer);
    await token.issue(units('1000000'));
    await token.transfer(owner.address, units('10000'));
    if (process.env.USE_EXPORT_BYTECODE) {
      const fs = require('node:fs');
      const abi = JSON.parse(fs.readFileSync('exports/SharedUSDTBatch.abi.json', 'utf8'));
      const bytecode = fs.readFileSync('exports/SharedUSDTBatch.bytecode.txt', 'utf8').trim();
      batch = await new ethers.ContractFactory(abi, bytecode, issuer).deploy();
    } else {
      batch = await ethers.deployContract('SharedUSDTBatch');
    }
    target = await batch.getAddress();
  });

  it('has no owner, admin, or third-party source parameter', async function () {
    expect(await batch.USDT()).to.equal(USDT);
    expect(batch.interface.getFunction('owner')).to.equal(null);
    expect(batch.interface.getFunction('recoverTokens')).to.equal(null);
    expect(batch.interface.getFunction('disperseUSDT').inputs.length).to.equal(2);
  });

  it('pays exact six-decimal amounts directly, emits a summary and consumes exact approval', async function () {
    const amounts = [units('12.345678'), units('0.000001')];
    const total = amounts[0] + amounts[1];
    await token.connect(owner).approve(target, total);
    const tx = batch.connect(owner).disperseUSDT([alice.address, bob.address], amounts);
    await expect(tx).to.emit(batch, 'BatchSent').withArgs(owner.address, 2, total);
    await expect(tx).to.emit(token, 'Transfer').withArgs(owner.address, alice.address, amounts[0]);
    expect(await token.balanceOf(alice.address)).to.equal(amounts[0]);
    expect(await token.balanceOf(bob.address)).to.equal(amounts[1]);
    expect(await token.balanceOf(owner.address)).to.equal(units('10000') - total);
    expect(await token.balanceOf(target)).to.equal(0);
    expect(await token.allowance(owner.address, target)).to.equal(0);
  });

  it('isolates approvals and balances across independent senders', async function () {
    await token.connect(owner).approve(target, 100);
    await expect(batch.connect(outsider).disperseUSDT([alice.address], [10])).to.be.reverted;
    expect(await token.allowance(owner.address, target)).to.equal(100);
    await token.transfer(outsider.address, 30);
    await token.connect(outsider).approve(target, 30);
    await batch.connect(outsider).disperseUSDT([alice.address], [20]);
    expect(await token.balanceOf(outsider.address)).to.equal(10);
    expect(await token.allowance(outsider.address, target)).to.equal(10);
    expect(await token.balanceOf(owner.address)).to.equal(units('10000'));
    expect(await token.allowance(owner.address, target)).to.equal(100);
    await batch.connect(owner).disperseUSDT([bob.address], [40]);
    expect(await token.balanceOf(bob.address)).to.equal(40);
    expect(await token.allowance(owner.address, target)).to.equal(60);
    expect(await token.allowance(outsider.address, target)).to.equal(10);
  });

  for (const [label, recipients, amounts] of [
    ['empty arrays', [], []],
    ['missing amount', ['alice', 'bob'], [1]],
    ['extra amount', ['alice'], [1, 2]],
  ]) {
    it(`rejects ${label}`, async function () {
      const addresses = recipients.map(name => name === 'alice' ? alice.address : bob.address);
      await expect(batch.connect(owner).disperseUSDT(addresses, amounts))
        .to.be.revertedWithCustomError(batch, 'InvalidBatch');
    });
  }

  it('rejects zero, sender, batch-contract and token-contract recipients before spending', async function () {
    await token.connect(owner).approve(target, 10);
    for (const recipient of [ethers.ZeroAddress, owner.address, target, USDT]) {
      await expect(batch.connect(owner).disperseUSDT([alice.address, recipient], [1, 1]))
        .to.be.revertedWithCustomError(batch, 'InvalidRecipient').withArgs(1, recipient);
    }
    expect(await token.balanceOf(alice.address)).to.equal(0);
    expect(await token.allowance(owner.address, target)).to.equal(10);
  });

  it('rejects zero amounts and total overflow', async function () {
    await expect(batch.connect(owner).disperseUSDT([alice.address], [0]))
      .to.be.revertedWithCustomError(batch, 'ZeroAmount').withArgs(0);
    await expect(batch.connect(owner).disperseUSDT([alice.address, bob.address], [ethers.MaxUint256, 1]))
      .to.be.revertedWithPanic(0x11);
  });

  it('rejects missing approval', async function () {
    await expect(batch.connect(owner).disperseUSDT([alice.address], [1])).to.be.reverted;
    expect(await token.balanceOf(alice.address)).to.equal(0);
  });

  it('rolls back earlier transfers and allowance consumption when a later allowance check fails', async function () {
    await token.connect(owner).approve(target, units('10'));
    await expect(batch.connect(owner).disperseUSDT([alice.address, bob.address], [units('6'), units('6')]))
      .to.be.reverted;
    expect(await token.balanceOf(alice.address)).to.equal(0);
    expect(await token.balanceOf(bob.address)).to.equal(0);
    expect(await token.balanceOf(owner.address)).to.equal(units('10000'));
    expect(await token.allowance(owner.address, target)).to.equal(units('10'));
  });

  it('rolls back the entire batch on insufficient balance', async function () {
    await token.connect(owner).approve(target, units('12000'));
    await expect(batch.connect(owner).disperseUSDT([alice.address, bob.address], [units('6000'), units('6000')]))
      .to.be.reverted;
    expect(await token.balanceOf(alice.address)).to.equal(0);
    expect(await token.balanceOf(owner.address)).to.equal(units('10000'));
    expect(await token.allowance(owner.address, target)).to.equal(units('12000'));
  });

  it('handles repeated recipients as explicit additional payments', async function () {
    await token.connect(owner).approve(target, 3);
    await batch.connect(owner).disperseUSDT([alice.address, alice.address], [1, 2]);
    expect(await token.balanceOf(alice.address)).to.equal(3);
  });

  it('requires zero-first approval when replacing a nonzero USDT allowance', async function () {
    await token.connect(owner).approve(target, 10);
    await expect(token.connect(owner).approve(target, 20)).to.be.reverted;
    await token.connect(owner).approve(target, 0);
    await token.connect(owner).approve(target, 20);
    await batch.connect(owner).disperseUSDT([alice.address], [20]);
    expect(await token.allowance(owner.address, target)).to.equal(0);
  });

  it('reverts when Tether is paused and works again after unpause', async function () {
    await token.connect(owner).approve(target, 10);
    await token.pause();
    await expect(batch.connect(owner).disperseUSDT([alice.address], [10])).to.be.reverted;
    await token.unpause();
    await batch.connect(owner).disperseUSDT([alice.address], [10]);
    expect(await token.balanceOf(alice.address)).to.equal(10);
  });

  it('respects Tether sender blacklisting', async function () {
    await token.connect(owner).approve(target, 10);
    await token.addBlackList(owner.address);
    await expect(batch.connect(owner).disperseUSDT([alice.address], [10])).to.be.reverted;
    expect(await token.balanceOf(owner.address)).to.equal(units('10000'));
  });

  it('rejects underpayment if Tether enables transfer fees, rolling back earlier rows', async function () {
    await token.setParams(10, 1);
    await token.connect(owner).approve(target, units('101'));
    // First payment rounds to zero fee; second incurs a fee.
    await expect(batch.connect(owner).disperseUSDT([alice.address, bob.address], [1, units('100')]))
      .to.be.revertedWithCustomError(batch, 'UnexpectedReceivedAmount').withArgs(1);
    expect(await token.balanceOf(alice.address)).to.equal(0);
    expect(await token.balanceOf(bob.address)).to.equal(0);
    expect(await token.balanceOf(owner.address)).to.equal(units('10000'));
  });

  it('rejects accidental ETH payments', async function () {
    await expect(owner.sendTransaction({ to: target, value: 1 })).to.be.reverted;
    await expect(batch.connect(owner).disperseUSDT([alice.address], [1], { value: 1 })).to.be.reverted;
  });

  it('executes and measures a 100-recipient batch', async function () {
    const recipients = Array.from({ length: 100 }, (_, i) => ethers.getAddress(ethers.toBeHex(1000 + i, 20)));
    await token.connect(owner).approve(target, units('100'));
    const receipt = await (await batch.connect(owner).disperseUSDT(recipients, recipients.map(() => units('1')))).wait();
    for (const recipient of recipients) expect(await token.balanceOf(recipient)).to.equal(units('1'));
    expect(await token.balanceOf(owner.address)).to.equal(units('9900'));
    console.log(`      100 new recipient balances: ${receipt.gasUsed} gas (local Tether fixture)`);
  });
});
