import { expect } from "chai";
import hre from "hardhat";

const { ethers } = hre;

describe("DanhDe", function () {
    let danhDe;
    let vnd;
    let usdc;
    let usdt;
    let owner;
    let player1;
    let player2;
    let treasury;

    const VND_RATE = 1; // 1:1 for VND
    const USD_RATE = 25000; // 1 USD = 25,000 VND

    beforeEach(async function () {
        [owner, player1, player2, treasury] = await ethers.getSigners();

        // Deploy VND Stablecoin
        const VndStablecoin = await ethers.getContractFactory("VndStablecoin");
        vnd = await VndStablecoin.deploy();
        await vnd.waitForDeployment();

        // Deploy Mock USDC (6 decimals)
        const MockToken = await ethers.getContractFactory("MockToken");
        usdc = await MockToken.deploy("Mock USDC", "USDC", 6);
        await usdc.waitForDeployment();

        // Deploy Mock USDT (6 decimals)
        usdt = await MockToken.deploy("Mock USDT", "USDT", 6);
        await usdt.waitForDeployment();

        // Deploy DanhDe
        const DanhDe = await ethers.getContractFactory("DanhDe");
        danhDe = await DanhDe.deploy(treasury.address);
        await danhDe.waitForDeployment();

        // Configure tokens
        await danhDe.configureToken(await vnd.getAddress(), true, VND_RATE);
        await danhDe.configureToken(await usdc.getAddress(), true, USD_RATE);
        await danhDe.configureToken(await usdt.getAddress(), true, USD_RATE);

        // Mint tokens for testing
        // Give players VND
        await vnd.mint(player1.address, ethers.parseEther("10000000")); // 10M VND
        await vnd.mint(player2.address, ethers.parseEther("10000000")); // 10M VND

        // Give players USDC
        await usdc.mint(player1.address, 10000n * 10n ** 6n); // 10k USDC
        await usdc.mint(player2.address, 10000n * 10n ** 6n); // 10k USDC

        // Seed DanhDe with liquidity for payouts
        await vnd.mint(await danhDe.getAddress(), ethers.parseEther("100000000")); // 100M VND
        await usdc.mint(await danhDe.getAddress(), 100000n * 10n ** 6n); // 100k USDC
    });

    describe("Deployment", function () {
        it("Should set the correct treasury", async function () {
            expect(await danhDe.treasury()).to.equal(treasury.address);
        });

        it("Should start with round 1", async function () {
            expect(await danhDe.currentRoundId()).to.equal(1);
        });

        it("Should have default 80x multiplier", async function () {
            expect(await danhDe.payoutMultiplier()).to.equal(80);
        });

        it("Should grant admin and operator roles to deployer", async function () {
            const DEFAULT_ADMIN_ROLE = await danhDe.DEFAULT_ADMIN_ROLE();
            const OPERATOR_ROLE = await danhDe.OPERATOR_ROLE();

            expect(await danhDe.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
            expect(await danhDe.hasRole(OPERATOR_ROLE, owner.address)).to.be.true;
        });
    });

    describe("Token Configuration", function () {
        it("Should configure supported tokens", async function () {
            expect(await danhDe.supportedTokens(await vnd.getAddress())).to.be.true;
            expect(await danhDe.supportedTokens(await usdc.getAddress())).to.be.true;
        });

        it("Should set correct VND rates", async function () {
            expect(await danhDe.tokenToVndRate(await vnd.getAddress())).to.equal(VND_RATE);
            expect(await danhDe.tokenToVndRate(await usdc.getAddress())).to.equal(USD_RATE);
        });

        it("Should reject unsupported tokens for betting", async function () {
            const unsupportedToken = await usdt.getAddress();
            await danhDe.configureToken(unsupportedToken, false, 0);

            await usdt.connect(player1).approve(await danhDe.getAddress(), 100n * 10n ** 6n);
            await expect(
                danhDe.connect(player1).placeBet(unsupportedToken, 100n * 10n ** 6n, 42)
            ).to.be.revertedWith("Token not supported");
        });
    });

    describe("Placing Bets", function () {
        it("Should allow placing a bet with VND", async function () {
            const betAmount = ethers.parseEther("100000"); // 100k VND
            const betNumber = 42;

            await vnd.connect(player1).approve(await danhDe.getAddress(), betAmount);
            await expect(danhDe.connect(player1).placeBet(await vnd.getAddress(), betAmount, betNumber))
                .to.emit(danhDe, "BetPlaced")
                .withArgs(0, 1, player1.address, await vnd.getAddress(), betAmount, betNumber);
        });

        it("Should allow placing a bet with USDC", async function () {
            const betAmount = 10n * 10n ** 6n; // 10 USDC = 250,000 VND
            const betNumber = 7;

            await usdc.connect(player1).approve(await danhDe.getAddress(), betAmount);
            await expect(danhDe.connect(player1).placeBet(await usdc.getAddress(), betAmount, betNumber))
                .to.emit(danhDe, "BetPlaced");
        });

        it("Should reject bet below minimum", async function () {
            const betAmount = ethers.parseEther("1000"); // 1k VND (below 10k min)

            await vnd.connect(player1).approve(await danhDe.getAddress(), betAmount);
            await expect(
                danhDe.connect(player1).placeBet(await vnd.getAddress(), betAmount, 42)
            ).to.be.revertedWith("Bet below minimum");
        });

        it("Should reject bet above maximum", async function () {
            const betAmount = ethers.parseEther("20000000"); // 20M VND (above 10M max)

            await vnd.mint(player1.address, betAmount);
            await vnd.connect(player1).approve(await danhDe.getAddress(), betAmount);
            await expect(
                danhDe.connect(player1).placeBet(await vnd.getAddress(), betAmount, 42)
            ).to.be.revertedWith("Bet above maximum");
        });

        it("Should reject invalid number (>99)", async function () {
            const betAmount = ethers.parseEther("100000");

            await vnd.connect(player1).approve(await danhDe.getAddress(), betAmount);
            await expect(
                danhDe.connect(player1).placeBet(await vnd.getAddress(), betAmount, 100)
            ).to.be.revertedWith("Number must be 0-99");
        });

        it("Should track player bets", async function () {
            const betAmount = ethers.parseEther("100000");

            await vnd.connect(player1).approve(await danhDe.getAddress(), betAmount * 2n);
            await danhDe.connect(player1).placeBet(await vnd.getAddress(), betAmount, 42);
            await danhDe.connect(player1).placeBet(await vnd.getAddress(), betAmount, 7);

            const playerBets = await danhDe.getPlayerBetIds(player1.address);
            expect(playerBets.length).to.equal(2);
        });
    });

    describe("Setting Results", function () {
        beforeEach(async function () {
            // Place some bets
            const betAmount = ethers.parseEther("100000");
            await vnd.connect(player1).approve(await danhDe.getAddress(), betAmount);
            await danhDe.connect(player1).placeBet(await vnd.getAddress(), betAmount, 42);

            // Fast forward past round end
            await ethers.provider.send("evm_increaseTime", [86400]); // 1 day
            await ethers.provider.send("evm_mine");
        });

        it("Should allow operator to set result", async function () {
            await expect(danhDe.setResult(42))
                .to.emit(danhDe, "RoundResultSet")
                .withArgs(1, 42, await ethers.provider.getBlock("latest").then(b => b.timestamp + 1));
        });

        it("Should start new round after setting result", async function () {
            await danhDe.setResult(42);
            expect(await danhDe.currentRoundId()).to.equal(2);
        });

        it("Should reject invalid winning number", async function () {
            await expect(danhDe.setResult(100))
                .to.be.revertedWith("Invalid winning number");
        });

        it("Should reject setting result before round ends", async function () {
            // Deploy fresh contract and try to set result immediately
            const DanhDe = await ethers.getContractFactory("DanhDe");
            const newDanhDe = await DanhDe.deploy(treasury.address);
            await newDanhDe.waitForDeployment();

            await expect(newDanhDe.setResult(42))
                .to.be.revertedWith("Round not ended");
        });

        it("Should reject non-operator from setting result", async function () {
            await expect(danhDe.connect(player1).setResult(42))
                .to.be.reverted;
        });
    });

    describe("Claiming Winnings", function () {
        const betAmount = ethers.parseEther("100000"); // 100k VND

        beforeEach(async function () {
            // Player 1 bets on 42, Player 2 bets on 7
            await vnd.connect(player1).approve(await danhDe.getAddress(), betAmount);
            await danhDe.connect(player1).placeBet(await vnd.getAddress(), betAmount, 42);

            await vnd.connect(player2).approve(await danhDe.getAddress(), betAmount);
            await danhDe.connect(player2).placeBet(await vnd.getAddress(), betAmount, 7);

            // Fast forward and set result to 42
            await ethers.provider.send("evm_increaseTime", [86400]);
            await ethers.provider.send("evm_mine");
            await danhDe.setResult(42);
        });

        it("Should allow winner to claim 80x payout", async function () {
            const expectedPayout = betAmount * 80n;
            const balanceBefore = await vnd.balanceOf(player1.address);

            await expect(danhDe.connect(player1).claimWinnings(0))
                .to.emit(danhDe, "BetClaimed")
                .withArgs(0, player1.address, expectedPayout);

            const balanceAfter = await vnd.balanceOf(player1.address);
            expect(balanceAfter - balanceBefore).to.equal(expectedPayout);
        });

        it("Should reject claim for losing bet", async function () {
            await expect(danhDe.connect(player2).claimWinnings(1))
                .to.be.revertedWith("Not a winning bet");
        });

        it("Should reject double claim", async function () {
            await danhDe.connect(player1).claimWinnings(0);
            await expect(danhDe.connect(player1).claimWinnings(0))
                .to.be.revertedWith("Already claimed");
        });

        it("Should reject claim from non-owner of bet", async function () {
            await expect(danhDe.connect(player2).claimWinnings(0))
                .to.be.revertedWith("Not your bet");
        });

        it("Should correctly identify winning bet", async function () {
            expect(await danhDe.isWinningBet(0)).to.be.true;  // Player 1 bet 42
            expect(await danhDe.isWinningBet(1)).to.be.false; // Player 2 bet 7
        });
    });

    describe("Cancelled Rounds", function () {
        const betAmount = ethers.parseEther("100000");

        beforeEach(async function () {
            await vnd.connect(player1).approve(await danhDe.getAddress(), betAmount);
            await danhDe.connect(player1).placeBet(await vnd.getAddress(), betAmount, 42);
        });

        it("Should allow operator to cancel round", async function () {
            await expect(danhDe.cancelRound())
                .to.emit(danhDe, "RoundCancelled")
                .withArgs(1);
        });

        it("Should allow refund on cancelled round", async function () {
            await danhDe.cancelRound();

            const balanceBefore = await vnd.balanceOf(player1.address);
            await expect(danhDe.connect(player1).claimRefund(0))
                .to.emit(danhDe, "BetRefunded")
                .withArgs(0, player1.address, betAmount);

            const balanceAfter = await vnd.balanceOf(player1.address);
            expect(balanceAfter - balanceBefore).to.equal(betAmount);
        });

        it("Should reject refund on active round", async function () {
            await expect(danhDe.connect(player1).claimRefund(0))
                .to.be.revertedWith("Round not cancelled");
        });
    });

    describe("Admin Functions", function () {
        it("Should update payout multiplier", async function () {
            await expect(danhDe.setPayoutMultiplier(70))
                .to.emit(danhDe, "PayoutMultiplierUpdated")
                .withArgs(80, 70);

            expect(await danhDe.payoutMultiplier()).to.equal(70);
        });

        it("Should reject multiplier > 99", async function () {
            await expect(danhDe.setPayoutMultiplier(100))
                .to.be.revertedWith("Invalid multiplier");
        });

        it("Should update bet limits", async function () {
            const newMin = ethers.parseEther("50000");
            const newMax = ethers.parseEther("5000000");

            await danhDe.setBetLimits(newMin, newMax);

            expect(await danhDe.minBetVND()).to.equal(newMin);
            expect(await danhDe.maxBetVND()).to.equal(newMax);
        });

        it("Should allow emergency withdrawal", async function () {
            const contractBalance = await vnd.balanceOf(await danhDe.getAddress());

            await danhDe.emergencyWithdraw(await vnd.getAddress());

            expect(await vnd.balanceOf(treasury.address)).to.equal(contractBalance);
            expect(await vnd.balanceOf(await danhDe.getAddress())).to.equal(0);
        });
    });

    describe("VND Value Calculation", function () {
        it("Should correctly convert VND to VND (1:1)", async function () {
            const amount = ethers.parseEther("100000");
            const vndValue = await danhDe.getVndValue(await vnd.getAddress(), amount);
            expect(vndValue).to.equal(amount);
        });

        it("Should correctly convert USDC to VND", async function () {
            const usdcAmount = 10n * 10n ** 6n; // 10 USDC
            const expectedVnd = 10n * BigInt(USD_RATE) * 10n ** 18n; // 250,000 VND in wei

            const vndValue = await danhDe.getVndValue(await usdc.getAddress(), usdcAmount);
            expect(vndValue).to.equal(expectedVnd);
        });
    });

    describe("Round Management", function () {
        it("Should return correct current round info", async function () {
            const roundInfo = await danhDe.getCurrentRound();

            expect(roundInfo.roundId).to.equal(1);
            expect(roundInfo.resultTime).to.equal(0);
            expect(roundInfo.cancelled).to.be.false;
        });

        it("Should track round bet IDs", async function () {
            const betAmount = ethers.parseEther("100000");

            await vnd.connect(player1).approve(await danhDe.getAddress(), betAmount * 3n);
            await danhDe.connect(player1).placeBet(await vnd.getAddress(), betAmount, 1);
            await danhDe.connect(player1).placeBet(await vnd.getAddress(), betAmount, 2);
            await danhDe.connect(player1).placeBet(await vnd.getAddress(), betAmount, 3);

            const betIds = await danhDe.getRoundBetIds(1);
            expect(betIds.length).to.equal(3);
        });
    });
});
