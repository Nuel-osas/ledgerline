// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title Payer (source chain: Ethereum Sepolia)
 * @dev Stands in for a payroll rail, a gig platform, or a remittance corridor —
 * anything that pays a worker in stablecoins on a chain that is not Creditcoin.
 *
 * The only thing that matters downstream is the event: every payment emits
 * PaymentMade, which the worker can later prove to Creditcoin through the
 * Attestcoin oracle. The payer never has to know Creditcoin exists, never
 * signs anything there, and never bridges a token. Only the fact crosses.
 */
contract Payer {
    using SafeERC20 for IERC20;

    /// @param worker  who was paid
    /// @param amount  how much, in token units
    /// @param period  the pay period this settles, as a unix timestamp truncated
    ///                to the period boundary — this is what proves *cadence*,
    ///                not just that money moved once
    event PaymentMade(address indexed worker, uint256 amount, uint64 period);

    IERC20 public immutable token;

    /// Last period already settled for a worker, so one period cannot be paid twice.
    mapping(address => uint64) public lastPeriodPaid;

    constructor(address _token) {
        token = IERC20(_token);
    }

    /**
     * @dev Pay a worker for a period. Anyone may fund a payment — the payer is
     * not privileged, because nothing about the credit decision depends on who
     * sent it. What the registry on Creditcoin checks is that this contract
     * emitted the event.
     */
    function pay(address worker, uint256 amount, uint64 period) external {
        require(worker != address(0), "Invalid worker");
        require(amount > 0, "Amount must be greater than 0");
        require(period > lastPeriodPaid[worker], "Period already paid");

        lastPeriodPaid[worker] = period;
        token.safeTransferFrom(msg.sender, worker, amount);

        emit PaymentMade(worker, amount, period);
    }
}
