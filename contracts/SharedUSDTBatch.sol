// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import {ReentrancyGuard} from '@openzeppelin/contracts/utils/ReentrancyGuard.sol';

/// @title Shared USDT batch payments on Ethereum mainnet
/// @notice Any caller can distribute only their own approved USDT. A failed
/// payment reverts the entire batch. Amounts are in USDT's six-decimal units.
contract SharedUSDTBatch is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public constant USDT = IERC20(0xdAC17F958D2ee523a2206206994597C13D831ec7);

    error WrongChain(uint256 chainId);
    error InvalidBatch();
    error InvalidRecipient(uint256 index, address recipient);
    error ZeroAmount(uint256 index);
    error UnexpectedReceivedAmount(uint256 index);

    event BatchSent(address indexed sender, uint256 recipients, uint256 total);

    constructor() {
        if (block.chainid != 1) revert WrongChain(block.chainid);
    }

    /// @notice Approve this contract on USDT first, then supply matching arrays.
    /// @dev Never pulls funds from an arbitrary third party, even if they approved
    /// this contract. Duplicate recipients are paid once per row, in order.
    function disperseUSDT(address[] calldata recipients, uint256[] calldata amounts)
        external nonReentrant
    {
        uint256 length = recipients.length;
        if (length == 0 || length != amounts.length) revert InvalidBatch();

        uint256 total;
        for (uint256 i = 0; i < length; ++i) {
            address recipient = recipients[i];
            if (recipient == address(0) || recipient == address(this) ||
                recipient == address(USDT) || recipient == msg.sender) {
                revert InvalidRecipient(i, recipient);
            }
            if (amounts[i] == 0) revert ZeroAmount(i);
            total += amounts[i];
        }

        for (uint256 i = 0; i < length; ++i) {
            uint256 beforeBalance = USDT.balanceOf(recipients[i]);
            USDT.safeTransferFrom(msg.sender, recipients[i], amounts[i]);
            // Reject underpayments if Tether later enables transfer fees.
            uint256 afterBalance = USDT.balanceOf(recipients[i]);
            if (afterBalance < beforeBalance || afterBalance - beforeBalance != amounts[i]) {
                revert UnexpectedReceivedAmount(i);
            }
        }
        emit BatchSent(msg.sender, length, total);
    }

}
