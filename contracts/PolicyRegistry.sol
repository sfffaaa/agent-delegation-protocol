// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "./mocks/did.sol";

contract PolicyRegistry {
    struct Policy {
        uint256 spendingCap;
        uint256 periodSeconds;
        uint256 spent;
        uint256 periodStart;
        address[] whitelist;
        address delegatedBy;
        bool active;
    }

    uint256 public constant MAX_CHAIN_DEPTH = 10;

    address public owner;
    mapping(address => Policy) internal _policies;
    mapping(address => bool) public authorizedProxies;

    event PolicySet(address indexed owner, address indexed agent, uint256 cap, uint256 period);
    event DIDPolicySet(address indexed didAccount, bytes name, address indexed agent);
    event PolicyDelegated(address indexed from, address indexed to, uint256 subCap);
    event DelegateRevoked(address indexed revoker, address indexed agent);
    event ActionApproved(address indexed agent, address target, uint256 value, bytes4 selector);
    event ActionDenied(address indexed agent, address target, uint256 value, string reason);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyAuthorizedProxy() {
        require(authorizedProxies[msg.sender], "Not authorized proxy");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setAuthorizedProxy(address proxy, bool authorized) external onlyOwner {
        authorizedProxies[proxy] = authorized;
    }

    function setPolicy(
        address agent,
        uint256 spendingCap,
        uint256 periodSeconds,
        address[] calldata whitelist
    ) external onlyOwner {
        _policies[agent] = Policy({
            spendingCap: spendingCap,
            periodSeconds: periodSeconds,
            spent: 0,
            periodStart: block.timestamp,
            whitelist: whitelist,
            delegatedBy: address(0),
            active: true
        });

        emit PolicySet(msg.sender, agent, spendingCap, periodSeconds);
    }

    function getPolicy(address agent) external view returns (Policy memory) {
        return _policies[agent];
    }

    function isWhitelisted(address agent, address target) public view returns (bool) {
        address[] storage wl = _policies[agent].whitelist;
        for (uint256 i = 0; i < wl.length; i++) {
            if (wl[i] == target) return true;
        }
        return false;
    }

    function recordSpend(address agent, uint256 amount, address target) external onlyAuthorizedProxy {
        Policy storage p = _policies[agent];
        require(p.active, "No active policy");
        require(_isChainActive(agent), "Delegation chain inactive");
        require(isWhitelisted(agent, target), "Target not whitelisted");

        if (block.timestamp >= p.periodStart + p.periodSeconds) {
            p.spent = 0;
            p.periodStart = block.timestamp;
        }

        require(p.spent + amount <= p.spendingCap, "Exceeds spending cap");
        p.spent += amount;
    }

    function emitActionApproved(address agent, address target, uint256 value, bytes4 selector) external onlyAuthorizedProxy {
        emit ActionApproved(agent, target, value, selector);
    }

    function delegate(
        address toAgent,
        uint256 subCap,
        uint256 subPeriod,
        address[] calldata subWhitelist
    ) external {
        Policy storage myPolicy = _policies[msg.sender];
        require(myPolicy.active, "No active policy");
        require(!_policies[toAgent].active, "Agent already has active policy");
        require(subCap <= myPolicy.spendingCap, "Sub-cap exceeds own cap");
        require(subPeriod >= myPolicy.periodSeconds, "Period cannot be shorter than delegator");

        for (uint256 i = 0; i < subWhitelist.length; i++) {
            require(isWhitelisted(msg.sender, subWhitelist[i]), "Target not in delegator whitelist");
        }

        _policies[toAgent] = Policy({
            spendingCap: subCap,
            periodSeconds: subPeriod,
            spent: 0,
            periodStart: block.timestamp,
            whitelist: subWhitelist,
            delegatedBy: msg.sender,
            active: true
        });

        emit PolicyDelegated(msg.sender, toAgent, subCap);
    }

    function revokeDelegate(address agent) external {
        Policy storage p = _policies[agent];
        require(p.delegatedBy == msg.sender, "Not the delegator");
        p.active = false;
        emit DelegateRevoked(msg.sender, agent);
    }

    function revokePolicy(address agent) external onlyOwner {
        _policies[agent].active = false;
        emit DelegateRevoked(msg.sender, agent);
    }

    function getDelegationChain(address agent) external view returns (address[] memory) {
        address[] memory chain = new address[](MAX_CHAIN_DEPTH);
        uint256 length = 0;
        address current = agent;

        for (uint256 i = 0; i < MAX_CHAIN_DEPTH; i++) {
            chain[length] = current;
            length++;
            if (_policies[current].delegatedBy == address(0)) break;
            current = _policies[current].delegatedBy;
        }

        address[] memory result = new address[](length);
        for (uint256 i = 0; i < length; i++) {
            result[i] = chain[i];
        }
        return result;
    }

    function setPolicyByDID(
        address didContract,
        address didAccount,
        bytes calldata name,
        uint256 spendingCap,
        uint256 periodSeconds,
        address[] calldata whitelist
    ) external onlyOwner {
        DID didInstance = DID(didContract);
        DID.Attribute memory attr = didInstance.readAttribute(didAccount, name);
        require(attr.value.length > 0, "DID attribute empty");

        // Parse agent address from DID attribute value (ASCII hex string like "0xabc...")
        address agent = _parseAddress(attr.value);

        _policies[agent] = Policy({
            spendingCap: spendingCap,
            periodSeconds: periodSeconds,
            spent: 0,
            periodStart: block.timestamp,
            whitelist: whitelist,
            delegatedBy: address(0),
            active: true
        });

        emit DIDPolicySet(didAccount, name, agent);
    }

    function _parseAddress(bytes memory data) internal pure returns (address) {
        require(data.length == 42, "Invalid address length");
        require(data[0] == 0x30 && data[1] == 0x78, "Missing 0x prefix");

        uint160 addr = 0;
        for (uint256 i = 0; i < 20; i++) {
            addr = addr << 8 | uint160(_fromHexChar(uint8(data[2 + i * 2])) * 16 + _fromHexChar(uint8(data[3 + i * 2])));
        }
        return address(addr);
    }

    function _fromHexChar(uint8 c) internal pure returns (uint8) {
        if (c >= 48 && c <= 57) return c - 48;       // '0'-'9'
        if (c >= 97 && c <= 102) return c - 87;       // 'a'-'f'
        if (c >= 65 && c <= 70) return c - 55;        // 'A'-'F'
        revert("Invalid hex char");
    }

    function _isChainActive(address agent) internal view returns (bool) {
        address current = agent;
        for (uint256 i = 0; i < MAX_CHAIN_DEPTH; i++) {
            Policy storage p = _policies[current];
            if (!p.active) return false;
            if (p.delegatedBy == address(0)) return true;
            current = p.delegatedBy;
        }
        return false;
    }
}
