require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { task } = require("hardhat/config");

task("mint", "Mints VND tokens to a specific address")
    .addParam("contract", "The address of the VndStablecoin contract")
    .addParam("to", "The address to mint tokens to")
    .addParam("amount", "The amount of tokens to mint (in ether units, e.g., '100' for 100 VND)")
    .setAction(async (taskArgs, hre) => {
        const contract = await hre.ethers.getContractAt("VndStablecoin", taskArgs.contract);
        const amount = hre.ethers.parseEther(taskArgs.amount);
        console.log(`Minting ${taskArgs.amount} VND to ${taskArgs.to}...`);
        const tx = await contract.mint(taskArgs.to, amount);
        await tx.wait();
        console.log(`Successfully minted ${taskArgs.amount} VND to ${taskArgs.to}`);
        console.log(`Transaction Hash: ${tx.hash}`);
    });

task("burn", "Burns VND tokens from a specific address")
    .addParam("contract", "The address of the VndStablecoin contract")
    .addParam("from", "The address to burn tokens from")
    .addParam("amount", "The amount of tokens to burn (in ether units)")
    .setAction(async (taskArgs, hre) => {
        const contract = await hre.ethers.getContractAt("VndStablecoin", taskArgs.contract);
        const amount = hre.ethers.parseEther(taskArgs.amount);
        console.log(`Burning ${taskArgs.amount} VND from ${taskArgs.from}...`);
        const tx = await contract.burn(taskArgs.from, amount);
        await tx.wait();
        console.log(`Successfully burned ${taskArgs.amount} VND from ${taskArgs.from}`);
        console.log(`Transaction Hash: ${tx.hash}`);
    });

task("blacklist", "Blacklists an address")
    .addParam("contract", "The address of the VndStablecoin contract")
    .addParam("account", "The address to blacklist")
    .setAction(async (taskArgs, hre) => {
        const contract = await hre.ethers.getContractAt("VndStablecoin", taskArgs.contract);
        console.log(`Blacklisting address ${taskArgs.account}...`);
        const tx = await contract.blacklist(taskArgs.account);
        await tx.wait();
        console.log(`Successfully blacklisted ${taskArgs.account}`);
        console.log(`Transaction Hash: ${tx.hash}`);
    });

task("unblacklist", "Removes an address from the blacklist")
    .addParam("contract", "The address of the VndStablecoin contract")
    .addParam("account", "The address to remove from blacklist")
    .setAction(async (taskArgs, hre) => {
        const contract = await hre.ethers.getContractAt("VndStablecoin", taskArgs.contract);
        console.log(`Removing ${taskArgs.account} from blacklist...`);
        const tx = await contract.removeBlacklist(taskArgs.account);
        await tx.wait();
        console.log(`Successfully removed ${taskArgs.account} from blacklist`);
        console.log(`Transaction Hash: ${tx.hash}`);
    });

task("update-rate", "Updates the VND/USD exchange rate")
    .addParam("contract", "The address of the VndOracle contract")
    .addParam("rate", "The new rate (VND per 1 USD, in ether units, e.g., '25000' for 25,000 VND/USD)")
    .setAction(async (taskArgs, hre) => {
        const contract = await hre.ethers.getContractAt("VndOracle", taskArgs.contract);
        const rate = hre.ethers.parseEther(taskArgs.rate);
        console.log(`Updating rate to ${taskArgs.rate} VND/USD...`);
        const tx = await contract.updateRate(rate);
        await tx.wait();
        console.log(`Successfully updated rate to ${taskArgs.rate}`);
        console.log(`Transaction Hash: ${tx.hash}`);
    });

task("transfer-ownership", "Transfers ownership to a new address")
    .addParam("contract", "The address of the contract (VndStablecoin or VndOracle)")
    .addParam("newOwner", "The address of the new owner")
    .setAction(async (taskArgs, hre) => {
        const contract = await hre.ethers.getContractAt("Ownable", taskArgs.contract);
        console.log(`Transferring ownership to ${taskArgs.newOwner}...`);
        const tx = await contract.transferOwnership(taskArgs.newOwner);
        await tx.wait();
        console.log(`Successfully transferred ownership to ${taskArgs.newOwner}`);
        console.log(`Transaction Hash: ${tx.hash}`);
    });

task("balance", "Prints the VND balance of an account")
    .addParam("contract", "The address of the VndStablecoin contract")
    .addParam("account", "The address to check balance for")
    .setAction(async (taskArgs, hre) => {
        const contract = await hre.ethers.getContractAt("VndStablecoin", taskArgs.contract);
        const balance = await contract.balanceOf(taskArgs.account);
        console.log(`Balance of ${taskArgs.account}: ${hre.ethers.formatEther(balance)} VND`);
    });

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    solidity: "0.8.20",
    networks: {
        baseSepolia: {
            url: "https://sepolia.base.org",
            accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
        },
        base: {
            url: "https://mainnet.base.org",
            accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
        },
    },
    etherscan: {
        apiKey: {
            baseSepolia: process.env.BASESCAN_API_KEY || "PLACEHOLDER",
            base: process.env.BASESCAN_API_KEY || "PLACEHOLDER",
        },
        customChains: [
            {
                network: "baseSepolia",
                chainId: 84532,
                urls: {
                    apiURL: "https://api-sepolia.basescan.org/api",
                    browserURL: "https://sepolia.basescan.org",
                },
            },
            {
                network: "base",
                chainId: 8453,
                urls: {
                    apiURL: "https://api.basescan.org/api",
                    browserURL: "https://basescan.org",
                },
            },
        ],
    },
};
