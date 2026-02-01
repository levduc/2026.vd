import hre from "hardhat";

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    // 1. Deploy VndStablecoin (now with AccessControl)
    const VndStablecoin = await hre.ethers.getContractFactory("VndStablecoin");
    const vnd = await VndStablecoin.deploy();
    await vnd.waitForDeployment();
    const vndAddress = await vnd.getAddress();
    console.log("VndStablecoin deployed to:", vndAddress);

    // 2. Deploy MockTokens (USDC and USDT)
    const MockToken = await hre.ethers.getContractFactory("MockToken");

    const usdc = await MockToken.deploy("Mock USDC", "USDC", 6);
    await usdc.waitForDeployment();
    const usdcAddress = await usdc.getAddress();
    console.log("Mock USDC deployed to:", usdcAddress);

    const usdt = await MockToken.deploy("Mock USDT", "USDT", 18); // USDT often has 18 on BSC, but 6 on Eth. Let's stick to 18 for variance.
    await usdt.waitForDeployment();
    const usdtAddress = await usdt.getAddress();
    console.log("Mock USDT deployed to:", usdtAddress);

    // 3. Deploy VndExchange
    // Initial Rates: Buy at 23,000, Sell at 24,000
    const buyRate = 23000;
    const sellRate = 24000;

    const VndExchange = await hre.ethers.getContractFactory("VndExchange");
    const exchange = await VndExchange.deploy(vndAddress, buyRate, sellRate);
    await exchange.waitForDeployment();
    const exchangeAddress = await exchange.getAddress();
    console.log("VndExchange deployed to:", exchangeAddress);

    // 4. Setup Permissions
    console.log("Setting up permissions...");

    // Grant MINTER_ROLE and BURNER_ROLE to Exchange
    const MINTER_ROLE = await vnd.MINTER_ROLE();
    const BURNER_ROLE = await vnd.BURNER_ROLE();

    await vnd.grantRole(MINTER_ROLE, exchangeAddress);
    await vnd.grantRole(BURNER_ROLE, exchangeAddress);
    console.log("Granted MINTER & BURNER roles to Exchange");

    // 5. Whitelist Tokens in Exchange
    await exchange.setSupportedToken(usdcAddress, true);
    await exchange.setSupportedToken(usdtAddress, true);
    console.log("Whitelisted USDC and USDT in Exchange");

    console.log("Deployment and Setup Complete!");

    return { vnd, exchange, usdc, usdt };
}

// Check if running directly
// In ESM, checked via import.meta.url comparison, but Hardhat scripts usually run via `hardhat run`.
// If run via node directly it's different.
// We'll export main as default.

if (import.meta.url === `file://${process.argv[1]}`) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

export { main };
