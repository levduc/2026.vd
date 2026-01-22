# VND Stablecoin Pilot - Project Specification

## Overview

Personal pilot project to create a VND-pegged stablecoin backed by real VND reserves in a Vietnamese bank account. Goal is to prove the concept works, demonstrate demand, then pursue licensing and bank partnerships.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      USER FLOW                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  MINT:  User sends VND to your VN bank account          │
│         → You verify receipt                            │
│         → You call mint() to their wallet               │
│                                                         │
│  BURN:  User calls burn() with vndVND tokens            │
│         → You verify burn event                         │
│         → You send VND from your bank to their account  │
│                                                         │
│  SWAP:  User swaps vndVND ↔ USDC via liquidity pool     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Components to Build

### 1. VND Stablecoin Contract (ERC-20)

**Core Features:**
- Standard ERC-20 (name: "VND Stablecoin", symbol: "vndVND", decimals: 18)
- Admin-only mint/burn functions
- Pause functionality (emergency stop)
- Blacklist functionality (compliance)
- Ownership transfer capability

**Functions:**
```solidity
// Admin functions
mint(address to, uint256 amount) onlyOwner
burn(address from, uint256 amount) onlyOwner
pause() onlyOwner
unpause() onlyOwner
blacklist(address account) onlyOwner
removeBlacklist(address account) onlyOwner

// Standard ERC-20
transfer, approve, transferFrom (with pause/blacklist checks)
```

### 2. Price Oracle

**Options (in order of preference for pilot):**

A. **Manual Oracle (simplest for pilot)**
   - Contract stores VND/USD rate
   - You update periodically via admin function
   - Good enough for pilot scale

B. **Forex API Integration (later)**
   - Chainlink doesn't have VND/USD
   - Use off-chain service (e.g., exchangerate.host, Open Exchange Rates)
   - Push updates via keeper or manual

**Oracle Contract:**
```solidity
// Stores VND per USD (e.g., 25,000 * 1e18 for 25,000 VND = 1 USD)
uint256 public vndPerUsd
uint256 public lastUpdated

updateRate(uint256 newRate) onlyOwner
getVndToUsd(uint256 vndAmount) view returns (uint256 usdAmount)
getUsdToVnd(uint256 usdAmount) view returns (uint256 vndAmount)
```

### 3. Swap Pool

**Option A: Simple Constant Product (Uniswap v2 style)**
- vndVND / USDC pair
- Standard x*y=k formula
- Simple to deploy and understand

**Option B: StableSwap (Curve style)**
- Better for pegged assets
- Lower slippage for same-value swaps
- More complex math

**Recommendation for pilot:** Start with Option A (Uniswap v2 fork). Easier to deploy, debug, and explain to potential bank partners. Can upgrade later.

### 4. Simple Admin Frontend

**Pages:**
- Dashboard: Total supply, reserve balance, recent transactions
- Mint: Input wallet address + amount, execute mint
- Burn: View pending burns, confirm and process
- Oracle: Update VND/USD rate
- Pool: View pool stats, add/remove liquidity

**Tech Stack Suggestion:**
- React + ethers.js
- Simple wallet connect (MetaMask)
- No backend needed (reads from chain + your manual process)

## Technical Decisions

### Chain Selection

| Chain | Pros | Cons |
|-------|------|------|
| **Base** | Cheap, Circle connection, growing ecosystem | Newer |
| Arbitrum | Cheap, mature, good DeFi | No special advantage |
| Ethereum | Most credible, deepest liquidity | Expensive for pilot |
| Polygon | Cheap, okay ecosystem | Less institutional credibility |

**Recommendation: Base**
- Transaction fees ~$0.01-0.10
- Circle ecosystem (your employer, USDC native)
- Growing institutional adoption

### Initial Liquidity

For $50k VND reserve (~$2,000 USD at current rates):
- Mint ~50,000,000 vndVND (assuming 25,000 VND/USD)
- Pair with ~$2,000 USDC for initial pool
- You provide both sides of liquidity initially

## Development Phases

### Phase 1: Core Contracts (Week 1)
- [ ] VND stablecoin ERC-20 contract
- [ ] Manual price oracle contract
- [ ] Deploy to Base testnet
- [ ] Basic tests

### Phase 2: Swap Pool (Week 2)
- [ ] Deploy Uniswap v2 style pool OR use existing Base DEX
- [ ] Create vndVND/USDC pair
- [ ] Test swaps

### Phase 3: Admin Interface (Week 3)
- [ ] Simple React frontend
- [ ] Mint/burn admin functions
- [ ] Pool monitoring

### Phase 4: Mainnet Pilot (Week 4)
- [ ] Deploy to Base mainnet
- [ ] Seed with real liquidity ($50k VND equivalent)
- [ ] Small test transactions
- [ ] Document process

## File Structure

```
vnd-stablecoin/
├── contracts/
│   ├── VndStablecoin.sol      # Main ERC-20 token
│   ├── VndOracle.sol          # Price oracle
│   └── interfaces/
│       └── IVndOracle.sol
├── scripts/
│   ├── deploy.js              # Deployment script
│   ├── mint.js                # Mint helper
│   └── updateOracle.js        # Oracle update helper
├── test/
│   ├── VndStablecoin.test.js
│   └── VndOracle.test.js
├── frontend/
│   └── (React app)
├── hardhat.config.js
└── README.md
```

## Contract Specifications

### VndStablecoin.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract VndStablecoin is ERC20, ERC20Pausable, Ownable {
    mapping(address => bool) public blacklisted;
    
    event Blacklisted(address indexed account);
    event UnBlacklisted(address indexed account);
    event Mint(address indexed to, uint256 amount);
    event Burn(address indexed from, uint256 amount);

    constructor() ERC20("VND Stablecoin", "vndVND") Ownable(msg.sender) {}

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
        emit Mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
        emit Burn(from, amount);
    }

    function blacklist(address account) external onlyOwner {
        blacklisted[account] = true;
        emit Blacklisted(account);
    }

    function removeBlacklist(address account) external onlyOwner {
        blacklisted[account] = false;
        emit UnBlacklisted(account);
    }

    function _update(address from, address to, uint256 value) 
        internal 
        override(ERC20, ERC20Pausable) 
    {
        require(!blacklisted[from], "Sender blacklisted");
        require(!blacklisted[to], "Recipient blacklisted");
        super._update(from, to, value);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
```

### VndOracle.sol

```solidity
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
```

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Personal bank account issues | Medium | High | Keep pilot small ($50k), don't advertise publicly |
| Circle employment conflict | Medium | High | Don't work on this on company time/equipment, keep quiet |
| Smart contract bug | Low | High | Thorough testing, start with tiny amounts |
| No demand | Medium | Low | It's a pilot, learning is the goal |
| Regulatory action | Low | Medium | Small scale, personal experiment framing |

## Success Criteria for Pilot

1. **Technical:** Contracts deployed, swap pool functional
2. **Operational:** Successfully mint/burn cycle completed
3. **Demand signal:** Any external user completes a swap
4. **Learning:** Document pain points for bank conversations

## Post-Pilot Path

If pilot works:
1. Incorporate company (likely Singapore or Vietnam)
2. Approach Vietnamese banks with working demo
3. Seek seed funding ($500k-1M)
4. Apply for regulatory sandbox participation
5. Scale reserves and liquidity

## Commands to Start

```bash
# Initialize project
mkdir vnd-stablecoin && cd vnd-stablecoin
npm init -y
npm install hardhat @openzeppelin/contracts ethers dotenv

# Initialize Hardhat
npx hardhat init

# Create folder structure
mkdir -p contracts scripts test frontend
```

## Resources

- Base docs: https://docs.base.org
- OpenZeppelin contracts: https://docs.openzeppelin.com/contracts
- Hardhat docs: https://hardhat.org/docs
- VND/USD rate API: https://api.exchangerate.host/latest?base=USD&symbols=VND
