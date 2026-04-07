import { expect } from "chai";
import { ethers } from "hardhat";
import { PolicyRegistry, MockTarget } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Scenario A: Single Agent Policy", function () {
  let registry: PolicyRegistry;
  let mockTarget: MockTarget;
  let owner: SignerWithAddress;
  let agent: SignerWithAddress;
  let stranger: SignerWithAddress;

  const ONE_ETH = ethers.parseEther("1");
  const TEN_ETH = ethers.parseEther("10");
  const ONE_HOUR = 3600;

  beforeEach(async function () {
    [owner, agent, stranger] = await ethers.getSigners();

    const PolicyRegistryFactory = await ethers.getContractFactory("PolicyRegistry");
    registry = await PolicyRegistryFactory.deploy();

    const MockTargetFactory = await ethers.getContractFactory("MockTarget");
    mockTarget = await MockTargetFactory.deploy();
  });

  describe("setPolicy", function () {
    it("owner sets policy for agent", async function () {
      await registry.setPolicy(agent.address, TEN_ETH, ONE_HOUR, [await mockTarget.getAddress()]);

      const policy = await registry.getPolicy(agent.address);
      expect(policy.spendingCap).to.equal(TEN_ETH);
      expect(policy.periodSeconds).to.equal(ONE_HOUR);
      expect(policy.active).to.equal(true);
    });

    it("non-owner cannot set policy", async function () {
      await expect(
        registry.connect(agent).setPolicy(stranger.address, TEN_ETH, ONE_HOUR, [await mockTarget.getAddress()])
      ).to.be.revertedWith("Only owner");
    });

    it("emits PolicySet event", async function () {
      await expect(registry.setPolicy(agent.address, TEN_ETH, ONE_HOUR, [await mockTarget.getAddress()]))
        .to.emit(registry, "PolicySet")
        .withArgs(owner.address, agent.address, TEN_ETH, ONE_HOUR);
    });
  });

  describe("checkPolicy", function () {
    beforeEach(async function () {
      await registry.setPolicy(agent.address, TEN_ETH, ONE_HOUR, [await mockTarget.getAddress()]);
    });

    it("allows action within cap and whitelist", async function () {
      await registry.connect(agent).recordSpend(agent.address, ONE_ETH, await mockTarget.getAddress());
    });

    it("rejects action exceeding cap", async function () {
      const ELEVEN_ETH = ethers.parseEther("11");
      await expect(
        registry.connect(agent).recordSpend(agent.address, ELEVEN_ETH, await mockTarget.getAddress())
      ).to.be.revertedWith("Exceeds spending cap");
    });

    it("rejects action to non-whitelisted target", async function () {
      await expect(
        registry.connect(agent).recordSpend(agent.address, ONE_ETH, stranger.address)
      ).to.be.revertedWith("Target not whitelisted");
    });

    it("resets spent after period expires", async function () {
      await registry.connect(agent).recordSpend(agent.address, TEN_ETH, await mockTarget.getAddress());

      await ethers.provider.send("evm_increaseTime", [ONE_HOUR + 1]);
      await ethers.provider.send("evm_mine", []);

      await registry.connect(agent).recordSpend(agent.address, TEN_ETH, await mockTarget.getAddress());
    });

    it("tracks cumulative spending within period", async function () {
      await registry.connect(agent).recordSpend(agent.address, ethers.parseEther("6"), await mockTarget.getAddress());
      await registry.connect(agent).recordSpend(agent.address, ethers.parseEther("4"), await mockTarget.getAddress());

      await expect(
        registry.connect(agent).recordSpend(agent.address, ONE_ETH, await mockTarget.getAddress())
      ).to.be.revertedWith("Exceeds spending cap");
    });
  });
});
