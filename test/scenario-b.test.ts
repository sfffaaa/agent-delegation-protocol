import { expect } from "chai";
import { ethers } from "hardhat";
import { PolicyRegistry, AgentProxy, MockTarget } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Scenario B: Delegation Chain", function () {
  let registry: PolicyRegistry;
  let proxy: any;
  let mockTarget: MockTarget;
  let owner: SignerWithAddress;
  let agentA: SignerWithAddress;
  let agentB: SignerWithAddress;
  let agentC: SignerWithAddress;
  let agentD: SignerWithAddress;

  const TEN_ETH = ethers.parseEther("10");
  const FIVE_ETH = ethers.parseEther("5");
  const THREE_ETH = ethers.parseEther("3");
  const TWO_ETH = ethers.parseEther("2");
  const ONE_ETH = ethers.parseEther("1");
  const ONE_HOUR = 3600;
  const TWO_HOURS = 7200;

  beforeEach(async function () {
    [owner, agentA, agentB, agentC, agentD] = await ethers.getSigners();

    const PolicyRegistryFactory = await ethers.getContractFactory("PolicyRegistry");
    registry = await PolicyRegistryFactory.deploy();

    const AgentProxyFactory = await ethers.getContractFactory("AgentProxy");
    proxy = await AgentProxyFactory.deploy(await registry.getAddress());

    const MockTargetFactory = await ethers.getContractFactory("MockTarget");
    mockTarget = await MockTargetFactory.deploy();

    // Authorize proxy
    await registry.setAuthorizedProxy(await proxy.getAddress(), true);

    await owner.sendTransaction({ to: await proxy.getAddress(), value: ethers.parseEther("100") });

    // Owner sets policy for Agent A
    await registry.setPolicy(agentA.address, TEN_ETH, ONE_HOUR, [await mockTarget.getAddress()]);
  });

  describe("delegate", function () {
    it("Agent A delegates to Agent B with subset permissions", async function () {
      await registry.connect(agentA).delegate(
        agentB.address, THREE_ETH, TWO_HOURS, [await mockTarget.getAddress()]
      );

      const policy = await registry.getPolicy(agentB.address);
      expect(policy.spendingCap).to.equal(THREE_ETH);
      expect(policy.delegatedBy).to.equal(agentA.address);
      expect(policy.active).to.equal(true);
    });

    it("emits PolicyDelegated event", async function () {
      await expect(
        registry.connect(agentA).delegate(agentB.address, THREE_ETH, TWO_HOURS, [await mockTarget.getAddress()])
      ).to.emit(registry, "PolicyDelegated")
        .withArgs(agentA.address, agentB.address, THREE_ETH);
    });

    it("rejects delegation with cap exceeding delegator's cap", async function () {
      const TWENTY_ETH = ethers.parseEther("20");
      await expect(
        registry.connect(agentA).delegate(agentB.address, TWENTY_ETH, TWO_HOURS, [await mockTarget.getAddress()])
      ).to.be.revertedWith("Sub-cap exceeds own cap");
    });

    it("rejects delegation with non-subset whitelist", async function () {
      const fakeAddr = "0x0000000000000000000000000000000000000001";
      await expect(
        registry.connect(agentA).delegate(agentB.address, THREE_ETH, TWO_HOURS, [fakeAddr])
      ).to.be.revertedWith("Target not in delegator whitelist");
    });

    it("rejects delegation with shorter period than delegator", async function () {
      const SHORT = 60;
      await expect(
        registry.connect(agentA).delegate(agentB.address, THREE_ETH, SHORT, [await mockTarget.getAddress()])
      ).to.be.revertedWith("Period cannot be shorter than delegator");
    });

    it("agent without policy cannot delegate", async function () {
      await expect(
        registry.connect(agentB).delegate(agentC.address, ONE_ETH, ONE_HOUR, [await mockTarget.getAddress()])
      ).to.be.revertedWith("No active policy");
    });

    it("rejects delegation to agent with existing active policy", async function () {
      await registry.connect(agentA).delegate(
        agentB.address, THREE_ETH, TWO_HOURS, [await mockTarget.getAddress()]
      );
      // Agent A tries to re-delegate to B (already active)
      await expect(
        registry.connect(agentA).delegate(agentB.address, TWO_ETH, TWO_HOURS, [await mockTarget.getAddress()])
      ).to.be.revertedWith("Agent already has active policy");
    });

    it("rejects circular delegation", async function () {
      await registry.connect(agentA).delegate(
        agentB.address, THREE_ETH, TWO_HOURS, [await mockTarget.getAddress()]
      );
      // B tries to delegate back to A (A has active policy from owner)
      await expect(
        registry.connect(agentB).delegate(agentA.address, TWO_ETH, TWO_HOURS, [await mockTarget.getAddress()])
      ).to.be.revertedWith("Agent already has active policy");
    });
  });

  describe("delegated agent execution", function () {
    beforeEach(async function () {
      await registry.connect(agentA).delegate(
        agentB.address, THREE_ETH, TWO_HOURS, [await mockTarget.getAddress()]
      );
    });

    it("delegated agent executes within sub-cap", async function () {
      const calldata = mockTarget.interface.encodeFunctionData("setValue", [42]);
      await proxy.connect(agentB).execute(await mockTarget.getAddress(), ONE_ETH, calldata);
      expect(await mockTarget.value()).to.equal(42);
    });

    it("delegated agent rejected when exceeding sub-cap", async function () {
      const calldata = mockTarget.interface.encodeFunctionData("setValue", [1]);
      await expect(
        proxy.connect(agentB).execute(await mockTarget.getAddress(), FIVE_ETH, calldata)
      ).to.be.revertedWith("Exceeds spending cap");
    });
  });

  describe("three-level chain: A -> B -> C", function () {
    beforeEach(async function () {
      await registry.connect(agentA).delegate(
        agentB.address, FIVE_ETH, TWO_HOURS, [await mockTarget.getAddress()]
      );
      await registry.connect(agentB).delegate(
        agentC.address, TWO_ETH, TWO_HOURS, [await mockTarget.getAddress()]
      );
    });

    it("Agent C can execute through three-level chain", async function () {
      const calldata = mockTarget.interface.encodeFunctionData("setValue", [77]);
      await proxy.connect(agentC).execute(await mockTarget.getAddress(), ONE_ETH, calldata);
      expect(await mockTarget.value()).to.equal(77);
    });

    it("revoking Agent A invalidates B and C", async function () {
      await registry.revokePolicy(agentA.address);

      const calldata = mockTarget.interface.encodeFunctionData("setValue", [1]);
      await expect(
        proxy.connect(agentB).execute(await mockTarget.getAddress(), ONE_ETH, calldata)
      ).to.be.revertedWith("Delegation chain inactive");

      await expect(
        proxy.connect(agentC).execute(await mockTarget.getAddress(), ONE_ETH, calldata)
      ).to.be.revertedWith("Delegation chain inactive");
    });

    it("revoking Agent B invalidates C but not A", async function () {
      await registry.connect(agentA).revokeDelegate(agentB.address);

      // A still works
      const calldata = mockTarget.interface.encodeFunctionData("setValue", [88]);
      await proxy.connect(agentA).execute(await mockTarget.getAddress(), ONE_ETH, calldata);
      expect(await mockTarget.value()).to.equal(88);

      // C is broken
      await expect(
        proxy.connect(agentC).execute(await mockTarget.getAddress(), ONE_ETH, calldata)
      ).to.be.revertedWith("Delegation chain inactive");
    });
  });

  describe("getDelegationChain", function () {
    it("returns full chain path", async function () {
      await registry.connect(agentA).delegate(
        agentB.address, FIVE_ETH, TWO_HOURS, [await mockTarget.getAddress()]
      );
      await registry.connect(agentB).delegate(
        agentC.address, TWO_ETH, TWO_HOURS, [await mockTarget.getAddress()]
      );

      const chain = await registry.getDelegationChain(agentC.address);
      expect(chain[0]).to.equal(agentC.address);
      expect(chain[1]).to.equal(agentB.address);
      expect(chain[2]).to.equal(agentA.address);
    });
  });
});
