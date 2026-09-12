// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import {ReentrancyGuard} from '@openzeppelin/contracts/utils/ReentrancyGuard.sol';

/// @title Caller-funded ETH and ERC-20 batch payments
/// @notice One deployment serves every sender and ERC-20 token. No owner or fees.
contract SharedBatch is ReentrancyGuard {
    using SafeERC20 for IERC20;
    error InvalidBatch();
    error InvalidToken();
    error InvalidRecipient(uint256 index, address recipient);
    error ZeroAmount(uint256 index);
    error IncorrectEtherValue(uint256 expected, uint256 received);
    error EtherTransferFailed(uint256 index);
    event BatchSent(address indexed sender, address indexed token, uint256 recipients, uint256 total);

    /// @notice Approve the selected token first. Only msg.sender's tokens are used.
    /// @dev Amounts are token base units. Token-defined fees/rebases still apply.
    function disperseToken(IERC20 token, address[] calldata recipients, uint256[] calldata amounts)
        external nonReentrant
    {
        if (address(token).code.length == 0 || address(token) == address(this)) revert InvalidToken();
        uint256 total = validate(recipients, amounts, address(token));
        for (uint256 i; i < recipients.length; ++i) {
            token.safeTransferFrom(msg.sender, recipients[i], amounts[i]);
        }
        emit BatchSent(msg.sender, address(token), recipients.length, total);
    }

    /// @notice Attach exactly the batch total. A rejected payment reverts the batch.
    function disperseEther(address[] calldata recipients, uint256[] calldata amounts)
        external payable nonReentrant
    {
        uint256 total = validate(recipients, amounts, address(0));
        if (msg.value != total) revert IncorrectEtherValue(total, msg.value);
        for (uint256 i; i < recipients.length; ++i) {
            (bool success,) = payable(recipients[i]).call{value: amounts[i]}('');
            if (!success) revert EtherTransferFailed(i);
        }
        emit BatchSent(msg.sender, address(0), recipients.length, total);
    }

    function validate(address[] calldata recipients, uint256[] calldata amounts, address token)
        private view returns (uint256 total)
    {
        if (recipients.length == 0 || recipients.length != amounts.length) revert InvalidBatch();
        for (uint256 i; i < recipients.length; ++i) {
            address recipient = recipients[i];
            if (recipient == address(0) || recipient == address(this) || recipient == token)
                revert InvalidRecipient(i, recipient);
            if (amounts[i] == 0) revert ZeroAmount(i);
            total += amounts[i];
        }
    }
}
