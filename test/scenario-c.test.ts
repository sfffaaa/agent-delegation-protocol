import { expect } from "chai";
import { ethers } from "hardhat";
import { PolicyRegistry, AgentProxy, MockTarget } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Scenario C: DID Integration", function () {
  let registry: PolicyRegistry;
  let proxy: any;
  let mockTarget: MockTarget;
  let didMock: any;
  let owner: SignerWithAddress;
  let agent: SignerWithAddress;
  let didAccount: SignerWithAddress;

  const TEN_ETH = ethers.parseEther("10");
  const ONE_ETH = ethers.parseEther("1");
  const ONE_HOUR = 3600;

  beforeEach(async function () {
    [owner, agent, didAccount] = await ethers.getSigners();

    const DidMockFactory = await ethers.getContractFactory("PrecompileDidMock");
    didMock = await DidMockFactory.deploy();

    const PolicyRegistryFactory = await ethers.getContractFactory("PolicyRegistry");
    registry = await PolicyRegistryFactory.deploy();

    const AgentProxyFactory = await ethers.getContractFactory("AgentProxy");
    proxy = await AgentProxyFactory.deploy(await registry.getAddress());

    const MockTargetFactory = await ethers.getContractFactory("MockTarget");
    mockTarget = await MockTargetFactory.deploy();

    // Authorize proxy
    await registry.setAuthorizedProxy(await proxy.getAddress(), true);

    await owner.sendTransaction({ to: await proxy.getAddress(), value: ethers.parseEther("100") });

    // Register DID: didAccount has attribute "agent" pointing to agent's address
    const agentAddrBytes = ethers.toUtf8Bytes(agent.address.toLowerCase());
    await didMock.addAttribute(
      didAccount.address,
      ethers.toUtf8Bytes("agent"),
      agentAddrBytes,
      86400
    );
  });

  describe("setPolicyByDID", function () {
    it("sets policy via DID resolution", async function () {
      await registry.setPolicyByDID(
        await didMock.getAddress(),
        didAccount.address,
        ethers.toUtf8Bytes("agent"),
        TEN_ETH,
        ONE_HOUR,
        [await mockTarget.getAddress()]
      );

      const policy = await registry.getPolicy(agent.address);
      expect(policy.spendingCap).to.equal(TEN_ETH);
      expect(policy.active).to.equal(true);
    });

    it("emits DIDPolicySet event", async function () {
      await expect(
        registry.setPolicyByDID(
          await didMock.getAddress(),
          didAccount.address,
          ethers.toUtf8Bytes("agent"),
          TEN_ETH,
          ONE_HOUR,
          [await mockTarget.getAddress()]
        )
      ).to.emit(registry, "DIDPolicySet");
    });

    it("reverts when DID attribute is empty", async function () {
      await expect(
        registry.setPolicyByDID(
          await didMock.getAddress(),
          didAccount.address,
          ethers.toUtf8Bytes("nonexistent"),
          TEN_ETH,
          ONE_HOUR,
          [await mockTarget.getAddress()]
        )
      ).to.be.revertedWith("DID attribute empty");
    });
  });

  describe("execution via DID-resolved agent", function () {
    beforeEach(async function () {
      await registry.setPolicyByDID(
        await didMock.getAddress(),
        didAccount.address,
        ethers.toUtf8Bytes("agent"),
        TEN_ETH,
        ONE_HOUR,
        [await mockTarget.getAddress()]
      );
    });

    it("resolved agent can execute through proxy", async function () {
      const calldata = mockTarget.interface.encodeFunctionData("setValue", [123]);
      await proxy.connect(agent).execute(await mockTarget.getAddress(), ONE_ETH, calldata);
      expect(await mockTarget.value()).to.equal(123);
    });
  });
});
