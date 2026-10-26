// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

interface IDeployedRegistry {}
interface IDeployedAnnouncer {}

contract DeployArcy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        address registry = deployCode("ArcyRegistry.sol:ArcyRegistry");
        console2.log("ArcyRegistry:  ", registry);

        address announcer = deployCode("ArcyAnnouncer.sol:ArcyAnnouncer");
        console2.log("ArcyAnnouncer: ", announcer);

        bytes memory payArgs = abi.encode(registry, announcer);
        address pay = deployCode("ArcyPay.sol:ArcyPay", payArgs);
        console2.log("ArcyPay:       ", pay);

        vm.stopBroadcast();

        console2.log("\n=== MAINNET DEPLOYMENT SUMMARY ===");
        console2.log("Chain ID:      ", block.chainid);
        console2.log("Deployer:      ", vm.addr(deployerKey));
        console2.log("ArcyRegistry:  ", registry);
        console2.log("ArcyAnnouncer: ", announcer);
        console2.log("ArcyPay:       ", pay);
        console2.log("===================================");
        console2.log("Update src/contracts.ts with these addresses.");
    }
}
