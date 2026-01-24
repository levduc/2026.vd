import hre from "hardhat";

async function main() {
    console.log("Starting Admin Tasks Verification...");

    const [owner, user1] = await hre.ethers.getSigners();
    console.log("Owner:", owner.address);
    console.log("User1:", user1.address);

    // 1. Deploy Contracts
    console.log("\nDeploying contracts...");
    const VndStablecoin = await hre.ethers.getContractFactory("VndStablecoin");
    const vnd = await VndStablecoin.deploy();
    await vnd.waitForDeployment();
    const vndAddress = await vnd.getAddress();
    console.log("VndStablecoin deployed to:", vndAddress);

    const VndOracle = await hre.ethers.getContractFactory("VndOracle");
    const initialRate = hre.ethers.parseEther("24000"); // 24,000 VND/USD
    const oracle = await VndOracle.deploy(initialRate);
    await oracle.waitForDeployment();
    const oracleAddress = await oracle.getAddress();
    console.log("VndOracle deployed to:", oracleAddress);

    // 2. Verify Mint Task
    console.log("\nTesting 'mint' task...");
    // Initial balance should be 0
    let balance = await vnd.balanceOf(user1.address);
    console.log("Initial User1 Balance:", hre.ethers.formatEther(balance));

    await hre.run("mint", {
        contract: vndAddress,
        to: user1.address,
        amount: "100"
    });

    balance = await vnd.balanceOf(user1.address);
    console.log("Post-Mint User1 Balance:", hre.ethers.formatEther(balance));
    if (balance !== hre.ethers.parseEther("100")) {
        throw new Error("Mint task failed: Balance mismatch");
    } else {
        console.log("✅ Mint task passed");
    }

    // 3. Verify Burn Task
    console.log("\nTesting 'burn' task...");
    await hre.run("burn", {
        contract: vndAddress,
        from: user1.address,
        amount: "50"
    });

    balance = await vnd.balanceOf(user1.address);
    console.log("Post-Burn User1 Balance:", hre.ethers.formatEther(balance));
    if (balance !== hre.ethers.parseEther("50")) {
        throw new Error("Burn task failed: Balance mismatch");
    } else {
        console.log("✅ Burn task passed");
    }

    // 4. Verify Blacklist Task
    console.log("\nTesting 'blacklist' task...");
    await hre.run("blacklist", {
        contract: vndAddress,
        account: user1.address
    });

    let isBlacklisted = await vnd.blacklisted(user1.address);
    console.log("Is User1 Blacklisted:", isBlacklisted);
    if (!isBlacklisted) {
        throw new Error("Blacklist task failed");
    } else {
        console.log("✅ Blacklist task passed");
    }

    // 5. Verify Unblacklist Task
    console.log("\nTesting 'unblacklist' task...");
    await hre.run("unblacklist", {
        contract: vndAddress,
        account: user1.address
    });

    isBlacklisted = await vnd.blacklisted(user1.address);
    console.log("Is User1 Blacklisted:", isBlacklisted);
    if (isBlacklisted) {
        throw new Error("Unblacklist task failed");
    } else {
        console.log("✅ Unblacklist task passed");
    }

    // 6. Verify Update Rate Task
    console.log("\nTesting 'update-rate' task...");
    const oldRate = await oracle.vndPerUsd();
    console.log("Old Rate:", hre.ethers.formatEther(oldRate));

    // Testing decimal input as requested by user
    const targetRate = "25000.5";
    await hre.run("update-rate", {
        contract: oracleAddress,
        rate: targetRate
    });

    const newRate = await oracle.vndPerUsd();
    console.log("New Rate:", hre.ethers.formatEther(newRate));

    // Check strict equality with the parsed ether value of the decimal string
    if (newRate !== hre.ethers.parseEther(targetRate)) {
        throw new Error("Update Rate task failed: Rate mismatch with decimal input");
    } else {
        console.log(`✅ Update Rate task passed with decimal input: ${targetRate}`);
    }

    console.log("\n🎉 All Admin Tasks Verified Successfully!");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
