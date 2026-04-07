// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.8.17;

import './did.sol';

contract PrecompileDidMock is DID {
    mapping(address => mapping(bytes => bytes)) public _data;
    mapping(address => mapping(bytes => uint32)) public _validity;
    bool public returnValue = true;

    function addAttribute(
        address didAccount,
        bytes memory name,
        bytes memory value,
        uint32 validityFor
    ) public returns (bool) {
        require(name.length < 65, 'Name too long');
        require(value.length < 2561, 'Value too long');
        require(_isASCIIBytes(name), 'Name not ASCII');
        require(_isASCIIBytes(value), 'Value not ASCII');
        require(_data[didAccount][name].length == 0, 'Attribute exists');
        _data[didAccount][name] = value;
        _validity[didAccount][name] = validityFor;
        return returnValue;
    }

    function readAttribute(
        address didAccount,
        bytes memory name
    ) public view returns (Attribute memory) {
        return
            Attribute({
                name: name,
                value: _data[didAccount][name],
                validity: _validity[didAccount][name],
                created: 0
            });
    }

    function updateAttribute(
        address didAccount,
        bytes memory name,
        bytes memory value,
        uint32 validityFor
    ) public returns (bool) {
        require(name.length < 65, 'Name too long');
        require(value.length < 2561, 'Value too long');
        require(_isASCIIBytes(name), 'Name not ASCII');
        require(_isASCIIBytes(value), 'Value not ASCII');
        _data[didAccount][name] = value;
        _validity[didAccount][name] = validityFor;
        return returnValue;
    }

    function removeAttribute(
        address didAccount,
        bytes memory name
    ) public returns (bool) {
        delete _data[didAccount][name];
        delete _validity[didAccount][name];
        return returnValue;
    }

    function _isASCIIBytes(bytes memory data) internal pure returns (bool) {
        for (uint256 i = 0; i < data.length; i++) {
            if (uint8(data[i]) < 32 || uint8(data[i]) > 126) {
                return false;
            }
        }
        return true;
    }

    function setReturnValue(bool _returnValue) public {
        returnValue = _returnValue;
    }
}
