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

  describe("AgentProxy execution", function () {
    let proxy: any;

    beforeEach(async function () {
      await registry.setPolicy(agent.address, TEN_ETH, ONE_HOUR, [await mockTarget.getAddress()]);

      const AgentProxyFactory = await ethers.getContractFactory("AgentProxy");
      proxy = await AgentProxyFactory.deploy(await registry.getAddress());

      // Fund proxy with ETH for value transfers
      await owner.sendTransaction({ to: await proxy.getAddress(), value: ethers.parseEther("100") });
    });

    it("agent executes call through proxy", async function () {
      const calldata = mockTarget.interface.encodeFunctionData("setValue", [42]);
      await proxy.connect(agent).execute(await mockTarget.getAddress(), 0, calldata);

      expect(await mockTarget.value()).to.equal(42);
    });

    it("agent sends ETH through proxy", async function () {
      const calldata = mockTarget.interface.encodeFunctionData("setValue", [99]);
      await proxy.connect(agent).execute(await mockTarget.getAddress(), ONE_ETH, calldata);

      expect(await mockTarget.value()).to.equal(99);
    });

    it("agent exceeding cap is rejected", async function () {
      const ELEVEN_ETH = ethers.parseEther("11");
      const calldata = mockTarget.interface.encodeFunctionData("setValue", [1]);
      await expect(
        proxy.connect(agent).execute(await mockTarget.getAddress(), ELEVEN_ETH, calldata)
      ).to.be.revertedWith("Exceeds spending cap");
    });

    it("emits ActionApproved on success", async function () {
      const calldata = mockTarget.interface.encodeFunctionData("setValue", [42]);
      const selector = calldata.slice(0, 10);
      await expect(proxy.connect(agent).execute(await mockTarget.getAddress(), 0, calldata))
        .to.emit(registry, "ActionApproved")
        .withArgs(agent.address, await mockTarget.getAddress(), 0, selector);
    });
  });
});
