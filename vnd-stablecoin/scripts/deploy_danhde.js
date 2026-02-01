import hre from "hardhat";

const { ethers } = hre;

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying DanhDe with account:", deployer.address);

    // Get existing contract addresses (update these after deployment)
    // For testnet, we'll deploy mock tokens
    const isTestnet = true;

    let vndAddress, usdcAddress, usdtAddress;

    if (isTestnet) {
        // Deploy mock tokens for testing
        console.log("\n--- Deploying Mock Tokens ---");

        const MockToken = await ethers.getContractFactory("MockToken");

        // Deploy Mock USDC (6 decimals)
        const mockUSDC = await MockToken.deploy("Mock USDC", "USDC", 6);
        await mockUSDC.waitForDeployment();
        usdcAddress = await mockUSDC.getAddress();
        console.log("Mock USDC deployed to:", usdcAddress);

        // Deploy Mock USDT (6 decimals)
        const mockUSDT = await MockToken.deploy("Mock USDT", "USDT", 6);
        await mockUSDT.waitForDeployment();
        usdtAddress = await mockUSDT.getAddress();
        console.log("Mock USDT deployed to:", usdtAddress);

        // Deploy VND Stablecoin
        const VndStablecoin = await ethers.getContractFactory("VndStablecoin");
        const vnd = await VndStablecoin.deploy();
        await vnd.waitForDeployment();
        vndAddress = await vnd.getAddress();
        console.log("VND Stablecoin deployed to:", vndAddress);
    } else {
        // Use existing deployed addresses (update these)
        vndAddress = process.env.VND_ADDRESS;
        usdcAddress = process.env.USDC_ADDRESS;
        usdtAddress = process.env.USDT_ADDRESS;
    }

    // Deploy Oracle
    console.log("\n--- Deploying DanhDeOracle ---");
    const DanhDeOracle = await ethers.getContractFactory("DanhDeOracle");
    const oracle = await DanhDeOracle.deploy();
    await oracle.waitForDeployment();
    const oracleAddress = await oracle.getAddress();
    console.log("DanhDeOracle deployed to:", oracleAddress);

    // Deploy DanhDe
    console.log("\n--- Deploying DanhDe ---");

    const treasury = deployer.address; // Use deployer as treasury for now
    const DanhDe = await ethers.getContractFactory("DanhDe");
    const danhDe = await DanhDe.deploy(treasury);
    await danhDe.waitForDeployment();
    const danhDeAddress = await danhDe.getAddress();
    console.log("DanhDe deployed to:", danhDeAddress);

    // Set oracle
    console.log("\n--- Setting Oracle ---");
    await danhDe.setOracle(oracleAddress);
    console.log("Oracle set on DanhDe");

    // Configure supported tokens
    console.log("\n--- Configuring Tokens ---");

    // VND: 1 VND = 1 VND (rate = 1)
    await danhDe.configureToken(vndAddress, true, 1);
    console.log("VND configured (rate: 1)");

    // USDC: 1 USDC = 25,000 VND (rate = 25000)
    const usdcRate = 25000;
    await danhDe.configureToken(usdcAddress, true, usdcRate);
    console.log(`USDC configured (rate: ${usdcRate} VND/USD)`);

    // USDT: 1 USDT = 25,000 VND (rate = 25000)
    const usdtRate = 25000;
    await danhDe.configureToken(usdtAddress, true, usdtRate);
    console.log(`USDT configured (rate: ${usdtRate} VND/USD)`);

    // Seed liquidity for payouts (testnet only)
    if (isTestnet) {
        console.log("\n--- Seeding Liquidity ---");

        const vnd = await ethers.getContractAt("VndStablecoin", vndAddress);
        const usdc = await ethers.getContractAt("MockToken", usdcAddress);
        const usdt = await ethers.getContractAt("MockToken", usdtAddress);

        // Mint VND to DanhDe contract for payouts (100M VND)
        const vndLiquidity = ethers.parseEther("100000000"); // 100M VND
        await vnd.mint(danhDeAddress, vndLiquidity);
        console.log("Deposited 100M VND to DanhDe");

        // Mint USDC to DanhDe contract (10,000 USDC)
        const usdcLiquidity = 10000n * 10n ** 6n; // 10k USDC (6 decimals)
        await usdc.mint(danhDeAddress, usdcLiquidity);
        console.log("Deposited 10,000 USDC to DanhDe");

        // Mint USDT to DanhDe contract (10,000 USDT)
        const usdtLiquidity = 10000n * 10n ** 6n; // 10k USDT (6 decimals)
        await usdt.mint(danhDeAddress, usdtLiquidity);
        console.log("Deposited 10,000 USDT to DanhDe");

        // Mint some tokens to deployer for testing bets
        console.log("\n--- Minting Test Tokens to Deployer ---");
        await vnd.mint(deployer.address, ethers.parseEther("10000000")); // 10M VND
        await usdc.mint(deployer.address, 10000n * 10n ** 6n); // 10k USDC
        await usdt.mint(deployer.address, 10000n * 10n ** 6n); // 10k USDT
        console.log("Minted test tokens to deployer");
    }

    // Print summary
    console.log("\n========================================");
    console.log("DEPLOYMENT SUMMARY");
    console.log("========================================");
    console.log("DanhDe:        ", danhDeAddress);
    console.log("Oracle:        ", oracleAddress);
    console.log("VND Token:     ", vndAddress);
    console.log("USDC Token:    ", usdcAddress);
    console.log("USDT Token:    ", usdtAddress);
    console.log("Treasury:      ", treasury);
    console.log("========================================");

    // Print frontend config
    console.log("\n--- Frontend Config (copy to danhde-config.js) ---");
    console.log(`DANHDE_ADDRESS: "${danhDeAddress}",`);
    console.log(`ORACLE_ADDRESS: "${oracleAddress}",`);
    console.log(`TOKENS: {`);
    console.log(`    VND: { address: "${vndAddress}", symbol: "VND", decimals: 18, name: "VND Stablecoin" },`);
    console.log(`    USDC: { address: "${usdcAddress}", symbol: "USDC", decimals: 6, name: "USD Coin" },`);
    console.log(`    USDT: { address: "${usdtAddress}", symbol: "USDT", decimals: 6, name: "Tether USD" }`);
    console.log(`}`);
    console.log("========================================");

    // Print current round info
    const roundInfo = await danhDe.getCurrentRound();
    console.log("\nCurrent Round:");
    console.log("  Round ID:    ", roundInfo.roundId.toString());
    console.log("  Start Time:  ", new Date(Number(roundInfo.startTime) * 1000).toISOString());
    console.log("  End Time:    ", new Date(Number(roundInfo.endTime) * 1000).toISOString());

    // Print game config
    console.log("\nGame Configuration:");
    console.log("  Payout Multiplier:", (await danhDe.payoutMultiplier()).toString(), "x");
    console.log("  Min Bet (VND):    ", ethers.formatEther(await danhDe.minBetVND()));
    console.log("  Max Bet (VND):    ", ethers.formatEther(await danhDe.maxBetVND()));
    console.log("  Round Duration:   ", (await danhDe.roundDuration()).toString(), "seconds");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
