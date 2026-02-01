import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("Audit Fixes Verification", function () {
    let vnd, oracle;
    let owner, user1, user2;

    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();

        // Deploy Stablecoin
        const VndStablecoin = await ethers.getContractFactory("VndStablecoin");
        vnd = await VndStablecoin.deploy();

        // Deploy Oracle
        const VndOracle = await ethers.getContractFactory("VndOracle");
        oracle = await VndOracle.deploy(ethers.parseEther("24000"));
    });

    describe("VndStablecoin Audit Fixes", function () {
        it("Should have the correct uppercase symbol 'VND'", async function () {
            expect(await vnd.symbol()).to.equal("VND");
        });

        it("Should allow burning from a blacklisted address (Seizure Logic)", async function () {
            // 1. Mint to user1
            await vnd.mint(user1.address, ethers.parseEther("100"));
            expect(await vnd.balanceOf(user1.address)).to.equal(ethers.parseEther("100"));

            // 2. Blacklist user1
            await vnd.blacklist(user1.address);
            expect(await vnd.blacklisted(user1.address)).to.be.true;

            // 3. User1 should NOT be able to transfer
            await expect(
                vnd.connect(user1).transfer(user2.address, ethers.parseEther("50"))
            ).to.be.revertedWith("Sender blacklisted");

            // 4. Owner SHOULD be able to burn from user1 (Seizure)
            // This was the bug: previously this would revert
            await expect(
                vnd.burn(user1.address, ethers.parseEther("100"))
            ).to.not.be.reverted;

            expect(await vnd.balanceOf(user1.address)).to.equal(0);
        });
    });

    describe("VndOracle Audit Fixes", function () {
        it("Should fail if trying to set rate to 0", async function () {
            await expect(
                oracle.updateRate(0)
            ).to.be.revertedWith("Rate cannot be zero");
        });

        it("Should allow valid non-zero rate updates", async function () {
            await expect(
                oracle.updateRate(ethers.parseEther("25000"))
            ).to.not.be.reverted;

            expect(await oracle.vndPerUsd()).to.equal(ethers.parseEther("25000"));
        });
    });
});
