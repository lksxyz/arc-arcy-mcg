// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";

contract Create2Factory {
    event Deployed(address indexed deployedAddress, bytes32 indexed salt);

    function deploy(bytes32 salt, bytes memory bytecode) external payable returns (address deployedAddress) {
        deployedAddress = Create2.deploy(msg.value, salt, bytecode);
        emit Deployed(deployedAddress, salt);
    }

    function computeAddress(bytes32 salt, bytes32 bytecodeHash) external view returns (address) {
        return Create2.computeAddress(salt, bytecodeHash);
    }
}
