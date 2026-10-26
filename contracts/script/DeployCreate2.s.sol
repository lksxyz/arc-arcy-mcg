// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {Create2Factory} from "./Create2Factory.sol";

contract DeployCreate2 is Script {
    function run() external returns (address deployedAddress) {
        address factory = vm.envAddress("FACTORY_ADDRESS");
        bytes32 salt = vm.envBytes32("CREATE2_SALT");
        bytes memory creationCode = vm.envBytes("CREATION_CODE");
        uint256 deployValue = vm.envOr("DEPLOY_VALUE", uint256(0));

        bytes32 bytecodeHash = keccak256(creationCode);
        address predicted = vm.computeCreate2Address(salt, bytecodeHash, factory);

        vm.startBroadcast();
        deployedAddress = Create2Factory(factory).deploy{value: deployValue}(salt, creationCode);
        vm.stopBroadcast();

        require(deployedAddress == predicted, "DeployCreate2: actual address did not match prediction");
    }
}
