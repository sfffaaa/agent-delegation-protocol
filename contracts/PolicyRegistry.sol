// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

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

    address public owner;
    mapping(address => Policy) internal _policies;

    event PolicySet(address indexed owner, address indexed agent, uint256 cap, uint256 period);
    event PolicyDelegated(address indexed from, address indexed to, uint256 subCap);
    event DelegateRevoked(address indexed revoker, address indexed agent);
    event ActionApproved(address indexed agent, address target, uint256 value, bytes4 selector);
    event ActionDenied(address indexed agent, address target, uint256 value, string reason);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor() {
        owner = msg.sender;
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

    function recordSpend(address agent, uint256 amount, address target) external {
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

    function emitActionApproved(address agent, address target, uint256 value, bytes4 selector) external {
        emit ActionApproved(agent, target, value, selector);
    }

    function _isChainActive(address agent) internal view returns (bool) {
        address current = agent;
        for (uint256 i = 0; i < 10; i++) {
            Policy storage p = _policies[current];
            if (!p.active) return false;
            if (p.delegatedBy == address(0)) return true;
            current = p.delegatedBy;
        }
        return false;
    }
}
