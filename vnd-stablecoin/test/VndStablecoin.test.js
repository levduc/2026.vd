import { expect } from "chai";
import hre from "hardhat";

const { ethers } = hre;

describe("VndStablecoin", function () {
    let VndStablecoin;
    let vnd;
    let owner;
    let addr1;
    let addr2;
    let addrs;

    beforeEach(async function () {
        [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
        VndStablecoin = await ethers.getContractFactory("VndStablecoin");
        vnd = await VndStablecoin.deploy();
        VndStablecoin = await ethers.getContractFactory("VndStablecoin");
        vnd = await VndStablecoin.deploy();
    });

    const getRoles = async () => {
        const DEFAULT_ADMIN_ROLE = await vnd.DEFAULT_ADMIN_ROLE();
        const MINTER_ROLE = await vnd.MINTER_ROLE();
        const PAUSER_ROLE = await vnd.PAUSER_ROLE();
        const BURNER_ROLE = await vnd.BURNER_ROLE();
        return { DEFAULT_ADMIN_ROLE, MINTER_ROLE, PAUSER_ROLE, BURNER_ROLE };
    };

    describe("Deployment", function () {
        it("Should set the right admin", async function () {
            const { DEFAULT_ADMIN_ROLE } = await getRoles();
            expect(await vnd.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.equal(true);
        });

        it("Should assign the total supply of tokens to the owner", async function () {
            const ownerBalance = await vnd.balanceOf(owner.address);
            expect(await vnd.totalSupply()).to.equal(ownerBalance);
        });
    });

    describe("Minting", function () {
        it("Should allow owner to mint tokens", async function () {
            const mintAmount = ethers.parseEther("1000");
            await vnd.mint(addr1.address, mintAmount);
            expect(await vnd.balanceOf(addr1.address)).to.equal(mintAmount);
        });

        it("Should fail if non-minter tries to mint", async function () {
            const { MINTER_ROLE } = await getRoles();
            const mintAmount = ethers.parseEther("1000");
            await expect(
                vnd.connect(addr1).mint(addr1.address, mintAmount)
            ).to.be.revertedWithCustomError(vnd, "AccessControlUnauthorizedAccount")
                .withArgs(addr1.address, MINTER_ROLE);
        });
    });

    describe("Burning", function () {
        it("Should allow burner to burn tokens from an address", async function () {
            const mintAmount = ethers.parseEther("1000");
            await vnd.mint(addr1.address, mintAmount);

            const burnAmount = ethers.parseEther("500");
            await vnd.burn(addr1.address, burnAmount);

            expect(await vnd.balanceOf(addr1.address)).to.equal(ethers.parseEther("500"));
        });
    });

    describe("Blacklist", function () {
        it("Should allow admin to blacklist an address", async function () {
            await vnd.blacklist(addr1.address);
            expect(await vnd.blacklisted(addr1.address)).to.equal(true);
        });

        it("Should prevent blacklisted address from sending tokens", async function () {
            await vnd.mint(addr1.address, ethers.parseEther("100"));
            await vnd.blacklist(addr1.address);

            await expect(
                vnd.connect(addr1).transfer(addr2.address, ethers.parseEther("50"))
            ).to.be.revertedWith("Sender blacklisted");
        });

        it("Should prevent blacklisted address from receiving tokens", async function () {
            await vnd.mint(owner.address, ethers.parseEther("100"));
            await vnd.blacklist(addr1.address);

            await expect(
                vnd.transfer(addr1.address, ethers.parseEther("50"))
            ).to.be.revertedWith("Recipient blacklisted");
        });
    });

    describe("Pausable", function () {
        it("Should allow pauser to pause and unpause", async function () {
            await vnd.pause();
            expect(await vnd.paused()).to.equal(true);

            await vnd.unpause();
            expect(await vnd.paused()).to.equal(false);
        });

        it("Should prevent transfers when paused", async function () {
            await vnd.mint(owner.address, ethers.parseEther("100"));
            await vnd.pause();

            await expect(
                vnd.transfer(addr1.address, ethers.parseEther("50"))
            ).to.be.revertedWithCustomError(vnd, "EnforcedPause");
        });
    });
});
