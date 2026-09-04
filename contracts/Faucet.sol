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

    /// A relayer allowed to push gas to an address that has none. The cooldown is
    /// enforced against the RECIPIENT, not the caller, so a compromised relayer
    /// still cannot drain this faster than the schedule allows.
    mapping(address => bool) public isDripper;

    event Dripped(address indexed to, uint256 amount);
    event DripperSet(address indexed dripper, bool allowed);
    event Funded(address indexed from, uint256 amount);
    event ConfigUpdated(uint256 dripAmount, uint256 cooldown);

    constructor() payable Ownable(msg.sender) {}

    receive() external payable { emit Funded(msg.sender, msg.value); }

    function setDripper(address dripper, bool allowed) external onlyOwner {
        isDripper[dripper] = allowed;
        emit DripperSet(dripper, allowed);
    }

    /**
     * @dev Push gas to a wallet that has none.
     *
     * Claiming by transaction is a chicken and egg problem: you need gas to ask
     * for gas. A relayer calls this so a visitor with an empty wallet can be
     * funded without signing anything. Per-recipient cooldown is enforced here,
     * on-chain, so the relayer holds no state and cannot be spammed into
     * emptying the faucet.
     */
    function dripTo(address to) external nonReentrant {
        require(isDripper[msg.sender], "Not a dripper");
        require(to != address(0), "Invalid recipient");
        require(block.timestamp >= lastClaimed[to] + cooldown, "Recipient is on cooldown");
        require(address(this).balance >= dripAmount, "Faucet is dry");

        lastClaimed[to] = block.timestamp;
        (bool sent, ) = to.call{value: dripAmount}("");
        require(sent, "Transfer failed");

        emit Dripped(to, dripAmount);
    }

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
