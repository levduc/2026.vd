import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("VndExchange System", function () {
    let vnd, exchange, usdc, usdt;
    let owner, user1, user2;
    const BUY_RATE = 23000; // 1 USD = 23,000 VND
    const SELL_RATE = 24000; // 24,000 VND = 1 USD

    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();

        // Deploy using our script logic (reusing code implicitly or just redeploying here for speed)
        const VndStablecoin = await ethers.getContractFactory("VndStablecoin");
        vnd = await VndStablecoin.deploy();
        await vnd.waitForDeployment();

        const MockToken = await ethers.getContractFactory("MockToken");
        usdc = await MockToken.deploy("Mock USDC", "USDC", 6);
        await usdc.waitForDeployment();

        const VndExchange = await ethers.getContractFactory("VndExchange");
        exchange = await VndExchange.deploy(await vnd.getAddress(), BUY_RATE, SELL_RATE);
        await exchange.waitForDeployment();

        // Setup Roles
        const MINTER_ROLE = await vnd.MINTER_ROLE();
        const BURNER_ROLE = await vnd.BURNER_ROLE();
        await vnd.grantRole(MINTER_ROLE, await exchange.getAddress());
        await vnd.grantRole(BURNER_ROLE, await exchange.getAddress());

        // Setup Supported Tokens
        await exchange.setSupportedToken(await usdc.getAddress(), true);

        // Mint some USDC to User1
        await usdc.mint(user1.address, ethers.parseUnits("1000", 6)); // 1000 USDC
        await usdc.connect(user1).approve(await exchange.getAddress(), ethers.MaxUint256);
    });

    describe("Buying VND (User gives USDC -> Gets VND)", function () {
        it("Should mint correct amount of VND based on Buy Rate", async function () {
            // User buys with 100 USDC
            const usdcAmount = ethers.parseUnits("100", 6);

            // Expected VND = 100 * 23000 = 2,300,000 VND (18 decimals)
            const expectedVnd = ethers.parseUnits("2300000", 18);

            await expect(exchange.connect(user1).buyVnd(await usdc.getAddress(), usdcAmount))
                .to.emit(exchange, "VndBought")
                .withArgs(user1.address, await usdc.getAddress(), usdcAmount, expectedVnd);

            expect(await vnd.balanceOf(user1.address)).to.equal(expectedVnd);
            expect(await usdc.balanceOf(await exchange.getAddress())).to.equal(usdcAmount); // Treasury got funds
        });
    });

    describe("Selling VND (User gives VND -> Gets USDC)", function () {
        it("Should return correct amount of USDC based on Sell Rate", async function () {
            // First, User1 buys some VND to have a balance
            const usdcInput = ethers.parseUnits("100", 6); // 100 USDC -> 2,300,000 VND
            await exchange.connect(user1).buyVnd(await usdc.getAddress(), usdcInput);

            // Verify Start Balance
            const startVnd = await vnd.balanceOf(user1.address); // 2,300,000 VND
            expect(startVnd).to.equal(ethers.parseUnits("2300000", 18));

            // Now User sells ALL their VND (2,300,000)
            // Sell Rate is 24,000. 
            // Expected USD = 2,300,000 / 24,000 = 95.833333 USDC.
            // Math: (2300000 * 1e6) / 24000 = 95,833,333 wei USDC.

            const expectedUsdcOut = (2300000n * 1000000n) / 24000n; // 95833333

            // Approve Exchange to burn VND (REQUIRED due to safety update)
            await vnd.connect(user1).approve(await exchange.getAddress(), startVnd);

            await exchange.connect(user1).sellVnd(await usdc.getAddress(), startVnd);

            expect(await vnd.balanceOf(user1.address)).to.equal(0);

            // User had 1000 USDC initially, spent 100, got back 95.83...
            // Final should be 900 + 95.83...
            const currentUsdc = await usdc.balanceOf(user1.address);
            const initial = ethers.parseUnits("1000", 6);
            const spent = ethers.parseUnits("100", 6);
            expect(currentUsdc).to.equal(initial - spent + expectedUsdcOut);
        });

        it("Should fail sell without allowance", async function () {
            // Buy VND
            const usdcInput = ethers.parseUnits("100", 6);
            await exchange.connect(user1).buyVnd(await usdc.getAddress(), usdcInput);
            const startVnd = await vnd.balanceOf(user1.address);

            // Try sell without approve
            await expect(
                exchange.connect(user1).sellVnd(await usdc.getAddress(), startVnd)
            ).to.be.revertedWith("Insufficient allowance");
        });
    });

    describe("Admin Functions", function () {
        it("Should allow admin to update rates and validate spread", async function () {
            await exchange.setRates(23500, 24500);
            expect(await exchange.vndPerUsdToBuyVnd()).to.equal(23500);
            expect(await exchange.vndPerUsdToSellVnd()).to.equal(24500);

            // Test Inverted Rates (Sell < Buy) -> Should Fail
            await expect(
                exchange.setRates(25000, 24000)
            ).to.be.revertedWith("Sell rate must be >= Buy rate");
        });

        it("Should allow admin to withdraw profits", async function () {
            // User buys 100 USDC worth
            await exchange.connect(user1).buyVnd(await usdc.getAddress(), ethers.parseUnits("100", 6));

            // Treasury has 100 USDC
            const treasuryBal = await usdc.balanceOf(await exchange.getAddress());
            expect(treasuryBal).to.equal(ethers.parseUnits("100", 6));

            // Admin withdraws
            const initialOwnerBal = await usdc.balanceOf(owner.address);
            await exchange.withdraw(await usdc.getAddress(), treasuryBal);

            expect(await usdc.balanceOf(await exchange.getAddress())).to.equal(0);
            expect(await usdc.balanceOf(owner.address)).to.equal(initialOwnerBal + treasuryBal);
        });
    });
});
