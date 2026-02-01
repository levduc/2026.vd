import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("VndOracle Comprehensive Tests", function () {
    let oracle;
    let owner, nonOwner;
    const INITIAL_RATE = ethers.parseEther("25000");

    beforeEach(async function () {
        [owner, nonOwner] = await ethers.getSigners();

        const VndOracle = await ethers.getContractFactory("VndOracle");
        oracle = await VndOracle.deploy(INITIAL_RATE);
        await oracle.waitForDeployment();
    });

    describe("Constructor", function () {
        it("Should set lastUpdated timestamp on deployment", async function () {
            const lastUpdated = await oracle.lastUpdated();
            expect(lastUpdated).to.be.gt(0);
        });

        it("Should set owner correctly", async function () {
            expect(await oracle.owner()).to.equal(owner.address);
        });

        it("Should allow deployment with zero initial rate (potential issue)", async function () {
            // Note: This is a potential vulnerability - constructor doesn't validate rate > 0
            const VndOracle = await ethers.getContractFactory("VndOracle");
            const zeroOracle = await VndOracle.deploy(0);
            await zeroOracle.waitForDeployment();

            expect(await zeroOracle.vndPerUsd()).to.equal(0);
        });
    });

    describe("Rate Updates", function () {
        it("Should update lastUpdated timestamp on rate update", async function () {
            const initialTimestamp = await oracle.lastUpdated();

            // Increase time
            await hre.network.provider.send("evm_increaseTime", [100]);
            await hre.network.provider.send("evm_mine");

            await oracle.updateRate(ethers.parseEther("26000"));
            const newTimestamp = await oracle.lastUpdated();

            expect(newTimestamp).to.be.gt(initialTimestamp);
        });

        it("Should emit RateUpdated event with correct values", async function () {
            const newRate = ethers.parseEther("26000");

            const tx = await oracle.updateRate(newRate);
            const receipt = await tx.wait();
            const block = await ethers.provider.getBlock(receipt.blockNumber);

            await expect(tx)
                .to.emit(oracle, "RateUpdated")
                .withArgs(newRate, block.timestamp);
        });

        it("Should revert if non-owner tries to update rate", async function () {
            await expect(
                oracle.connect(nonOwner).updateRate(ethers.parseEther("26000"))
            ).to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount")
                .withArgs(nonOwner.address);
        });

        it("Should revert if rate is set to zero", async function () {
            await expect(
                oracle.updateRate(0)
            ).to.be.revertedWith("Rate cannot be zero");
        });

        it("Should allow updating to same rate", async function () {
            await oracle.updateRate(INITIAL_RATE);
            expect(await oracle.vndPerUsd()).to.equal(INITIAL_RATE);
        });

        it("Should handle very large rate values", async function () {
            // Max uint256 might overflow in calculations, but setting should work
            const largeRate = ethers.parseEther("1000000"); // 1 million VND per USD
            await oracle.updateRate(largeRate);
            expect(await oracle.vndPerUsd()).to.equal(largeRate);
        });
    });

    describe("Conversion - Edge Cases", function () {
        it("Should return 0 when converting 0 VND to USD", async function () {
            expect(await oracle.vndToUsd(0)).to.equal(0);
        });

        it("Should return 0 when converting 0 USD to VND", async function () {
            expect(await oracle.usdToVnd(0)).to.equal(0);
        });

        it("Should handle conversion with 1 wei VND", async function () {
            // 1 wei VND to USD: (1 * 1e18) / 25000e18 = 0 (truncation)
            expect(await oracle.vndToUsd(1)).to.equal(0);
        });

        it("Should handle conversion with 1 wei USD", async function () {
            // 1 wei USD to VND: (1 * 25000e18) / 1e18 = 25000
            expect(await oracle.usdToVnd(1)).to.equal(25000);
        });

        it("Should maintain precision for round-trip conversion (within truncation)", async function () {
            // Start with 100 USD
            const usdAmount = ethers.parseEther("100");
            // Convert to VND: 100 * 25000 = 2,500,000 VND
            const vndAmount = await oracle.usdToVnd(usdAmount);
            expect(vndAmount).to.equal(ethers.parseEther("2500000"));

            // Convert back to USD
            const backToUsd = await oracle.vndToUsd(vndAmount);
            expect(backToUsd).to.equal(usdAmount);
        });

        it("Should handle very large amounts", async function () {
            // 1 billion USD
            const largeUsd = ethers.parseEther("1000000000");
            const expectedVnd = ethers.parseEther("25000000000000"); // 25 trillion VND

            expect(await oracle.usdToVnd(largeUsd)).to.equal(expectedVnd);
        });
    });

    describe("Ownership", function () {
        it("Should allow owner to transfer ownership", async function () {
            await oracle.transferOwnership(nonOwner.address);
            expect(await oracle.owner()).to.equal(nonOwner.address);
        });

        it("Should allow new owner to update rate after transfer", async function () {
            await oracle.transferOwnership(nonOwner.address);

            await oracle.connect(nonOwner).updateRate(ethers.parseEther("30000"));
            expect(await oracle.vndPerUsd()).to.equal(ethers.parseEther("30000"));
        });

        it("Should prevent old owner from updating rate after transfer", async function () {
            await oracle.transferOwnership(nonOwner.address);

            await expect(
                oracle.updateRate(ethers.parseEther("30000"))
            ).to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount")
                .withArgs(owner.address);
        });

        it("Should allow owner to renounce ownership", async function () {
            await oracle.renounceOwnership();
            expect(await oracle.owner()).to.equal(ethers.ZeroAddress);
        });

        it("Should prevent rate updates after ownership renounced", async function () {
            await oracle.renounceOwnership();

            await expect(
                oracle.updateRate(ethers.parseEther("30000"))
            ).to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount")
                .withArgs(owner.address);
        });
    });

    describe("Division by Zero Protection", function () {
        it("Should revert vndToUsd if rate is somehow zero (requires constructor bypass)", async function () {
            // Deploy with zero rate (constructor allows it - this is a bug)
            const VndOracle = await ethers.getContractFactory("VndOracle");
            const zeroOracle = await VndOracle.deploy(0);
            await zeroOracle.waitForDeployment();

            // This will cause division by zero
            await expect(
                zeroOracle.vndToUsd(ethers.parseEther("100"))
            ).to.be.revertedWithPanic(0x12); // Division by zero panic code
        });
    });
});
