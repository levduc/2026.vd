import { expect } from "chai";
import hre from "hardhat";

const { ethers } = hre;

describe("Vnd Hardening & Security", function () {
    let VndStablecoin, VndOracle;
    let vnd, oracle;
    let owner, addr1, addr2, mallory;
    const INITIAL_RATE = ethers.parseEther("25000"); // 25,000 VND = 1 USD

    beforeEach(async function () {
        [owner, addr1, addr2, mallory] = await ethers.getSigners();

        VndStablecoin = await ethers.getContractFactory("VndStablecoin");
        vnd = await VndStablecoin.deploy();

        VndOracle = await ethers.getContractFactory("VndOracle");
        oracle = await VndOracle.deploy(INITIAL_RATE);
    });

    // Helper to get roles
    const getRoles = async () => {
        const DEFAULT_ADMIN_ROLE = await vnd.DEFAULT_ADMIN_ROLE();
        const MINTER_ROLE = await vnd.MINTER_ROLE();
        const PAUSER_ROLE = await vnd.PAUSER_ROLE();
        return { DEFAULT_ADMIN_ROLE, MINTER_ROLE, PAUSER_ROLE };
    };

    describe("Oracle Rounding & Precision", function () {
        it("Should handle small amounts with expected truncation (VND -> USD)", async function () {
            // 1 VND is much less than 1 USD (1/25000 USD)
            // Since solidity truncates, 1 VND -> 0 USD
            const vndAmount = ethers.parseEther("0.000001"); // Very small amount effectively 1e12 wei
            // 1e12 * 1e18 / 25000e18 = 1e12 / 25000 = 0

            // Let's try 1 Wei
            const oneWei = 1n;
            // 1 * 1e18 / 25000e18 = 0
            expect(await oracle.vndToUsd(oneWei)).to.equal(0);
        });

        it("Should handle small amounts with expected truncation (USD -> VND)", async function () {
            // 1 Wei USD -> 25000 Wei VND (No truncation issues typically here if rate >= 1)
            const oneWeiUsd = 1n;
            // 1 * 25000e18 / 1e18 = 25000
            expect(await oracle.usdToVnd(oneWeiUsd)).to.equal(25000n);
        });

        it("Should handle prime number amounts consistently", async function () {
            // 17 USD -> 17 * 25000 VND
            const oddUsd = ethers.parseEther("17");
            const expectedVnd = ethers.parseEther("425000");
            expect(await oracle.usdToVnd(oddUsd)).to.equal(expectedVnd);
        });
    });

    describe("Access Control Integrity", function () {
        it("Should not allow revoked admin to mint", async function () {
            const { MINTER_ROLE, DEFAULT_ADMIN_ROLE } = await getRoles();
            // Revoke Main Admin and Minter (since owner has all initially)
            await vnd.revokeRole(MINTER_ROLE, owner.address);
            await vnd.revokeRole(DEFAULT_ADMIN_ROLE, owner.address); // prevents regranting

            await expect(
                vnd.mint(owner.address, 100)
            ).to.be.revertedWithCustomError(vnd, "AccessControlUnauthorizedAccount")
                .withArgs(owner.address, MINTER_ROLE);
        });

        it("Should not allow revoked pauser to pause", async function () {
            const { PAUSER_ROLE, DEFAULT_ADMIN_ROLE } = await getRoles();
            await vnd.revokeRole(PAUSER_ROLE, owner.address);

            await expect(
                vnd.pause()
            ).to.be.revertedWithCustomError(vnd, "AccessControlUnauthorizedAccount")
                .withArgs(owner.address, PAUSER_ROLE);
        });

        it("Should allow new minter to mint after grant", async function () {
            const { MINTER_ROLE } = await getRoles();
            await vnd.grantRole(MINTER_ROLE, addr1.address);

            await expect(
                vnd.connect(addr1).mint(addr1.address, 100)
            ).to.not.be.reverted;
        });

        it("Should prevent old minter from minting after revoke", async function () {
            const { MINTER_ROLE } = await getRoles();
            // Grant addr1
            await vnd.grantRole(MINTER_ROLE, addr1.address);
            // Revoke addr1
            await vnd.revokeRole(MINTER_ROLE, addr1.address);

            await expect(
                vnd.connect(addr1).mint(owner.address, 100)
            ).to.be.revertedWithCustomError(vnd, "AccessControlUnauthorizedAccount")
                .withArgs(addr1.address, MINTER_ROLE);
        });
    });

    describe("Edge Case Inputs", function () {
        it("Should allow minting 0 tokens", async function () {
            await expect(vnd.mint(addr1.address, 0)).to.not.be.reverted;
            expect(await vnd.balanceOf(addr1.address)).to.equal(0);
        });

        it("Should allow burning 0 tokens", async function () {
            await expect(vnd.burn(addr1.address, 0)).to.not.be.reverted;
        });

        it("Should fail minting to zero address", async function () {
            await expect(
                vnd.mint(ethers.ZeroAddress, 100)
            ).to.be.revertedWithCustomError(vnd, "ERC20InvalidReceiver");
        });

        it("Should fail burning from zero address", async function () {
            // Burn is called by owner for a user. User cannot be zero address generally in logic if passed expressly,
            // but _burn checks generic ERC20 constraints.
            await expect(
                vnd.burn(ethers.ZeroAddress, 100)
            ).to.be.revertedWithCustomError(vnd, "ERC20InvalidSender");
        });

        it("Should fail to blacklist zero address", async function () {
            // Blacklisting zero address is prevented to avoid potential issues
            await expect(
                vnd.blacklist(ethers.ZeroAddress)
            ).to.be.revertedWith("Cannot blacklist zero address");
        });
    });
});
