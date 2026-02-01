// DanhDe Configuration
// Update these addresses after deployment

const DANHDE_CONFIG = {
    // Contract Addresses (UPDATE AFTER DEPLOYMENT)
    DANHDE_ADDRESS: "0x0000000000000000000000000000000000000000",
    ORACLE_ADDRESS: "0x0000000000000000000000000000000000000000",

    // Token Addresses (UPDATE AFTER DEPLOYMENT)
    TOKENS: {
        VND: {
            address: "0x0000000000000000000000000000000000000000",
            symbol: "VND",
            decimals: 18,
            name: "VND Stablecoin"
        },
        USDC: {
            address: "0x0000000000000000000000000000000000000000",
            symbol: "USDC",
            decimals: 6,
            name: "USD Coin"
        },
        USDT: {
            address: "0x0000000000000000000000000000000000000000",
            symbol: "USDT",
            decimals: 6,
            name: "Tether USD"
        }
    },

    // Network Configuration
    NETWORK: {
        chainId: 84532, // Base Sepolia
        name: "Base Sepolia",
        rpcUrl: "https://sepolia.base.org",
        explorer: "https://sepolia.basescan.org"
    },

    // ABIs
    DANHDE_ABI: [
        // Read Functions
        "function currentRoundId() view returns (uint256)",
        "function rounds(uint256) view returns (uint256 startTime, uint256 endTime, uint256 resultTime, uint8 winningNumber, bool cancelled, uint256 totalBetsVND)",
        "function bets(uint256) view returns (address player, address token, uint256 amount, uint8 number, uint256 roundId, bool claimed)",
        "function payoutMultiplier() view returns (uint256)",
        "function minBetVND() view returns (uint256)",
        "function maxBetVND() view returns (uint256)",
        "function supportedTokens(address) view returns (bool)",
        "function tokenToVndRate(address) view returns (uint256)",
        "function getCurrentRound() view returns (uint256 roundId, uint256 startTime, uint256 endTime, uint256 resultTime, uint8 winningNumber, bool cancelled, uint256 totalBetsVND)",
        "function getPlayerBetIds(address player) view returns (uint256[])",
        "function getRoundBetIds(uint256 roundId) view returns (uint256[])",
        "function isWinningBet(uint256 betId) view returns (bool)",
        "function calculatePayout(uint256 betId) view returns (uint256)",
        "function getBalance(address token) view returns (uint256)",
        "function getVndValue(address token, uint256 amount) view returns (uint256)",

        // Write Functions
        "function placeBet(address token, uint256 amount, uint8 number)",
        "function claimWinnings(uint256 betId)",
        "function claimRefund(uint256 betId)",

        // Events
        "event RoundStarted(uint256 indexed roundId, uint256 startTime, uint256 endTime)",
        "event RoundResultSet(uint256 indexed roundId, uint8 winningNumber, uint256 resultTime)",
        "event RoundCancelled(uint256 indexed roundId)",
        "event BetPlaced(uint256 indexed betId, uint256 indexed roundId, address indexed player, address token, uint256 amount, uint8 number)",
        "event BetClaimed(uint256 indexed betId, address indexed player, uint256 payout)",
        "event BetRefunded(uint256 indexed betId, address indexed player, uint256 amount)"
    ],

    ORACLE_ABI: [
        "function getLatestResult() view returns (uint8 lastTwoDigits, string drawId, uint256 timestamp)",
        "function getResult(string drawId) view returns (uint8 lastTwoDigits, bool exists)",
        "function latestResult() view returns (uint8 lastTwoDigits, uint256 fullNumber, uint256 timestamp, string drawId, bool exists)",
        "event ResultSubmitted(string indexed drawId, uint8 lastTwoDigits, uint256 fullNumber, uint256 timestamp)"
    ],

    ERC20_ABI: [
        "function name() view returns (string)",
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)",
        "function balanceOf(address) view returns (uint256)",
        "function allowance(address owner, address spender) view returns (uint256)",
        "function approve(address spender, uint256 amount) returns (bool)",
        "function transfer(address to, uint256 amount) returns (bool)"
    ]
};

// Helper to format VND
function formatVND(amount, decimals = 18) {
    const value = ethers.utils.formatUnits(amount, decimals);
    return new Intl.NumberFormat('vi-VN').format(parseFloat(value)) + ' VND';
}

// Helper to format token amount
function formatToken(amount, decimals, symbol) {
    const value = ethers.utils.formatUnits(amount, decimals);
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(parseFloat(value)) + ' ' + symbol;
}

// Helper to format time
function formatTimeLeft(seconds) {
    if (seconds <= 0) return "00:00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Helper to format date
function formatDate(timestamp) {
    return new Date(timestamp * 1000).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}
