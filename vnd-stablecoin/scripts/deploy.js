import hre from "hardhat";

async function main() {
    const [deployer] = await hre.ethers.getSigners();

    console.log("Deploying contracts with the account:", deployer.address);

    // 1. Deploy Oracle
    const initialRate = hre.ethers.parseEther("26244.93");
    const VndOracle = await hre.ethers.getContractFactory("VndOracle");
    const oracle = await VndOracle.deploy(initialRate);
    await oracle.waitForDeployment();

    console.log(`VndOracle deployed to: ${await oracle.getAddress()}`);
    console.log(`Initial Rate: 26244.93 VND/USD`);

    // 2. Deploy Stablecoin
    const VndStablecoin = await hre.ethers.getContractFactory("VndStablecoin");
    const vnd = await VndStablecoin.deploy();
    await vnd.waitForDeployment();

    console.log(`VndStablecoin deployed to: ${await vnd.getAddress()}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
