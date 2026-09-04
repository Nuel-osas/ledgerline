// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Faucet (Creditcoin CC3)
 * @dev Dispenses testnet CTC for gas so anyone can submit an Attestcoin proof
 * without asking for tokens first. Proof submission being permissionless is only
 * true in practice if a stranger can afford the transaction.
 *
 * Rate limited per address. A caller needs a little gas to call this, so it
 * tops up rather than cold-starts; the app links the Discord faucet for a
 * genuinely empty wallet.
 */
contract Faucet is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public dripAmount = 0.5 ether;   // CTC per claim
    uint256 public cooldown = 6 hours;

    mapping(address => uint256) public lastClaimed;

    event Dripped(address indexed to, uint256 amount);
    event Funded(address indexed from, uint256 amount);
    event ConfigUpdated(uint256 dripAmount, uint256 cooldown);

    constructor() payable Ownable(msg.sender) {}

    receive() external payable { emit Funded(msg.sender, msg.value); }

    function setConfig(uint256 _drip, uint256 _cooldown) external onlyOwner {
        require(_drip > 0, "Drip must be > 0");
        dripAmount = _drip;
        cooldown = _cooldown;
        emit ConfigUpdated(_drip, _cooldown);
    }

    /// @dev Seconds until `who` may claim again. Zero means claimable now.
    function claimableIn(address who) external view returns (uint256) {
        uint256 next = lastClaimed[who] + cooldown;
        return block.timestamp >= next ? 0 : next - block.timestamp;
    }

    function claim() external nonReentrant {
        require(block.timestamp >= lastClaimed[msg.sender] + cooldown, "Wait for the cooldown");
        require(address(this).balance >= dripAmount, "Faucet is dry");

        lastClaimed[msg.sender] = block.timestamp;
        (bool sent, ) = msg.sender.call{value: dripAmount}("");
        require(sent, "Transfer failed");

        emit Dripped(msg.sender, dripAmount);
    }

    /// @dev Recover the remaining balance after the hackathon.
    function drain(address payable to) external onlyOwner {
        (bool sent, ) = to.call{value: address(this).balance}("");
        require(sent, "Transfer failed");
    }
}
