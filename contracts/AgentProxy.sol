// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "./PolicyRegistry.sol";

contract AgentProxy {
    PolicyRegistry public registry;

    constructor(address _registry) {
        registry = PolicyRegistry(_registry);
    }

    function execute(
        address target,
        uint256 value,
        bytes calldata data
    ) external {
        registry.recordSpend(msg.sender, value, target);

        (bool success, bytes memory returnData) = target.call{value: value}(data);
        require(success, string(returnData));

        bytes4 selector = data.length >= 4 ? bytes4(data[:4]) : bytes4(0);
        registry.emitActionApproved(msg.sender, target, value, selector);
    }

    receive() external payable {}
}
