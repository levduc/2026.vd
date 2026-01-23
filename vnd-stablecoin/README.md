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

## Project Structure

-   `contracts/`: Solidity smart contracts
    -   `VndStablecoin.sol`: The ERC-20 token contract.
    -   `VndOracle.sol`: The manual price oracle contract.
-   `scripts/`: Deployment scripts
-   `test/`: Hardhat tests

## Features (Phase 1)
-   **Stablecoin**: ERC-20 `vnd` symbol, Mint/Burn (Owner only), Pausable, Blacklist.
-   **Oracle**: Manual rate updates (Owner only).
