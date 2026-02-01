// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title DanhDeOracle - Lottery Result Oracle for DanhDe
 * @notice Stores and provides Vietnamese national lottery results
 * @dev Results are submitted by authorized operators (can be automated via backend)
 */
contract DanhDeOracle is AccessControl {
    bytes32 public constant UPDATER_ROLE = keccak256("UPDATER_ROLE");

    struct LotteryResult {
        uint8 lastTwoDigits;      // 00-99
        uint256 fullNumber;       // Full lottery number for reference
        uint256 timestamp;        // When result was recorded
        string drawId;            // e.g., "2024-01-15-MB" (date + region)
        bool exists;
    }

    // Results indexed by draw ID
    mapping(string => LotteryResult) public results;

    // Latest result
    LotteryResult public latestResult;

    // Historical results by date (YYYYMMDD format as uint)
    mapping(uint256 => LotteryResult) public resultsByDate;

    // Events
    event ResultSubmitted(
        string indexed drawId,
        uint8 lastTwoDigits,
        uint256 fullNumber,
        uint256 timestamp
    );

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(UPDATER_ROLE, msg.sender);
    }

    /**
     * @notice Submit a new lottery result
     * @param drawId Unique identifier for the draw (e.g., "20240115-MB")
     * @param fullNumber The full winning number from the lottery
     */
    function submitResult(string calldata drawId, uint256 fullNumber) external onlyRole(UPDATER_ROLE) {
        require(bytes(drawId).length > 0, "Invalid draw ID");
        require(!results[drawId].exists, "Result already submitted");

        uint8 lastTwo = uint8(fullNumber % 100);

        LotteryResult memory result = LotteryResult({
            lastTwoDigits: lastTwo,
            fullNumber: fullNumber,
            timestamp: block.timestamp,
            drawId: drawId,
            exists: true
        });

        results[drawId] = result;
        latestResult = result;

        emit ResultSubmitted(drawId, lastTwo, fullNumber, block.timestamp);
    }

    /**
     * @notice Submit result with explicit last two digits (for manual override)
     * @param drawId Unique identifier for the draw
     * @param lastTwoDigits The last two digits (00-99)
     * @param fullNumber The full winning number (for reference)
     */
    function submitResultExplicit(
        string calldata drawId,
        uint8 lastTwoDigits,
        uint256 fullNumber
    ) external onlyRole(UPDATER_ROLE) {
        require(bytes(drawId).length > 0, "Invalid draw ID");
        require(!results[drawId].exists, "Result already submitted");
        require(lastTwoDigits <= 99, "Invalid last two digits");

        LotteryResult memory result = LotteryResult({
            lastTwoDigits: lastTwoDigits,
            fullNumber: fullNumber,
            timestamp: block.timestamp,
            drawId: drawId,
            exists: true
        });

        results[drawId] = result;
        latestResult = result;

        emit ResultSubmitted(drawId, lastTwoDigits, fullNumber, block.timestamp);
    }

    /**
     * @notice Get the last two digits for a specific draw
     * @param drawId The draw identifier
     * @return lastTwoDigits The winning number's last two digits
     * @return exists Whether the result exists
     */
    function getResult(string calldata drawId) external view returns (uint8 lastTwoDigits, bool exists) {
        LotteryResult storage result = results[drawId];
        return (result.lastTwoDigits, result.exists);
    }

    /**
     * @notice Get the latest result
     * @return lastTwoDigits The latest winning number's last two digits
     * @return drawId The draw identifier
     * @return timestamp When the result was recorded
     */
    function getLatestResult() external view returns (
        uint8 lastTwoDigits,
        string memory drawId,
        uint256 timestamp
    ) {
        return (latestResult.lastTwoDigits, latestResult.drawId, latestResult.timestamp);
    }

    /**
     * @notice Check if a result exists for a draw
     * @param drawId The draw identifier
     */
    function hasResult(string calldata drawId) external view returns (bool) {
        return results[drawId].exists;
    }
}
