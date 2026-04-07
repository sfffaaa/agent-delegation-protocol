// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.17;

address constant PRECOMPILE_ADDR = address(
    0x0000000000000000000000000000000000000800
);

DID constant DID_CONTRACT = DID(PRECOMPILE_ADDR);

interface DID {
    struct Attribute {
        bytes name;
        bytes value;
        uint32 validity;
        uint256 created;
    }

    function readAttribute(
        address didAccount,
        bytes memory name
    ) external view returns (Attribute memory);

    function addAttribute(
        address didAccount,
        bytes memory name,
        bytes memory value,
        uint32 validityFor
    ) external returns (bool);

    function updateAttribute(
        address didAccount,
        bytes memory name,
        bytes memory value,
        uint32 validityFor
    ) external returns (bool);

    function removeAttribute(
        address didAccount,
        bytes memory name
    ) external returns (bool);

    event AddAttribute(
        address indexed sender,
        address indexed didAccount,
        bytes name,
        bytes value,
        uint32 indexed validity
    );
    event UpdateAttribute(
        address indexed sender,
        address indexed didAccount,
        bytes name,
        bytes value,
        uint32 indexed validity
    );
    event RemoveAttribute(address indexed didAccount, bytes name);

    error EntryNotFound(address account, bytes name);
}
