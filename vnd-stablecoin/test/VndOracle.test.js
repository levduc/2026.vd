import { expect } from "chai";
import hre from "hardhat";

const { ethers } = hre;

describe("VndOracle", function () {
    let VndOracle;
    let oracle;
    let owner;
    let addr1;
    const INITIAL_RATE = ethers.parseEther("25000"); // 25,000 VND = 1 USD

    beforeEach(async function () {
        [owner, addr1] = await ethers.getSigners();
        VndOracle = await ethers.getContractFactory("VndOracle");
        oracle = await VndOracle.deploy(INITIAL_RATE);
    });

    describe("Deployment", function () {
        it("Should set the initial rate correctly", async function () {
            expect(await oracle.vndPerUsd()).to.equal(INITIAL_RATE);
        });
    });

    describe("Rate Updates", function () {
        it("Should allow owner to update rate", async function () {
            const newRate = ethers.parseEther("25500");
            await oracle.updateRate(newRate);
            expect(await oracle.vndPerUsd()).to.equal(newRate);
        });

        it("Should fail if non-owner tries to update rate", async function () {
            const newRate = ethers.parseEther("25500");
            await expect(
                oracle.connect(addr1).updateRate(newRate)
            ).to.be.revertedWithCustomError(oracle, "OwnableUnauthorizedAccount");
        });
    });

    describe("Conversion", function () {
        it("Should correctly convert VND to USD", async function () {
            // 50,000 VND should be 2 USD
            const vndAmount = ethers.parseEther("50000");
            const expectedUsd = ethers.parseEther("2");
            expect(await oracle.vndToUsd(vndAmount)).to.equal(expectedUsd);
        });

        it("Should correctly convert USD to VND", async function () {
            // 2 USD should be 50,000 VND
            const usdAmount = ethers.parseEther("2");
            const expectedVnd = ethers.parseEther("50000");
            expect(await oracle.usdToVnd(usdAmount)).to.equal(expectedVnd);
        });
    });
});
