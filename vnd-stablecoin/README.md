# VND Stablecoin Pilot

This project implements a VND-pegged stablecoin (`vnd`) and a manual price oracle on the Base network.

## Prerequisites

- Node.js (v18+)
- npm

## Setup

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Environment Variables**:
    Create a `.env` file in the root directory if you plan to deploy to a public testnet (optional for local testing).
    ```env
    PRIVATE_KEY=your_private_key_here
    BASESCAN_API_KEY=your_etherscan_api_key_here
    ```

## Usage

### Compile Contracts
To compile the Solidity smart contracts:
```bash
npx hardhat compile
```

### Run Tests
To run the automated test suite (Unit tests for Stablecoin and Oracle):
```bash
npx hardhat test
```

### Local Deployment
To deploy contracts to a local Hardhat network:

1.  Start a local node:
    ```bash
    npx hardhat node
    ```

2.  In a separate terminal, run the deployment script:
    ```bash
    npx hardhat run scripts/deploy.js --network localhost
    ```
    *Note: This will output the deployed contract addresses.*

### 3. VndExchange (Swap Pool)
- Allows users to Buy VND with USDC/USDT.
- Allows users to Sell VND for USDC/USDT.
- Distinct Buy/Sell rates (spread) to capture profit.
- Admin management of rates and liquidity withdrawal.
- **Access Control**: VndStablecoin is now managed via `AccessControl` (Roles), allowing the Exchange contract to mint/burn automatically.

## Quick Start

### Installation
```bash
npm install
```

### Running Tests
Run all tests:
```bash
npx hardhat test
```

Run Exchange specific tests:
```bash
npx hardhat test test/VndExchange.test.js
```

### Deployment
To deploy the entire system (Stablecoin + Mocks + Exchange) locally:
```bash
npx hardhat run scripts/deploy_exchange.js
```
This script will:
1. Deploy `VndStablecoin` (AccessControl).
2. Deploy Mock USDC & USDT.
3. Deploy `VndExchange` with initial rates (23,000 / 24,000).
4. Grant Minter/Burner roles to the Exchange.
5. Whitelist the mock tokens.

## Project Structure

-   `contracts/`: Solidity smart contracts
    -   `VndStablecoin.sol`: The ERC-20 token contract.
    -   `VndOracle.sol`: The manual price oracle contract.
-   `scripts/`: Deployment scripts
-   `test/`: Hardhat tests

## Features (Phase 1)
-   **Stablecoin**: ERC-20 `vnd` symbol, Mint/Burn (Owner only), Pausable, Blacklist.
-   **Oracle**: Manual rate updates (Owner only).

## Admin Tasks

We provide Hardhat tasks for easy command-line interaction with the contracts.

### Minting
```bash
npx hardhat mint --contract <STABLECOIN_ADDRESS> --to <RECIPIENT> --amount <AMOUNT> --network <NETWORK>
```

### Burning
```bash
npx hardhat burn --contract <STABLECOIN_ADDRESS> --from <TARGET> --amount <AMOUNT> --network <NETWORK>
```

### Blacklist Management
```bash
npx hardhat blacklist --contract <STABLECOIN_ADDRESS> --account <TARGET> --network <NETWORK>
npx hardhat unblacklist --contract <STABLECOIN_ADDRESS> --account <TARGET> --network <NETWORK>
```

### Update Exchange Rate
```bash
npx hardhat update-rate --contract <ORACLE_ADDRESS> --rate <NEW_RATE> --network <NETWORK>
```
*Note: Rate is VND per 1 USD (e.g., 25000).*

### Transfer Ownership
```bash
npx hardhat transfer-ownership --contract <CONTRACT_ADDRESS> --new-owner <NEW_OWNER> --network <NETWORK>
```

### Check Balance
```bash
npx hardhat balance --contract <STABLECOIN_ADDRESS> --account <TARGET> --network <NETWORK>
```
