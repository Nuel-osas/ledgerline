// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EvmV1Decoder} from "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol";
import {AttestBase} from "./AttestBase.sol";

/**
 * @title IncomeRegistry (execution chain: Creditcoin)
 * @dev Accumulates a worker's proven income history from a foreign chain.
 *
 * A worker paid on Ethereum has no assets on Creditcoin and nothing to pledge.
 * What they do have is a payment record. This contract turns that record into
 * on-chain history: each PaymentMade event on the source chain is proven through
 * the 0x0FD2 precompile and folded into a running total, a payment count, and a
 * first/last period — which is what a credit line reads instead of collateral.
 *
 * No bridge moves a token. Only the fact that the worker was paid crosses.
 */
contract IncomeRegistry is Ownable, AttestBase {
    struct IncomeRecord {
        uint256 totalReceived;   // sum of all proven payments
        uint64 paymentCount;     // number of distinct proven periods
        uint64 firstPeriod;      // earliest proven period
        uint64 lastPeriod;       // latest proven period
        uint64 lastAttestedBlock;
        bool exists;
    }

    // keccak256("PaymentMade(address,uint256,uint64)")
    bytes32 public constant PAYMENT_EVENT_SIGNATURE = keccak256("PaymentMade(address,uint256,uint64)");

    /// The source-chain Payer authorized to emit the events we act on. Without
    /// this, anyone could deploy a contract that emits PaymentMade for their own
    /// address and mint themselves a credit history.
    address public sourcePayer;

    mapping(address => IncomeRecord) public records;
    /// A period may only be counted once per worker, even across transactions.
    mapping(address => mapping(uint64 => bool)) public periodCounted;

    event SourcePayerRegistered(address indexed payer);
    event IncomeAttested(address indexed worker, uint256 amount, uint64 period, uint256 totalReceived, uint64 paymentCount);

    constructor() Ownable(msg.sender) {}

    function registerSourcePayer(address payer) external onlyOwner {
        require(payer != address(0), "Payer cannot be the zero address");
        sourcePayer = payer;
        emit SourcePayerRegistered(payer);
    }

    function getRecord(address worker) external view returns (IncomeRecord memory) {
        return records[worker];
    }

    /// @dev Average proven payment. Zero until at least one payment is attested.
    function averagePayment(address worker) public view returns (uint256) {
        IncomeRecord memory r = records[worker];
        if (r.paymentCount == 0) return 0;
        return r.totalReceived / r.paymentCount;
    }

    /// @dev Applies every PaymentMade emitted by the registered payer in the
    /// proven transaction, in log order. Foreign logs are skipped rather than
    /// reverted on — reverting would let an attacker prefix a decoy log and
    /// censor a genuine payment forever (gluwa/USC-Builder-Examples#37).
    function _applyProvenTransaction(bytes32, uint64 blockHeight, bytes memory encodedTransaction)
        internal
        override
    {
        uint8 txType = EvmV1Decoder.getTransactionType(encodedTransaction);
        require(EvmV1Decoder.isValidTransactionType(txType), "Unsupported transaction type");

        // Inclusion is not success. On EVM sources a reverted transaction carries
        // no logs, so the log-presence check below subsumes this; it is kept as an
        // explicit invariant for non-EVM sources and decoder changes.
        EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(encodedTransaction);
        require(receipt.receiptStatus == 1, "Source transaction did not succeed");

        require(sourcePayer != address(0), "Source payer not registered");

        uint256 applied;
        for (uint256 i = 0; i < receipt.receiptLogs.length; i++) {
            EvmV1Decoder.LogEntry memory log = receipt.receiptLogs[i];
            if (log.address_ != sourcePayer) continue;
            if (log.topics.length == 0) continue;
            if (log.topics[0] != PAYMENT_EVENT_SIGNATURE) continue;

            require(log.topics.length == 2, "Invalid PaymentMade topics");
            require(log.data.length == 64, "Invalid PaymentMade data");

            address worker = address(uint160(uint256(log.topics[1])));
            (uint256 amount, uint64 period) = abi.decode(log.data, (uint256, uint64));
            _credit(worker, amount, period, blockHeight);
            applied++;
        }

        require(applied > 0, "No payment events in transaction");
    }

    function _credit(address worker, uint256 amount, uint64 period, uint64 blockHeight) internal {
        require(!periodCounted[worker][period], "Period already counted");
        periodCounted[worker][period] = true;

        IncomeRecord storage r = records[worker];
        if (!r.exists) {
            r.exists = true;
            r.firstPeriod = period;
        }

        r.totalReceived += amount;
        r.paymentCount += 1;
        if (period > r.lastPeriod) r.lastPeriod = period;
        if (period < r.firstPeriod) r.firstPeriod = period;
        r.lastAttestedBlock = blockHeight;

        emit IncomeAttested(worker, amount, period, r.totalReceived, r.paymentCount);
    }
}
