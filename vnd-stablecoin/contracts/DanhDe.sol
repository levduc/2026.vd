// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./DanhDeOracle.sol";

/**
 * @title DanhDe - Vietnamese 2-Digit Lottery Betting Game
 * @notice Players bet on numbers 00-99. If the national lottery's last 2 digits match,
 *         winners receive their bet amount multiplied by the payout multiplier (default 80x).
 * @dev Supports multiple tokens (VND, USDC, USDT) for betting
 */
contract DanhDe is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Roles ============
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    // ============ Structs ============
    struct Bet {
        address player;
        address token;
        uint256 amount;         // Bet amount in token's native decimals
        uint8 number;           // 0-99
        uint256 roundId;
        bool claimed;
    }

    struct Round {
        uint256 startTime;
        uint256 endTime;        // Betting deadline
        uint256 resultTime;     // When result was set (0 if not set)
        uint8 winningNumber;    // 0-99 (only valid if resultTime > 0)
        bool cancelled;
        uint256 totalBetsVND;   // Normalized to 18 decimals for stats
    }

    // ============ State Variables ============

    // Round management
    uint256 public currentRoundId;
    mapping(uint256 => Round) public rounds;

    // Bet management
    uint256 public nextBetId;
    mapping(uint256 => Bet) public bets;
    mapping(uint256 => uint256[]) public roundBetIds;  // roundId => betIds[]
    mapping(address => uint256[]) public playerBetIds; // player => betIds[]

    // Game configuration
    uint256 public payoutMultiplier = 80;  // Winners get bet * 80
    uint256 public minBetVND = 10_000 * 1e18;  // 10,000 VND minimum (~$0.40)
    uint256 public maxBetVND = 10_000_000 * 1e18;  // 10M VND maximum (~$400)
    uint256 public roundDuration = 1 days;  // Default round length

    // Token management
    mapping(address => bool) public supportedTokens;
    mapping(address => uint256) public tokenToVndRate;  // Rate: 1 token full unit = X VND (scaled by 1e18)
    // Example: USDC rate = 25000 means 1 USDC = 25,000 VND

    // Treasury
    address public treasury;

    // Oracle (optional)
    DanhDeOracle public oracle;

    // ============ Events ============
    event RoundStarted(uint256 indexed roundId, uint256 startTime, uint256 endTime);
    event RoundResultSet(uint256 indexed roundId, uint8 winningNumber, uint256 resultTime);
    event RoundCancelled(uint256 indexed roundId);
    event BetPlaced(
        uint256 indexed betId,
        uint256 indexed roundId,
        address indexed player,
        address token,
        uint256 amount,
        uint8 number
    );
    event BetClaimed(uint256 indexed betId, address indexed player, uint256 payout);
    event BetRefunded(uint256 indexed betId, address indexed player, uint256 amount);
    event TokenConfigured(address indexed token, bool supported, uint256 vndRate);
    event PayoutMultiplierUpdated(uint256 oldMultiplier, uint256 newMultiplier);
    event BetLimitsUpdated(uint256 minBetVND, uint256 maxBetVND);
    event TreasuryUpdated(address oldTreasury, address newTreasury);
    event OracleUpdated(address oldOracle, address newOracle);

    // ============ Constructor ============
    constructor(address _treasury) {
        require(_treasury != address(0), "Invalid treasury");

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(OPERATOR_ROLE, msg.sender);

        treasury = _treasury;

        // Start first round
        _startNewRound();
    }

    // ============ Player Functions ============

    /**
     * @notice Place a bet on a number for the current round
     * @param token The token to bet with (must be supported)
     * @param amount The bet amount in token's native decimals
     * @param number The number to bet on (0-99)
     */
    function placeBet(address token, uint256 amount, uint8 number) external nonReentrant {
        require(supportedTokens[token], "Token not supported");
        require(number <= 99, "Number must be 0-99");
        require(amount > 0, "Amount must be > 0");

        Round storage round = rounds[currentRoundId];
        require(block.timestamp < round.endTime, "Round betting closed");
        require(!round.cancelled, "Round cancelled");

        // Validate bet amount in VND terms
        uint256 betVndValue = _tokenToVnd(token, amount);
        require(betVndValue >= minBetVND, "Bet below minimum");
        require(betVndValue <= maxBetVND, "Bet above maximum");

        // Transfer tokens from player
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // Create bet record
        uint256 betId = nextBetId++;
        bets[betId] = Bet({
            player: msg.sender,
            token: token,
            amount: amount,
            number: number,
            roundId: currentRoundId,
            claimed: false
        });

        roundBetIds[currentRoundId].push(betId);
        playerBetIds[msg.sender].push(betId);

        // Update round stats
        round.totalBetsVND += betVndValue;

        emit BetPlaced(betId, currentRoundId, msg.sender, token, amount, number);
    }

    /**
     * @notice Claim winnings for a winning bet
     * @param betId The ID of the bet to claim
     */
    function claimWinnings(uint256 betId) external nonReentrant {
        Bet storage bet = bets[betId];
        require(bet.player == msg.sender, "Not your bet");
        require(!bet.claimed, "Already claimed");

        Round storage round = rounds[bet.roundId];
        require(round.resultTime > 0, "Result not set");
        require(!round.cancelled, "Round cancelled");
        require(bet.number == round.winningNumber, "Not a winning bet");

        bet.claimed = true;

        uint256 payout = bet.amount * payoutMultiplier;

        // Transfer payout from treasury or contract balance
        IERC20(bet.token).safeTransfer(msg.sender, payout);

        emit BetClaimed(betId, msg.sender, payout);
    }

    /**
     * @notice Claim refund for a cancelled round
     * @param betId The ID of the bet to refund
     */
    function claimRefund(uint256 betId) external nonReentrant {
        Bet storage bet = bets[betId];
        require(bet.player == msg.sender, "Not your bet");
        require(!bet.claimed, "Already claimed/refunded");

        Round storage round = rounds[bet.roundId];
        require(round.cancelled, "Round not cancelled");

        bet.claimed = true;

        // Refund original bet amount
        IERC20(bet.token).safeTransfer(msg.sender, bet.amount);

        emit BetRefunded(betId, msg.sender, bet.amount);
    }

    // ============ Operator Functions ============

    /**
     * @notice Set the winning number for the current round and start a new round
     * @param winningNumber The last 2 digits of the national lottery (0-99)
     */
    function setResult(uint8 winningNumber) external onlyRole(OPERATOR_ROLE) {
        require(winningNumber <= 99, "Invalid winning number");

        Round storage round = rounds[currentRoundId];
        require(block.timestamp >= round.endTime, "Round not ended");
        require(round.resultTime == 0, "Result already set");
        require(!round.cancelled, "Round cancelled");

        round.winningNumber = winningNumber;
        round.resultTime = block.timestamp;

        emit RoundResultSet(currentRoundId, winningNumber, block.timestamp);

        // Start new round
        _startNewRound();
    }

    /**
     * @notice Set result from oracle
     * @param drawId The draw ID to fetch from oracle
     */
    function setResultFromOracle(string calldata drawId) external onlyRole(OPERATOR_ROLE) {
        require(address(oracle) != address(0), "Oracle not set");

        Round storage round = rounds[currentRoundId];
        require(block.timestamp >= round.endTime, "Round not ended");
        require(round.resultTime == 0, "Result already set");
        require(!round.cancelled, "Round cancelled");

        (uint8 winningNumber, bool exists) = oracle.getResult(drawId);
        require(exists, "Oracle result not found");

        round.winningNumber = winningNumber;
        round.resultTime = block.timestamp;

        emit RoundResultSet(currentRoundId, winningNumber, block.timestamp);

        // Start new round
        _startNewRound();
    }

    /**
     * @notice Cancel the current round (allows refunds)
     */
    function cancelRound() external onlyRole(OPERATOR_ROLE) {
        Round storage round = rounds[currentRoundId];
        require(round.resultTime == 0, "Result already set");
        require(!round.cancelled, "Already cancelled");

        round.cancelled = true;

        emit RoundCancelled(currentRoundId);

        // Start new round
        _startNewRound();
    }

    /**
     * @notice Start a new round manually (if needed)
     */
    function startNewRound() external onlyRole(OPERATOR_ROLE) {
        Round storage current = rounds[currentRoundId];
        require(current.resultTime > 0 || current.cancelled, "Current round not finished");

        _startNewRound();
    }

    // ============ Admin Functions ============

    /**
     * @notice Configure a supported betting token
     * @param token The token address
     * @param supported Whether the token is supported
     * @param vndRate The VND rate (1 token = X VND, e.g., 25000 for USDC at 25k VND/USD)
     */
    function configureToken(
        address token,
        bool supported,
        uint256 vndRate
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(token != address(0), "Invalid token");
        if (supported) {
            require(vndRate > 0, "Invalid rate");
        }

        supportedTokens[token] = supported;
        tokenToVndRate[token] = vndRate;

        emit TokenConfigured(token, supported, vndRate);
    }

    /**
     * @notice Update the payout multiplier
     * @param newMultiplier New multiplier (e.g., 80 for 80x)
     */
    function setPayoutMultiplier(uint256 newMultiplier) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newMultiplier > 0 && newMultiplier <= 99, "Invalid multiplier");

        uint256 oldMultiplier = payoutMultiplier;
        payoutMultiplier = newMultiplier;

        emit PayoutMultiplierUpdated(oldMultiplier, newMultiplier);
    }

    /**
     * @notice Update bet limits
     * @param _minBetVND Minimum bet in VND (18 decimals)
     * @param _maxBetVND Maximum bet in VND (18 decimals)
     */
    function setBetLimits(uint256 _minBetVND, uint256 _maxBetVND) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_minBetVND > 0, "Min must be > 0");
        require(_maxBetVND >= _minBetVND, "Max must be >= min");

        minBetVND = _minBetVND;
        maxBetVND = _maxBetVND;

        emit BetLimitsUpdated(_minBetVND, _maxBetVND);
    }

    /**
     * @notice Update round duration
     * @param _duration Duration in seconds
     */
    function setRoundDuration(uint256 _duration) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_duration >= 1 hours, "Duration too short");
        roundDuration = _duration;
    }

    /**
     * @notice Update treasury address
     * @param _treasury New treasury address
     */
    function setTreasury(address _treasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_treasury != address(0), "Invalid treasury");

        address oldTreasury = treasury;
        treasury = _treasury;

        emit TreasuryUpdated(oldTreasury, _treasury);
    }

    /**
     * @notice Set oracle address
     * @param _oracle Oracle contract address
     */
    function setOracle(address _oracle) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address oldOracle = address(oracle);
        oracle = DanhDeOracle(_oracle);

        emit OracleUpdated(oldOracle, _oracle);
    }

    /**
     * @notice Deposit tokens to contract for payouts
     * @param token Token to deposit
     * @param amount Amount to deposit
     */
    function depositLiquidity(address token, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
    }

    /**
     * @notice Withdraw tokens from contract
     * @param token Token to withdraw
     * @param amount Amount to withdraw
     */
    function withdrawLiquidity(address token, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        IERC20(token).safeTransfer(treasury, amount);
    }

    /**
     * @notice Emergency withdraw all of a token
     * @param token Token to withdraw
     */
    function emergencyWithdraw(address token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance > 0) {
            IERC20(token).safeTransfer(treasury, balance);
        }
    }

    // ============ View Functions ============

    /**
     * @notice Get current round info
     */
    function getCurrentRound() external view returns (
        uint256 roundId,
        uint256 startTime,
        uint256 endTime,
        uint256 resultTime,
        uint8 winningNumber,
        bool cancelled,
        uint256 totalBetsVND
    ) {
        Round storage round = rounds[currentRoundId];
        return (
            currentRoundId,
            round.startTime,
            round.endTime,
            round.resultTime,
            round.winningNumber,
            round.cancelled,
            round.totalBetsVND
        );
    }

    /**
     * @notice Get all bet IDs for a round
     * @param roundId The round ID
     */
    function getRoundBetIds(uint256 roundId) external view returns (uint256[] memory) {
        return roundBetIds[roundId];
    }

    /**
     * @notice Get all bet IDs for a player
     * @param player The player address
     */
    function getPlayerBetIds(address player) external view returns (uint256[] memory) {
        return playerBetIds[player];
    }

    /**
     * @notice Check if a bet is a winner
     * @param betId The bet ID
     */
    function isWinningBet(uint256 betId) external view returns (bool) {
        Bet storage bet = bets[betId];
        Round storage round = rounds[bet.roundId];

        if (round.resultTime == 0 || round.cancelled) {
            return false;
        }

        return bet.number == round.winningNumber;
    }

    /**
     * @notice Calculate potential payout for a bet
     * @param betId The bet ID
     */
    function calculatePayout(uint256 betId) external view returns (uint256) {
        Bet storage bet = bets[betId];
        return bet.amount * payoutMultiplier;
    }

    /**
     * @notice Get contract balance for a token
     * @param token The token address
     */
    function getBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    /**
     * @notice Convert token amount to VND equivalent
     * @param token The token address
     * @param amount The token amount (in token's decimals)
     */
    function getVndValue(address token, uint256 amount) external view returns (uint256) {
        return _tokenToVnd(token, amount);
    }

    // ============ Internal Functions ============

    function _startNewRound() internal {
        currentRoundId++;

        rounds[currentRoundId] = Round({
            startTime: block.timestamp,
            endTime: block.timestamp + roundDuration,
            resultTime: 0,
            winningNumber: 0,
            cancelled: false,
            totalBetsVND: 0
        });

        emit RoundStarted(currentRoundId, block.timestamp, block.timestamp + roundDuration);
    }

    /**
     * @dev Convert token amount to VND (18 decimals)
     * @param token The token address
     * @param amount The token amount in native decimals
     * @return VND amount in 18 decimals
     */
    function _tokenToVnd(address token, uint256 amount) internal view returns (uint256) {
        uint256 rate = tokenToVndRate[token];
        uint8 tokenDecimals = IERC20Metadata(token).decimals();

        // For VND token (18 decimals, rate = 1): just return amount
        // For USDC (6 decimals, rate = 25000): 1e6 * 25000 * 1e18 / 1e6 = 25000e18 VND

        if (tokenDecimals == 18 && rate == 1) {
            return amount;  // VND token
        }

        return (amount * rate * 1e18) / (10 ** tokenDecimals);
    }
}
