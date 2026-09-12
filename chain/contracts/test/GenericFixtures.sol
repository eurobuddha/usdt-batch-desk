// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {ERC20} from '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import {SharedBatch} from '../SharedBatch.sol';
contract DecimalToken is ERC20 {
    uint8 private immutable places;
    constructor(uint8 value) ERC20('Example token', 'TEST') { places=value; }
    function decimals() public view override returns(uint8) { return places; }
    function mint(address to,uint256 amount) external { _mint(to,amount); }
}
contract FalseToken {
    function transferFrom(address,address,uint256) external pure returns(bool) { return false; }
}
contract RejectEther { receive() external payable { revert('Rejected'); } }
contract ReenterEther {
    SharedBatch public immutable batch;
    bool public reentered;
    constructor(SharedBatch value) { batch=value; }
    receive() external payable {
        address[] memory recipients=new address[](1); recipients[0]=address(123);
        uint256[] memory amounts=new uint256[](1); amounts[0]=1;
        try batch.disperseEther{value:1}(recipients,amounts) { reentered=true; } catch {}
    }
}
