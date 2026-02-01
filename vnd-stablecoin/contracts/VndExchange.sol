// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./VndStablecoin.sol";

contract VndExchange is AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    
    // The VND Stablecoin contract
    VndStablecoin public vndInfo;

    // Rates (VND per 1 USD) - scaled by 1e18? Or just integer VND?
    // Let's assume user inputs 1 USDC (1e6), we give X VND (1e18).
    // If rate is 23,000 VND/USD, then 1 USD -> 23,000 * 1e18 VND.
    
    // We will store rate as "VND wei per 1 USD full unit".
    // Example: Sell Rate = 23000 * 1e18 (User gives 1 USD, gets 23000 VND)
    // Buy Rate (User buys USD) = 24000 * 1e18 (User gives 24000 VND, gets 1 USD)
    // Wait, let's look at the requirement: "sell and buy to be different so we can take profit"
    
    // Scenario 1: User has USDC, wants VND. (User "Buys" VND).
    // Bank sells VND at a specific price. E.g. Bank sells 1 USD = 23,500 VND.
    // User gives 1 USD -> Gets 23,500 VND.
    
    // Scenario 2: User has VND, wants USDC. (User "Sells" VND).
    // Bank buys VND back. Bank buys at 23,000 VND.
    // User gives 23,000 VND -> Gets 1 USD.
    
    // Profit: 
    // Bank gets 1 USD, gives 23,500 VND.
    // Later, Bank gets 23,500 VND back. To give back that 23,500 VND, user needs 1.02 USD worth?
    // No, standard forex:
    // Buy Price (Ask): Price bank sells currency at.
    // Sell Price (Bid): Price bank buys currency at.
    
    // Let's simplify variable names:
    // `vndPerUsdToBuyVnd`: How much VND user gets for 1 USD. (e.g. 23,000). LOWER is better for Bank.
    // `vndPerUsdToSellVnd`: How much VND user must pay to get 1 USD. (e.g. 24,000). HIGHER is better for Bank.
    
    uint256 public vndPerUsdToBuyVnd; // e.g. 23,000
    uint256 public vndPerUsdToSellVnd; // e.g. 24,000

    mapping(address => bool) public supportedTokens;
    
    event RatesUpdated(uint256 buyVndRate, uint256 sellVndRate);
    event VndBought(address indexed buyer, address token, uint256 tokenAmount, uint256 vndAmount);
    event VndSold(address indexed seller, address token, uint256 vndAmount, uint256 tokenAmount);
    event TreasuryWithdrawal(address token, uint256 amount);

    constructor(address _vndStablecoin, uint256 _buyVndRate, uint256 _sellVndRate) {
        require(_vndStablecoin != address(0), "Invalid address");
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        
        vndInfo = VndStablecoin(_vndStablecoin);
        setRates(_buyVndRate, _sellVndRate);
    }

    function setRates(uint256 _vndPerUsdToBuyVnd, uint256 _vndPerUsdToSellVnd) public onlyRole(ADMIN_ROLE) {
        require(_vndPerUsdToBuyVnd > 0 && _vndPerUsdToSellVnd > 0, "Invalid rates");
        require(_vndPerUsdToSellVnd >= _vndPerUsdToBuyVnd, "Sell rate must be >= Buy rate");

        // Usually Sell VND rate (User gives VND, gets USD) > Buy VND rate (User gives USD, gets VND)
        // Example: Trade 1 USD -> Get 23,000 VND. 
        // Trade 24,000 VND -> Get 1 USD.
        // Spread = 1000 VND.
        vndPerUsdToBuyVnd = _vndPerUsdToBuyVnd;
        vndPerUsdToSellVnd = _vndPerUsdToSellVnd;
        emit RatesUpdated(_vndPerUsdToBuyVnd, _vndPerUsdToSellVnd);
    }

    function setSupportedToken(address token, bool isSupported) external onlyRole(ADMIN_ROLE) {
        supportedTokens[token] = isSupported;
    }

    // User gives USDC, Gets VND
    function buyVnd(address token, uint256 tokenAmount) external {
        require(supportedTokens[token], "Token not supported");
        require(tokenAmount > 0, "Amount must be > 0");

        // Transfer token from User to This Contract (Treasury)
        IERC20(token).safeTransferFrom(msg.sender, address(this), tokenAmount);

        // Calculate VND amount
        // tokenAmount has decimals (e.g. 6 for USDC). We want result in 18 decimals.
        uint8 tokenDecimals = IERC20Metadata(token).decimals();
        
        // Normalize token amount to 18 decimals equivalent for calculation?
        // simple math: (tokenAmount * Rate) / (10^tokenDecimals)
        // Rate is VND per 1 Full USD.
        // Example: 1e6 USDC (1 USD). Rate = 23000. 
        // Result should be 23000 * 1e18.
        
        uint256 vndAmount = (tokenAmount * vndPerUsdToBuyVnd * 1e18) / (10 ** tokenDecimals);

        // Mint VND to User
        vndInfo.mint(msg.sender, vndAmount);
        
        emit VndBought(msg.sender, token, tokenAmount, vndAmount);
    }

    // User gives VND, Gets USDC
    function sellVnd(address token, uint256 vndAmount) external {
        require(supportedTokens[token], "Token not supported");
        require(vndAmount > 0, "Amount must be > 0");
        
        // User must approve VND transfer first? Or we use burnFrom if allowed?
        // AccessControl upgrade to VND doesn't automatically give 'allowance'.
        // But if we have BURNER_ROLE, we can burn from anyone? 
        // Standard Burn function usually checks msg.sender or allowance.
        // Our VndStablecoin.burn is: `_burn(from, amount)`. 
        // As a BURNER_ROLE, we can call `burn(address from, amount)`.
        // Let's verify VndStablecoin implementation:
        // `function burn(address from, uint256 amount) external onlyRole(BURNER_ROLE) { _burn(from, amount); }`
        
        // Security: Ensure user has explicitly approved the exchange to burn their tokens
        require(vndInfo.allowance(msg.sender, address(this)) >= vndAmount, "Insufficient allowance");
        
        // 1. Burn VND from user
        vndInfo.burn(msg.sender, vndAmount);

        // 2. Calculate Token output
        // Amount = VND / Rate.
        // Example: 24,000 * 1e18 VND. Rate = 24,000. Result = 1 USD (1e6 USDC).
        // (vndAmount * 10^tokenDecimals) / (Rate * 1e18) ?
        
        uint8 tokenDecimals = IERC20Metadata(token).decimals();
        
        // (24000 * 1e18 * 1e6) / (24000 * 1e18) = 1e6. Correct.
        // We need to divide by 1e18 because vndAmount is scaled by 1e18, but Rate is just integer.
        uint256 tokenAmount = (vndAmount * (10 ** tokenDecimals)) / (vndPerUsdToSellVnd * 1e18); 
        
        // Wait, Rate definition above: "Vnd wei per 1 USD full unit"? No, that's messy.
        // Let's stick to: Rate = Integer amount of VND per 1 USD.
        // e.g. 23000.
        // Then:
        // Buy: 1 USD -> 23000 VND. Math: (1e6 * 23000 * 1e18) / 1e6 = 23000e18. Correct.
        // Sell: 24000 VND -> 1 USD. Math: (24000e18 * 1e6) / (24000 * 1e18) ?
        // = (24000e18 * 1e6) / 24000e18 = 1e6. Correct.
        // So Rate is just an integer (e.g. 23000), not scaled by 1e18.
        
        require(tokenAmount > 0, "Calculated amount is 0");
        require(IERC20(token).balanceOf(address(this)) >= tokenAmount, "Insufficient liquidity");

        IERC20(token).safeTransfer(msg.sender, tokenAmount);

        emit VndSold(msg.sender, token, vndAmount, tokenAmount);
    }

    function withdraw(address token, uint256 amount) external onlyRole(ADMIN_ROLE) {
        IERC20(token).safeTransfer(msg.sender, amount);
        emit TreasuryWithdrawal(token, amount);
    }
}
