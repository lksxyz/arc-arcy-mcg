// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ArcyAnnouncer} from "../../contracts/ArcyAnnouncer.sol";

contract ArcyAnnouncerTest is Test {
    ArcyAnnouncer internal announcer;

    address internal sender = makeAddr("sender");
    address internal stealth = makeAddr("stealth");

    bytes internal pubKey;

    event Announcement(
        uint256 indexed schemeId,
        address indexed stealthAddress,
        address indexed caller,
        bytes ephemeralPubKey,
        bytes1 viewTag
    );

    function setUp() public {
        announcer = new ArcyAnnouncer();
        pubKey = new bytes(33);
        pubKey[0] = 0x02;
    }

    function test_Announce() public {
        vm.expectEmit(true, true, true, true, address(announcer));
        emit Announcement(1, stealth, sender, pubKey, 0xab);

        vm.prank(sender);
        announcer.announce(1, stealth, pubKey, 0xab);
    }

    function test_Announce_RevertWhen_PubKeyWrongLength() public {
        vm.prank(sender);
        vm.expectRevert(ArcyAnnouncer.InvalidEphemeralPubKey.selector);
        announcer.announce(1, stealth, hex"1234", 0xab);
    }

    function test_Announce_RevertWhen_PubKeyPrefixInvalid() public {
        bytes memory badKey = new bytes(33);
        badKey[0] = 0x04;

        vm.prank(sender);
        vm.expectRevert(ArcyAnnouncer.InvalidEphemeralPubKey.selector);
        announcer.announce(1, stealth, badKey, 0xab);
    }

    function test_Announce_RevertWhen_PubKeyAllZero() public {
        vm.prank(sender);
        vm.expectRevert(ArcyAnnouncer.InvalidEphemeralPubKey.selector);
        announcer.announce(1, stealth, new bytes(33), 0xab);
    }
}
