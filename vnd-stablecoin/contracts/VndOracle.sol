// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract VndOracle is Ownable {
    uint256 public vndPerUsd;  // VND per 1 USD, scaled by 1e18
    uint256 public lastUpdated;
    
    event RateUpdated(uint256 newRate, uint256 timestamp);

    constructor(uint256 initialRate) Ownable(msg.sender) {
        vndPerUsd = initialRate;
        lastUpdated = block.timestamp;
    }

    function updateRate(uint256 newRate) external onlyOwner {
        vndPerUsd = newRate;
        lastUpdated = block.timestamp;
        emit RateUpdated(newRate, block.timestamp);
    }

    // Convert VND amount to USD (both in 18 decimals)
    function vndToUsd(uint256 vndAmount) external view returns (uint256) {
        return (vndAmount * 1e18) / vndPerUsd;
    }

    // Convert USD amount to VND (both in 18 decimals)
    function usdToVnd(uint256 usdAmount) external view returns (uint256) {
        return (usdAmount * vndPerUsd) / 1e18;
    }
}
