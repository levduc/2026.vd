import { expect } from "chai";
import hre from "hardhat";

const { ethers } = hre;

describe("DanhDeOracle", function () {
    let oracle;
    let owner;
    let updater;
    let other;

    beforeEach(async function () {
        [owner, updater, other] = await ethers.getSigners();

        const DanhDeOracle = await ethers.getContractFactory("DanhDeOracle");
        oracle = await DanhDeOracle.deploy();
        await oracle.waitForDeployment();

        // Grant updater role
        const UPDATER_ROLE = await oracle.UPDATER_ROLE();
        await oracle.grantRole(UPDATER_ROLE, updater.address);
    });

    describe("Deployment", function () {
        it("Should set the correct admin", async function () {
            const DEFAULT_ADMIN_ROLE = await oracle.DEFAULT_ADMIN_ROLE();
            expect(await oracle.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
        });

        it("Should grant updater role to deployer", async function () {
            const UPDATER_ROLE = await oracle.UPDATER_ROLE();
            expect(await oracle.hasRole(UPDATER_ROLE, owner.address)).to.be.true;
        });
    });

    describe("Submit Result", function () {
        it("Should allow updater to submit result", async function () {
            const drawId = "20240131-MB";
            const fullNumber = 12345;

            await expect(oracle.connect(updater).submitResult(drawId, fullNumber))
                .to.emit(oracle, "ResultSubmitted")
                .withArgs(drawId, 45, fullNumber, await ethers.provider.getBlock("latest").then(b => b.timestamp + 1));
        });

        it("Should correctly calculate last two digits", async function () {
            await oracle.submitResult("draw1", 99);
            let result = await oracle.getResult("draw1");
            expect(result.lastTwoDigits).to.equal(99);

            await oracle.submitResult("draw2", 100);
            result = await oracle.getResult("draw2");
            expect(result.lastTwoDigits).to.equal(0);

            await oracle.submitResult("draw3", 12345);
            result = await oracle.getResult("draw3");
            expect(result.lastTwoDigits).to.equal(45);

            await oracle.submitResult("draw4", 7);
            result = await oracle.getResult("draw4");
            expect(result.lastTwoDigits).to.equal(7);
        });

        it("Should update latest result", async function () {
            await oracle.submitResult("draw1", 123);
            let latest = await oracle.getLatestResult();
            expect(latest.lastTwoDigits).to.equal(23);
            expect(latest.drawId).to.equal("draw1");

            await oracle.submitResult("draw2", 456);
            latest = await oracle.getLatestResult();
            expect(latest.lastTwoDigits).to.equal(56);
            expect(latest.drawId).to.equal("draw2");
        });

        it("Should reject duplicate draw IDs", async function () {
            await oracle.submitResult("draw1", 123);
            await expect(oracle.submitResult("draw1", 456))
                .to.be.revertedWith("Result already submitted");
        });

        it("Should reject empty draw ID", async function () {
            await expect(oracle.submitResult("", 123))
                .to.be.revertedWith("Invalid draw ID");
        });

        it("Should reject non-updater", async function () {
            await expect(oracle.connect(other).submitResult("draw1", 123))
                .to.be.reverted;
        });
    });

    describe("Submit Result Explicit", function () {
        it("Should allow explicit last two digits", async function () {
            await oracle.submitResultExplicit("draw1", 42, 99942);

            const result = await oracle.getResult("draw1");
            expect(result.lastTwoDigits).to.equal(42);
            expect(result.exists).to.be.true;
        });

        it("Should reject invalid last two digits", async function () {
            await expect(oracle.submitResultExplicit("draw1", 100, 100))
                .to.be.revertedWith("Invalid last two digits");
        });
    });

    describe("Query Results", function () {
        beforeEach(async function () {
            await oracle.submitResult("draw1", 12345);
            await oracle.submitResult("draw2", 67890);
        });

        it("Should return correct result by draw ID", async function () {
            const result = await oracle.getResult("draw1");
            expect(result.lastTwoDigits).to.equal(45);
            expect(result.exists).to.be.true;
        });

        it("Should return false for non-existent draw ID", async function () {
            const result = await oracle.getResult("nonexistent");
            expect(result.exists).to.be.false;
        });

        it("Should check if result exists", async function () {
            expect(await oracle.hasResult("draw1")).to.be.true;
            expect(await oracle.hasResult("nonexistent")).to.be.false;
        });

        it("Should return latest result", async function () {
            const latest = await oracle.getLatestResult();
            expect(latest.lastTwoDigits).to.equal(90);
            expect(latest.drawId).to.equal("draw2");
        });
    });
});

describe("DanhDe with Oracle Integration", function () {
    let danhDe;
    let oracle;
    let vnd;
    let owner;
    let player;

    beforeEach(async function () {
        [owner, player] = await ethers.getSigners();

        // Deploy VND
        const VndStablecoin = await ethers.getContractFactory("VndStablecoin");
        vnd = await VndStablecoin.deploy();
        await vnd.waitForDeployment();

        // Deploy Oracle
        const DanhDeOracle = await ethers.getContractFactory("DanhDeOracle");
        oracle = await DanhDeOracle.deploy();
        await oracle.waitForDeployment();

        // Deploy DanhDe
        const DanhDe = await ethers.getContractFactory("DanhDe");
        danhDe = await DanhDe.deploy(owner.address);
        await danhDe.waitForDeployment();

        // Configure
        await danhDe.setOracle(await oracle.getAddress());
        await danhDe.configureToken(await vnd.getAddress(), true, 1);

        // Mint tokens
        await vnd.mint(player.address, ethers.parseEther("10000000"));
        await vnd.mint(await danhDe.getAddress(), ethers.parseEther("100000000"));
    });

    it("Should set result from oracle", async function () {
        // Place bet
        const betAmount = ethers.parseEther("100000");
        await vnd.connect(player).approve(await danhDe.getAddress(), betAmount);
        await danhDe.connect(player).placeBet(await vnd.getAddress(), betAmount, 42);

        // Fast forward
        await ethers.provider.send("evm_increaseTime", [86400]);
        await ethers.provider.send("evm_mine");

        // Submit to oracle
        await oracle.submitResult("20240131-MB", 12342); // Last two: 42

        // Set result from oracle
        await danhDe.setResultFromOracle("20240131-MB");

        // Verify
        const round = await danhDe.rounds(1);
        expect(round.winningNumber).to.equal(42);
        expect(round.resultTime).to.be.gt(0);
    });

    it("Should reject setting result from non-existent oracle result", async function () {
        await ethers.provider.send("evm_increaseTime", [86400]);
        await ethers.provider.send("evm_mine");

        await expect(danhDe.setResultFromOracle("nonexistent"))
            .to.be.revertedWith("Oracle result not found");
    });

    it("Should reject setting result without oracle configured", async function () {
        // Deploy new DanhDe without oracle
        const DanhDe = await ethers.getContractFactory("DanhDe");
        const newDanhDe = await DanhDe.deploy(owner.address);
        await newDanhDe.waitForDeployment();

        await ethers.provider.send("evm_increaseTime", [86400]);
        await ethers.provider.send("evm_mine");

        await expect(newDanhDe.setResultFromOracle("draw1"))
            .to.be.revertedWith("Oracle not set");
    });
});
