// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IncomeRegistry} from "./IncomeRegistry.sol";

/**
 * @title CreditLine (Creditcoin)
 * @dev Unsecured credit, sized by income proven from another chain.
 *
 * The borrower posts nothing. Their limit is derived entirely from the record in
 * IncomeRegistry — average proven payment, multiplied by a factor that grows with
 * how many periods they have actually been paid. Two payments buys you a fraction
 * of a period; a long record buys you more than one.
 *
 * The line freezes if the record goes stale: income that stopped arriving is the
 * only default signal an unsecured lender has, and it is the one signal the
 * oracle can prove.
 */
contract CreditLine is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IncomeRegistry public immutable registry;
    IERC20 public immutable token;

    /// A record older than this many seconds is treated as stale and the line freezes.
    uint64 public stalePeriodSeconds = 45 days;

    struct Loan {
        uint256 drawn;
        uint256 repaid;
    }

    mapping(address => Loan) public loans;

    event Drawn(address indexed borrower, uint256 amount, uint256 limit, uint256 outstanding);
    event Repaid(address indexed borrower, uint256 amount, uint256 outstanding);
    event StalePeriodUpdated(uint64 seconds_);

    constructor(address _registry, address _token) Ownable(msg.sender) {
        registry = IncomeRegistry(_registry);
        token = IERC20(_token);
    }

    function setStalePeriod(uint64 seconds_) external onlyOwner {
        require(seconds_ > 0, "Stale period must be > 0");
        stalePeriodSeconds = seconds_;
        emit StalePeriodUpdated(seconds_);
    }

    /// @dev Lender-side funding. In this MVP a single lender funds the pool; a
    /// production version is a market. Deliberately out of scope.
    function fund(uint256 amount) external {
        token.safeTransferFrom(msg.sender, address(this), amount);
    }

    /**
     * @dev The credit multiplier, in basis points of one average payment.
     * Grows with proven history and caps out — history buys trust, slowly.
     *   1 payment   ->  0     (one payment is not a pattern)
     *   2 payments  ->  2500  (25% of one period)
     *   3 payments  ->  5000
     *   4 payments  ->  7500
     *   5 payments  -> 10000  (one full period of income)
     *   6+          -> 12500  (capped at 1.25 periods)
     */
    function multiplierBps(uint64 paymentCount) public pure returns (uint256) {
        if (paymentCount < 2) return 0;
        if (paymentCount >= 6) return 12_500;
        return (uint256(paymentCount) - 1) * 2_500;
    }

    /// @dev True when the last proven payment is recent enough to still count.
    function isCurrent(address borrower) public view returns (bool) {
        IncomeRegistry.IncomeRecord memory r = registry.getRecord(borrower);
        if (!r.exists) return false;
        return block.timestamp <= uint256(r.lastPeriod) + stalePeriodSeconds;
    }

    /// @dev The borrower's limit, derived purely from proven foreign income.
    function limitOf(address borrower) public view returns (uint256) {
        IncomeRegistry.IncomeRecord memory r = registry.getRecord(borrower);
        if (!r.exists || !isCurrent(borrower)) return 0;
        uint256 avg = registry.averagePayment(borrower);
        return (avg * multiplierBps(r.paymentCount)) / 10_000;
    }

    function outstanding(address borrower) public view returns (uint256) {
        Loan memory l = loans[borrower];
        return l.drawn - l.repaid;
    }

    function available(address borrower) public view returns (uint256) {
        uint256 limit = limitOf(borrower);
        uint256 owed = outstanding(borrower);
        return owed >= limit ? 0 : limit - owed;
    }

    /// @dev Borrow against proven income. No collateral is taken, ever.
    function draw(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(isCurrent(msg.sender), "Income record is stale or absent");
        require(amount <= available(msg.sender), "Exceeds available credit");
        require(token.balanceOf(address(this)) >= amount, "Pool underfunded");

        loans[msg.sender].drawn += amount;
        token.safeTransfer(msg.sender, amount);

        emit Drawn(msg.sender, amount, limitOf(msg.sender), outstanding(msg.sender));
    }

    function repay(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        uint256 owed = outstanding(msg.sender);
        require(owed > 0, "Nothing outstanding");
        if (amount > owed) amount = owed;

        loans[msg.sender].repaid += amount;
        token.safeTransferFrom(msg.sender, address(this), amount);

        emit Repaid(msg.sender, amount, outstanding(msg.sender));
    }
}
