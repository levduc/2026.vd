import { ethers } from "ethers";

async function main() {
    const wallet = ethers.Wallet.createRandom();
    console.log("----------------------------------------------------");
    console.log("NEW WALLET GENERATED");
    console.log("----------------------------------------------------");
    console.log(`Address:     ${wallet.address}`);
    console.log(`Private Key: ${wallet.privateKey}`);
    console.log("----------------------------------------------------");
    console.log("WARNING: SAVE THIS PRIVATE KEY SAFELY. DO NOT SHARE IT.");
    console.log("Add this to your .env file as PRIVATE_KEY=...");
    console.log("----------------------------------------------------");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
