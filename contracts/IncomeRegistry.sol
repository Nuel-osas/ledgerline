// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EvmV1Decoder} from "@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol";
import {AttestBase} from "./AttestBase.sol";

/**
 * @title IncomeRegistry (execution chain: Creditcoin)
 * @dev The one place a DePIN operator's whole earning history exists.
 *
 * An operator runs a wireless hotspot on one network, a storage node on another,
 * a sensor on a third. Each network settles its own rewards on its own chain and
 * sees only its own slice. None of them can underwrite the operator, because none
 * of them can see enough. To every individual network the operator looks
 * unbankable, while in aggregate they are obviously good for it.
 *
 * This registry accepts proofs from MANY source networks and folds them into a
 * single profile. Each network is registered by the contract that emits its
 * settlements, so a network cannot vouch for revenue it did not pay, and nobody
 * can invent a network. The credit line reads the aggregate.
 *
 * Nothing is bridged. Only the fact that the operator was paid crosses.
 */
contract IncomeRegistry is Ownable, AttestBase {
    struct IncomeRecord {
        uint256 totalReceived;   // across every registered network
        uint64 paymentCount;     // distinct settlements proven
        uint64 firstPeriod;
        uint64 lastPeriod;
        uint64 lastAttestedBlock;
        uint8 networkCount;      // how many distinct networks have paid them
        bool exists;
    }

    struct Network {
        string name;             // "Helium-style wireless", "Storage", ...
        bool registered;
    }

    // keccak256("PaymentMade(address,uint256,uint64)")
    bytes32 public constant PAYMENT_EVENT_SIGNATURE = keccak256("PaymentMade(address,uint256,uint64)");

    /// Source contracts authorised to emit countable settlements, one per network.
    mapping(address => Network) public networks;
    address[] public networkList;

    mapping(address => IncomeRecord) public records;
    /// A period counts once per operator per network. Two networks may legitimately
    /// pay for the same calendar period; the same network may not pay twice.
    mapping(address => mapping(address => mapping(uint64 => bool))) public periodCountedBy;
    /// Per-network totals, so a lender can see concentration rather than just a sum.
    mapping(address => mapping(address => uint256)) public earnedOn;
    mapping(address => mapping(address => bool)) private _seenNetwork;

    event NetworkRegistered(address indexed source, string name);
    event IncomeAttested(
        address indexed operator, address indexed source, uint256 amount,
        uint64 period, uint256 totalReceived, uint64 paymentCount
    );

    constructor() Ownable(msg.sender) {}

    function registerNetwork(address source, string calldata name) external onlyOwner {
        require(source != address(0), "Source cannot be the zero address");
        require(!networks[source].registered, "Network already registered");
        networks[source] = Network({name: name, registered: true});
        networkList.push(source);
        emit NetworkRegistered(source, name);
    }

    function networkCount() external view returns (uint256) { return networkList.length; }
    function getRecord(address operator) external view returns (IncomeRecord memory) { return records[operator]; }

    /// @dev Backwards-compatible view: has this operator been paid for this period
    /// by any registered network?
    function periodCounted(address operator, uint64 period) external view returns (bool) {
        for (uint256 i = 0; i < networkList.length; i++) {
            if (periodCountedBy[operator][networkList[i]][period]) return true;
        }
        return false;
    }

    function averagePayment(address operator) public view returns (uint256) {
        IncomeRecord memory r = records[operator];
        if (r.paymentCount == 0) return 0;
        return r.totalReceived / r.paymentCount;
    }

    /// @dev Applies every PaymentMade emitted by a REGISTERED network in the proven
    /// transaction, in log order. Logs from unregistered contracts are skipped
    /// rather than reverted on: reverting would let an attacker prefix a decoy log
    /// and censor a genuine settlement forever (gluwa/USC-Builder-Examples#37).
    function _applyProvenTransaction(bytes32, uint64 blockHeight, bytes memory encodedTransaction)
        internal
        override
    {
        uint8 txType = EvmV1Decoder.getTransactionType(encodedTransaction);
        require(EvmV1Decoder.isValidTransactionType(txType), "Unsupported transaction type");

        EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(encodedTransaction);
        require(receipt.receiptStatus == 1, "Source transaction did not succeed");
        require(networkList.length > 0, "No networks registered");

        uint256 applied;
        for (uint256 i = 0; i < receipt.receiptLogs.length; i++) {
            EvmV1Decoder.LogEntry memory log = receipt.receiptLogs[i];
            if (!networks[log.address_].registered) continue;
            if (log.topics.length == 0) continue;
            if (log.topics[0] != PAYMENT_EVENT_SIGNATURE) continue;

            require(log.topics.length == 2, "Invalid PaymentMade topics");
            require(log.data.length == 64, "Invalid PaymentMade data");

            address operator = address(uint160(uint256(log.topics[1])));
            (uint256 amount, uint64 period) = abi.decode(log.data, (uint256, uint64));
            _credit(operator, log.address_, amount, period, blockHeight);
            applied++;
        }

        require(applied > 0, "No settlements from a registered network");
    }

    function _credit(address operator, address source, uint256 amount, uint64 period, uint64 blockHeight) internal {
        require(!periodCountedBy[operator][source][period], "Period already counted for this network");
        periodCountedBy[operator][source][period] = true;

        IncomeRecord storage r = records[operator];
        if (!r.exists) {
            r.exists = true;
            r.firstPeriod = period;
        }
        if (!_seenNetwork[operator][source]) {
            _seenNetwork[operator][source] = true;
            r.networkCount += 1;
        }

        earnedOn[operator][source] += amount;
        r.totalReceived += amount;
        r.paymentCount += 1;
        if (period > r.lastPeriod) r.lastPeriod = period;
        if (period < r.firstPeriod) r.firstPeriod = period;
        r.lastAttestedBlock = blockHeight;

        emit IncomeAttested(operator, source, amount, period, r.totalReceived, r.paymentCount);
    }
}
