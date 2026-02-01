import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("VndStablecoin Comprehensive Tests", function () {
    let vnd;
    let owner, minter, burner, pauser, admin, user1, user2;

    beforeEach(async function () {
        [owner, minter, burner, pauser, admin, user1, user2] = await ethers.getSigners();

        const VndStablecoin = await ethers.getContractFactory("VndStablecoin");
        vnd = await VndStablecoin.deploy();
        await vnd.waitForDeployment();
    });

    const getRoles = async () => {
        return {
            DEFAULT_ADMIN_ROLE: await vnd.DEFAULT_ADMIN_ROLE(),
            MINTER_ROLE: await vnd.MINTER_ROLE(),
            BURNER_ROLE: await vnd.BURNER_ROLE(),
            PAUSER_ROLE: await vnd.PAUSER_ROLE(),
        };
    };

    describe("Access Control - Burning", function () {
        it("Should revert if non-burner tries to burn", async function () {
            const { BURNER_ROLE } = await getRoles();
            await vnd.mint(user1.address, ethers.parseEther("100"));

            await expect(
                vnd.connect(user1).burn(user1.address, ethers.parseEther("50"))
            ).to.be.revertedWithCustomError(vnd, "AccessControlUnauthorizedAccount")
                .withArgs(user1.address, BURNER_ROLE);
        });

        it("Should allow granted burner to burn", async function () {
            const { BURNER_ROLE } = await getRoles();
            await vnd.grantRole(BURNER_ROLE, burner.address);
            await vnd.mint(user1.address, ethers.parseEther("100"));

            await vnd.connect(burner).burn(user1.address, ethers.parseEther("50"));
            expect(await vnd.balanceOf(user1.address)).to.equal(ethers.parseEther("50"));
        });
    });

    describe("Access Control - Blacklist", function () {
        it("Should revert if non-admin tries to blacklist", async function () {
            const { DEFAULT_ADMIN_ROLE } = await getRoles();

            await expect(
                vnd.connect(user1).blacklist(user2.address)
            ).to.be.revertedWithCustomError(vnd, "AccessControlUnauthorizedAccount")
                .withArgs(user1.address, DEFAULT_ADMIN_ROLE);
        });

        it("Should revert if non-admin tries to removeBlacklist", async function () {
            const { DEFAULT_ADMIN_ROLE } = await getRoles();
            await vnd.blacklist(user1.address);

            await expect(
                vnd.connect(user2).removeBlacklist(user1.address)
            ).to.be.revertedWithCustomError(vnd, "AccessControlUnauthorizedAccount")
                .withArgs(user2.address, DEFAULT_ADMIN_ROLE);
        });

        it("Should allow granted admin to blacklist", async function () {
            const { DEFAULT_ADMIN_ROLE } = await getRoles();
            await vnd.grantRole(DEFAULT_ADMIN_ROLE, admin.address);

            await vnd.connect(admin).blacklist(user1.address);
            expect(await vnd.blacklisted(user1.address)).to.be.true;
        });
    });

    describe("Access Control - Pause", function () {
        it("Should revert if non-pauser tries to pause", async function () {
            const { PAUSER_ROLE } = await getRoles();

            await expect(
                vnd.connect(user1).pause()
            ).to.be.revertedWithCustomError(vnd, "AccessControlUnauthorizedAccount")
                .withArgs(user1.address, PAUSER_ROLE);
        });

        it("Should revert if non-pauser tries to unpause", async function () {
            const { PAUSER_ROLE } = await getRoles();
            await vnd.pause();

            await expect(
                vnd.connect(user1).unpause()
            ).to.be.revertedWithCustomError(vnd, "AccessControlUnauthorizedAccount")
                .withArgs(user1.address, PAUSER_ROLE);
        });

        it("Should allow granted pauser to pause/unpause", async function () {
            const { PAUSER_ROLE } = await getRoles();
            await vnd.grantRole(PAUSER_ROLE, pauser.address);

            await vnd.connect(pauser).pause();
            expect(await vnd.paused()).to.be.true;

            await vnd.connect(pauser).unpause();
            expect(await vnd.paused()).to.be.false;
        });
    });

    describe("Pause - Minting and Burning", function () {
        it("Should revert minting when paused", async function () {
            await vnd.pause();

            await expect(
                vnd.mint(user1.address, ethers.parseEther("100"))
            ).to.be.revertedWithCustomError(vnd, "EnforcedPause");
        });

        it("Should revert burning when paused", async function () {
            await vnd.mint(user1.address, ethers.parseEther("100"));
            await vnd.pause();

            await expect(
                vnd.burn(user1.address, ethers.parseEther("50"))
            ).to.be.revertedWithCustomError(vnd, "EnforcedPause");
        });

        it("Should allow minting after unpause", async function () {
            await vnd.pause();
            await vnd.unpause();

            await vnd.mint(user1.address, ethers.parseEther("100"));
            expect(await vnd.balanceOf(user1.address)).to.equal(ethers.parseEther("100"));
        });
    });

    describe("Blacklist - RemoveBlacklist Restores Functionality", function () {
        it("Should restore transfer ability after removeBlacklist", async function () {
            await vnd.mint(user1.address, ethers.parseEther("100"));

            // Blacklist
            await vnd.blacklist(user1.address);
            await expect(
                vnd.connect(user1).transfer(user2.address, ethers.parseEther("50"))
            ).to.be.revertedWith("Sender blacklisted");

            // Remove from blacklist
            await vnd.removeBlacklist(user1.address);
            expect(await vnd.blacklisted(user1.address)).to.be.false;

            // Should work now
            await vnd.connect(user1).transfer(user2.address, ethers.parseEther("50"));
            expect(await vnd.balanceOf(user2.address)).to.equal(ethers.parseEther("50"));
        });

        it("Should restore receive ability after removeBlacklist", async function () {
            await vnd.mint(owner.address, ethers.parseEther("100"));

            // Blacklist recipient
            await vnd.blacklist(user1.address);
            await expect(
                vnd.transfer(user1.address, ethers.parseEther("50"))
            ).to.be.revertedWith("Recipient blacklisted");

            // Remove from blacklist
            await vnd.removeBlacklist(user1.address);

            // Should work now
            await vnd.transfer(user1.address, ethers.parseEther("50"));
            expect(await vnd.balanceOf(user1.address)).to.equal(ethers.parseEther("50"));
        });
    });

    describe("Blacklist - transferFrom behavior", function () {
        it("Should revert transferFrom if sender is blacklisted", async function () {
            await vnd.mint(user1.address, ethers.parseEther("100"));
            await vnd.connect(user1).approve(user2.address, ethers.parseEther("100"));

            await vnd.blacklist(user1.address);

            await expect(
                vnd.connect(user2).transferFrom(user1.address, user2.address, ethers.parseEther("50"))
            ).to.be.revertedWith("Sender blacklisted");
        });

        it("Should revert transferFrom if recipient is blacklisted", async function () {
            await vnd.mint(user1.address, ethers.parseEther("100"));
            await vnd.connect(user1).approve(owner.address, ethers.parseEther("100"));

            await vnd.blacklist(user2.address);

            await expect(
                vnd.transferFrom(user1.address, user2.address, ethers.parseEther("50"))
            ).to.be.revertedWith("Recipient blacklisted");
        });

        it("Should allow transferFrom if spender is blacklisted but not sender/recipient", async function () {
            await vnd.mint(user1.address, ethers.parseEther("100"));
            await vnd.connect(user1).approve(user2.address, ethers.parseEther("100"));

            // Blacklist the spender (user2), but not the from (user1) or to (owner)
            await vnd.blacklist(user2.address);

            // This should succeed because blacklist only checks from and to, not msg.sender
            await vnd.connect(user2).transferFrom(user1.address, owner.address, ethers.parseEther("50"));
            expect(await vnd.balanceOf(owner.address)).to.equal(ethers.parseEther("50"));
        });
    });

    describe("Blacklist - approve behavior", function () {
        it("Should allow blacklisted address to approve (for potential seizure preparation)", async function () {
            await vnd.mint(user1.address, ethers.parseEther("100"));
            await vnd.blacklist(user1.address);

            // Approve should still work (it doesn't transfer tokens)
            await vnd.connect(user1).approve(owner.address, ethers.parseEther("100"));
            expect(await vnd.allowance(user1.address, owner.address)).to.equal(ethers.parseEther("100"));
        });
    });

    describe("Event Emissions", function () {
        it("Should emit Mint event", async function () {
            await expect(vnd.mint(user1.address, ethers.parseEther("100")))
                .to.emit(vnd, "Mint")
                .withArgs(user1.address, ethers.parseEther("100"));
        });

        it("Should emit Burn event", async function () {
            await vnd.mint(user1.address, ethers.parseEther("100"));

            await expect(vnd.burn(user1.address, ethers.parseEther("50")))
                .to.emit(vnd, "Burn")
                .withArgs(user1.address, ethers.parseEther("50"));
        });

        it("Should emit Blacklisted event", async function () {
            await expect(vnd.blacklist(user1.address))
                .to.emit(vnd, "Blacklisted")
                .withArgs(user1.address);
        });

        it("Should emit UnBlacklisted event", async function () {
            await vnd.blacklist(user1.address);

            await expect(vnd.removeBlacklist(user1.address))
                .to.emit(vnd, "UnBlacklisted")
                .withArgs(user1.address);
        });
    });

    describe("Token Metadata", function () {
        it("Should have correct name", async function () {
            expect(await vnd.name()).to.equal("VND Stablecoin");
        });

        it("Should have correct symbol", async function () {
            expect(await vnd.symbol()).to.equal("VND");
        });

        it("Should have 18 decimals", async function () {
            expect(await vnd.decimals()).to.equal(18);
        });
    });

    describe("Role Hierarchy", function () {
        it("Should allow DEFAULT_ADMIN_ROLE to grant other roles", async function () {
            const { MINTER_ROLE } = await getRoles();

            await vnd.grantRole(MINTER_ROLE, user1.address);
            expect(await vnd.hasRole(MINTER_ROLE, user1.address)).to.be.true;
        });

        it("Should allow DEFAULT_ADMIN_ROLE to revoke other roles", async function () {
            const { MINTER_ROLE } = await getRoles();

            await vnd.grantRole(MINTER_ROLE, user1.address);
            await vnd.revokeRole(MINTER_ROLE, user1.address);
            expect(await vnd.hasRole(MINTER_ROLE, user1.address)).to.be.false;
        });

        it("Should not allow non-admin to grant roles", async function () {
            const { DEFAULT_ADMIN_ROLE, MINTER_ROLE } = await getRoles();

            await expect(
                vnd.connect(user1).grantRole(MINTER_ROLE, user2.address)
            ).to.be.revertedWithCustomError(vnd, "AccessControlUnauthorizedAccount")
                .withArgs(user1.address, DEFAULT_ADMIN_ROLE);
        });
    });
});
