import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("VndExchange Comprehensive Tests", function () {
    let vnd, exchange, usdc, usdt, unsupportedToken;
    let owner, user1, user2, nonAdmin;
    const BUY_RATE = 23000;
    const SELL_RATE = 24000;

    beforeEach(async function () {
        [owner, user1, user2, nonAdmin] = await ethers.getSigners();

        // Deploy VndStablecoin
        const VndStablecoin = await ethers.getContractFactory("VndStablecoin");
        vnd = await VndStablecoin.deploy();
        await vnd.waitForDeployment();

        // Deploy Mock Tokens
        const MockToken = await ethers.getContractFactory("MockToken");
        usdc = await MockToken.deploy("Mock USDC", "USDC", 6);
        await usdc.waitForDeployment();

        usdt = await MockToken.deploy("Mock USDT", "USDT", 18); // 18 decimals variant
        await usdt.waitForDeployment();

        unsupportedToken = await MockToken.deploy("Unsupported", "UNS", 18);
        await unsupportedToken.waitForDeployment();

        // Deploy Exchange
        const VndExchange = await ethers.getContractFactory("VndExchange");
        exchange = await VndExchange.deploy(await vnd.getAddress(), BUY_RATE, SELL_RATE);
        await exchange.waitForDeployment();

        // Setup Roles
        const MINTER_ROLE = await vnd.MINTER_ROLE();
        const BURNER_ROLE = await vnd.BURNER_ROLE();
        await vnd.grantRole(MINTER_ROLE, await exchange.getAddress());
        await vnd.grantRole(BURNER_ROLE, await exchange.getAddress());

        // Setup Supported Tokens (USDC and USDT, but NOT unsupportedToken)
        await exchange.setSupportedToken(await usdc.getAddress(), true);
        await exchange.setSupportedToken(await usdt.getAddress(), true);

        // Mint tokens to users
        await usdc.mint(user1.address, ethers.parseUnits("1000", 6));
        await usdt.mint(user1.address, ethers.parseUnits("1000", 18));
        await unsupportedToken.mint(user1.address, ethers.parseUnits("1000", 18));

        // Approve exchange for USDC/USDT (for buyVnd)
        await usdc.connect(user1).approve(await exchange.getAddress(), ethers.MaxUint256);
        await usdt.connect(user1).approve(await exchange.getAddress(), ethers.MaxUint256);
        await unsupportedToken.connect(user1).approve(await exchange.getAddress(), ethers.MaxUint256);

        // Also approve VND for sellVnd (user needs to approve exchange to burn their VND)
        await vnd.connect(user1).approve(await exchange.getAddress(), ethers.MaxUint256);
    });

    describe("Constructor Validation", function () {
        it("Should revert if VndStablecoin address is zero", async function () {
            const VndExchange = await ethers.getContractFactory("VndExchange");
            await expect(
                VndExchange.deploy(ethers.ZeroAddress, BUY_RATE, SELL_RATE)
            ).to.be.revertedWith("Invalid address");
        });

        it("Should revert if buy rate is zero", async function () {
            const VndExchange = await ethers.getContractFactory("VndExchange");
            await expect(
                VndExchange.deploy(await vnd.getAddress(), 0, SELL_RATE)
            ).to.be.revertedWith("Invalid rates");
        });

        it("Should revert if sell rate is zero", async function () {
            const VndExchange = await ethers.getContractFactory("VndExchange");
            await expect(
                VndExchange.deploy(await vnd.getAddress(), BUY_RATE, 0)
            ).to.be.revertedWith("Invalid rates");
        });
    });

    describe("buyVnd Input Validation", function () {
        it("Should revert if token is not supported", async function () {
            await expect(
                exchange.connect(user1).buyVnd(await unsupportedToken.getAddress(), ethers.parseUnits("100", 18))
            ).to.be.revertedWith("Token not supported");
        });

        it("Should revert if amount is zero", async function () {
            await expect(
                exchange.connect(user1).buyVnd(await usdc.getAddress(), 0)
            ).to.be.revertedWith("Amount must be > 0");
        });
    });

    describe("sellVnd Input Validation", function () {
        it("Should revert if token is not supported", async function () {
            // First buy some VND
            await exchange.connect(user1).buyVnd(await usdc.getAddress(), ethers.parseUnits("100", 6));
            const vndBalance = await vnd.balanceOf(user1.address);

            await expect(
                exchange.connect(user1).sellVnd(await unsupportedToken.getAddress(), vndBalance)
            ).to.be.revertedWith("Token not supported");
        });

        it("Should revert if VND amount is zero", async function () {
            await expect(
                exchange.connect(user1).sellVnd(await usdc.getAddress(), 0)
            ).to.be.revertedWith("Amount must be > 0");
        });

        it("Should revert if exchange has insufficient liquidity", async function () {
            // Buy VND first
            await exchange.connect(user1).buyVnd(await usdc.getAddress(), ethers.parseUnits("100", 6));
            const vndBalance = await vnd.balanceOf(user1.address);

            // Withdraw all USDC from exchange (owner drains treasury)
            const exchangeUsdcBalance = await usdc.balanceOf(await exchange.getAddress());
            await exchange.withdraw(await usdc.getAddress(), exchangeUsdcBalance);

            // Now try to sell VND - should fail due to no liquidity
            await expect(
                exchange.connect(user1).sellVnd(await usdc.getAddress(), vndBalance)
            ).to.be.revertedWith("Insufficient liquidity");
        });

        it("Should revert if user has insufficient VND balance", async function () {
            // User1 has no VND but has approved exchange
            const largeVndAmount = ethers.parseUnits("1000000", 18);

            // Fund the exchange with USDC so liquidity is not the issue
            await usdc.mint(await exchange.getAddress(), ethers.parseUnits("10000", 6));

            // User has approved VND but doesn't have any balance
            await expect(
                exchange.connect(user1).sellVnd(await usdc.getAddress(), largeVndAmount)
            ).to.be.revertedWithCustomError(vnd, "ERC20InsufficientBalance");
        });
    });

    describe("18-Decimal Token Handling (USDT variant)", function () {
        it("Should correctly handle 18-decimal tokens when buying VND", async function () {
            // 100 USDT (18 decimals) -> 23000 * 100 = 2,300,000 VND
            const usdtAmount = ethers.parseUnits("100", 18);
            const expectedVnd = ethers.parseUnits("2300000", 18);

            await exchange.connect(user1).buyVnd(await usdt.getAddress(), usdtAmount);

            expect(await vnd.balanceOf(user1.address)).to.equal(expectedVnd);
        });

        it("Should correctly handle 18-decimal tokens when selling VND", async function () {
            // First buy VND with USDT
            const usdtAmount = ethers.parseUnits("100", 18);
            await exchange.connect(user1).buyVnd(await usdt.getAddress(), usdtAmount);

            const vndBalance = await vnd.balanceOf(user1.address); // 2,300,000 VND

            // Sell all VND back
            // 2,300,000 VND / 24,000 rate = 95.833... USDT
            const expectedUsdtOut = (2300000n * (10n ** 18n)) / 24000n;

            await exchange.connect(user1).sellVnd(await usdt.getAddress(), vndBalance);

            expect(await vnd.balanceOf(user1.address)).to.equal(0);
            // User started with 1000, spent 100, got back ~95.83
            const finalBalance = await usdt.balanceOf(user1.address);
            const expectedFinal = ethers.parseUnits("1000", 18) - usdtAmount + expectedUsdtOut;
            expect(finalBalance).to.equal(expectedFinal);
        });
    });

    describe("Access Control", function () {
        it("Should revert if non-admin tries to setRates", async function () {
            const ADMIN_ROLE = await exchange.ADMIN_ROLE();
            await expect(
                exchange.connect(nonAdmin).setRates(25000, 26000)
            ).to.be.revertedWithCustomError(exchange, "AccessControlUnauthorizedAccount")
                .withArgs(nonAdmin.address, ADMIN_ROLE);
        });

        it("Should revert if non-admin tries to setSupportedToken", async function () {
            const ADMIN_ROLE = await exchange.ADMIN_ROLE();
            await expect(
                exchange.connect(nonAdmin).setSupportedToken(await unsupportedToken.getAddress(), true)
            ).to.be.revertedWithCustomError(exchange, "AccessControlUnauthorizedAccount")
                .withArgs(nonAdmin.address, ADMIN_ROLE);
        });

        it("Should revert if non-admin tries to withdraw", async function () {
            const ADMIN_ROLE = await exchange.ADMIN_ROLE();
            await expect(
                exchange.connect(nonAdmin).withdraw(await usdc.getAddress(), 100)
            ).to.be.revertedWithCustomError(exchange, "AccessControlUnauthorizedAccount")
                .withArgs(nonAdmin.address, ADMIN_ROLE);
        });
    });

    describe("setRates Validation", function () {
        it("Should revert if buy rate is set to zero", async function () {
            await expect(
                exchange.setRates(0, SELL_RATE)
            ).to.be.revertedWith("Invalid rates");
        });

        it("Should revert if sell rate is set to zero", async function () {
            await expect(
                exchange.setRates(BUY_RATE, 0)
            ).to.be.revertedWith("Invalid rates");
        });

        it("Should emit RatesUpdated event", async function () {
            await expect(exchange.setRates(25000, 26000))
                .to.emit(exchange, "RatesUpdated")
                .withArgs(25000, 26000);
        });
    });

    describe("Event Emissions", function () {
        it("Should emit VndBought event on buyVnd", async function () {
            const usdcAmount = ethers.parseUnits("100", 6);
            const expectedVnd = ethers.parseUnits("2300000", 18);

            await expect(exchange.connect(user1).buyVnd(await usdc.getAddress(), usdcAmount))
                .to.emit(exchange, "VndBought")
                .withArgs(user1.address, await usdc.getAddress(), usdcAmount, expectedVnd);
        });

        it("Should emit VndSold event on sellVnd", async function () {
            // Buy first
            await exchange.connect(user1).buyVnd(await usdc.getAddress(), ethers.parseUnits("100", 6));
            const vndBalance = await vnd.balanceOf(user1.address);
            const expectedUsdcOut = (2300000n * 1000000n) / 24000n;

            await expect(exchange.connect(user1).sellVnd(await usdc.getAddress(), vndBalance))
                .to.emit(exchange, "VndSold")
                .withArgs(user1.address, await usdc.getAddress(), vndBalance, expectedUsdcOut);
        });

        it("Should emit TreasuryWithdrawal event on withdraw", async function () {
            // Fund treasury first
            await exchange.connect(user1).buyVnd(await usdc.getAddress(), ethers.parseUnits("100", 6));
            const amount = ethers.parseUnits("50", 6);

            await expect(exchange.withdraw(await usdc.getAddress(), amount))
                .to.emit(exchange, "TreasuryWithdrawal")
                .withArgs(await usdc.getAddress(), amount);
        });
    });

    describe("Edge Cases", function () {
        it("Should handle very small buyVnd amounts (potential rounding to zero VND)", async function () {
            // 1 wei USDC = 23000 * 1 * 1e18 / 1e6 = 23000 * 1e12 wei VND
            // This is actually a valid amount, not zero
            const tinyAmount = 1n;
            const expectedVnd = (1n * 23000n * (10n ** 18n)) / (10n ** 6n);

            await exchange.connect(user1).buyVnd(await usdc.getAddress(), tinyAmount);
            expect(await vnd.balanceOf(user1.address)).to.equal(expectedVnd);
        });

        it("Should handle sellVnd that results in zero token output", async function () {
            // Very small VND amount that rounds to 0 USDC
            // Formula: (vndAmount * 10^6) / (24000 * 10^18)
            // For result to be 0: vndAmount < 24000 * 10^12
            const tinyVnd = ethers.parseUnits("0.000001", 18); // 1e12 wei VND
            // (1e12 * 1e6) / (24000 * 1e18) = 1e18 / 24e21 = 0

            // First mint some VND to user
            await vnd.mint(user1.address, tinyVnd);

            // User must approve (already done in beforeEach, but let's be explicit)
            await vnd.connect(user1).approve(await exchange.getAddress(), tinyVnd);

            // Fund exchange
            await usdc.mint(await exchange.getAddress(), ethers.parseUnits("1000", 6));

            // This should revert because calculated amount is 0
            await expect(
                exchange.connect(user1).sellVnd(await usdc.getAddress(), tinyVnd)
            ).to.be.revertedWith("Calculated amount is 0");
        });

        it("Should allow removing a supported token", async function () {
            await exchange.setSupportedToken(await usdc.getAddress(), false);
            expect(await exchange.supportedTokens(await usdc.getAddress())).to.be.false;

            // Now buyVnd should fail
            await expect(
                exchange.connect(user1).buyVnd(await usdc.getAddress(), ethers.parseUnits("100", 6))
            ).to.be.revertedWith("Token not supported");
        });
    });
});
