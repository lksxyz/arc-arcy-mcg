// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ArcyRegistry} from "../../contracts/ArcyRegistry.sol";

contract ArcyRegistryTest is Test {
    ArcyRegistry internal registry;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    bytes internal aliceMeta;
    bytes internal bobMeta;

    event UsernameRegistered(address indexed owner, string username, bytes stealthMetaAddress);
    event StealthMetaAddressUpdated(address indexed owner, bytes stealthMetaAddress);
    event UsernameReleased(address indexed owner, string username);
    event UsernameTransferStarted(address indexed owner, string username, address indexed pendingOwner);
    event UsernameTransferCancelled(address indexed owner, string username);
    event UsernameTransferred(address indexed from, address indexed to, string username);

    function setUp() public {
        registry = new ArcyRegistry();
        aliceMeta = _metaAddress(0x02, 0x03, 0);
        bobMeta = _metaAddress(0x03, 0x02, 0);
    }

    function test_RegisterUsername() public {
        vm.expectEmit(true, false, false, true, address(registry));
        emit UsernameRegistered(alice, "alice", aliceMeta);

        vm.prank(alice);
        registry.registerUsername("alice", aliceMeta);

        assertEq(registry.getOwner("alice"), alice);
        assertEq(registry.getUsername(alice), "alice");
        assertEq(registry.getStealthMetaAddress("alice"), aliceMeta);
    }

    function test_RegisterUsername_WithVersion2Meta() public {
        bytes memory meta = _metaAddress(0x02, 0x03, 2);

        vm.prank(alice);
        registry.registerUsername("alice", meta);

        assertEq(registry.getStealthMetaAddress("alice"), meta);
    }

    function test_RegisterUsername_AcceptsAppGeneratedV2Meta() public {
        bytes memory meta =
            hex"021406eaaf75d5abef794709ab3b64ba4ccb789dcac814fd6352420acb4e520f3403d8ec86fc4361fc4e5405082b456d8b29b65a14e7546f3ac3a247286c27f028f8000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002";

        vm.prank(alice);
        registry.registerUsername("alice", meta);

        assertEq(registry.getStealthMetaAddress("alice"), meta);
    }

    function test_RegisterUsername_RevertWhen_TooShort() public {
        vm.prank(alice);
        vm.expectRevert(ArcyRegistry.UsernameTooShort.selector);
        registry.registerUsername("", aliceMeta);
    }

    function test_RegisterUsername_RevertWhen_TooLong() public {
        vm.prank(alice);
        vm.expectRevert(ArcyRegistry.UsernameTooLong.selector);
        registry.registerUsername("abcdefghijklmnopqrstuvwxyz0123456", aliceMeta);
    }

    function test_RegisterUsername_RevertWhen_InvalidChars() public {
        vm.prank(alice);
        vm.expectRevert(ArcyRegistry.UsernameInvalidChars.selector);
        registry.registerUsername("Alice", aliceMeta);
    }

    function test_RegisterUsername_RevertWhen_LeadingHyphen() public {
        vm.prank(alice);
        vm.expectRevert(ArcyRegistry.UsernameInvalidChars.selector);
        registry.registerUsername("-alice", aliceMeta);
    }

    function test_RegisterUsername_RevertWhen_TrailingHyphen() public {
        vm.prank(alice);
        vm.expectRevert(ArcyRegistry.UsernameInvalidChars.selector);
        registry.registerUsername("alice-", aliceMeta);
    }

    function test_RegisterUsername_RevertWhen_MetaAddressWrongLength() public {
        vm.prank(alice);
        vm.expectRevert(ArcyRegistry.InvalidStealthMetaAddress.selector);
        registry.registerUsername("alice", hex"1234");
    }

    function test_RegisterUsername_RevertWhen_SpendingKeyPrefixInvalid() public {
        vm.prank(alice);
        vm.expectRevert(ArcyRegistry.InvalidStealthMetaAddress.selector);
        registry.registerUsername("alice", _metaAddress(0x04, 0x03, 0));
    }

    function test_RegisterUsername_RevertWhen_ViewingKeyPrefixInvalid() public {
        vm.prank(alice);
        vm.expectRevert(ArcyRegistry.InvalidStealthMetaAddress.selector);
        registry.registerUsername("alice", _metaAddress(0x02, 0x05, 0));
    }

    function test_RegisterUsername_RevertWhen_PaddingNotEmpty() public {
        bytes memory meta = _metaAddress(0x02, 0x03, 0);
        meta[100] = 0x01;

        vm.prank(alice);
        vm.expectRevert(ArcyRegistry.InvalidStealthMetaAddress.selector);
        registry.registerUsername("alice", meta);
    }

    function test_RegisterUsername_RevertWhen_VersionUnsupported() public {
        vm.prank(alice);
        vm.expectRevert(ArcyRegistry.InvalidStealthMetaAddress.selector);
        registry.registerUsername("alice", _metaAddress(0x02, 0x03, 1));
    }

    function test_RegisterUsername_RevertWhen_Taken() public {
        vm.prank(alice);
        registry.registerUsername("alice", aliceMeta);

        vm.prank(bob);
        vm.expectRevert(ArcyRegistry.UsernameAlreadyTaken.selector);
        registry.registerUsername("alice", bobMeta);
    }

    function test_RegisterUsername_RevertWhen_CallerAlreadyRegistered() public {
        vm.startPrank(alice);
        registry.registerUsername("alice", aliceMeta);
        vm.expectRevert(ArcyRegistry.AddressAlreadyHasUsername.selector);
        registry.registerUsername("alice2", aliceMeta);
        vm.stopPrank();
    }

    function test_UpdateStealthMetaAddress() public {
        vm.startPrank(alice);
        registry.registerUsername("alice", aliceMeta);

        vm.expectEmit(true, false, false, true, address(registry));
        emit StealthMetaAddressUpdated(alice, bobMeta);
        registry.updateStealthMetaAddress(bobMeta);
        vm.stopPrank();

        assertEq(registry.getStealthMetaAddress("alice"), bobMeta);
    }

    function test_UpdateStealthMetaAddress_RevertWhen_NotRegistered() public {
        vm.prank(bob);
        vm.expectRevert(ArcyRegistry.NotUsernameOwner.selector);
        registry.updateStealthMetaAddress(bobMeta);
    }

    function test_ReleaseUsername() public {
        vm.startPrank(alice);
        registry.registerUsername("alice", aliceMeta);

        vm.expectEmit(true, false, false, true, address(registry));
        emit UsernameReleased(alice, "alice");
        registry.releaseUsername();
        vm.stopPrank();

        assertEq(registry.getOwner("alice"), address(0));
        assertEq(registry.getUsername(alice), "");
        assertTrue(registry.isUsernameAvailable("alice"));
    }

    function test_ReleaseUsername_RevertWhen_NotRegistered() public {
        vm.prank(bob);
        vm.expectRevert(ArcyRegistry.NotUsernameOwner.selector);
        registry.releaseUsername();
    }

    function test_GetStealthMetaAddress_RevertWhen_Unknown() public {
        vm.expectRevert(ArcyRegistry.UsernameNotFound.selector);
        registry.getStealthMetaAddress("nobody");
    }

    function test_IsUsernameAvailable() public {
        assertTrue(registry.isUsernameAvailable("alice"));
        assertFalse(registry.isUsernameAvailable("Alice"));
        assertFalse(registry.isUsernameAvailable(""));
        assertFalse(registry.isUsernameAvailable("-alice"));

        vm.prank(alice);
        registry.registerUsername("alice", aliceMeta);
        assertFalse(registry.isUsernameAvailable("alice"));
    }

    function test_UsernameWithHyphenAndDigitsIsValid() public {
        vm.prank(alice);
        registry.registerUsername("alice-01", aliceMeta);
        assertEq(registry.getOwner("alice-01"), alice);
    }

    function test_TransferUsername() public {
        vm.prank(alice);
        registry.registerUsername("alice", aliceMeta);

        vm.expectEmit(true, false, false, true, address(registry));
        emit UsernameTransferStarted(alice, "alice", bob);

        vm.prank(alice);
        registry.transferUsername(bob);
        assertEq(registry.getPendingOwner("alice"), bob);

        vm.expectEmit(true, true, false, true, address(registry));
        emit UsernameTransferred(alice, bob, "alice");

        vm.prank(bob);
        registry.acceptUsername("alice");

        assertEq(registry.getOwner("alice"), bob);
        assertEq(registry.getUsername(bob), "alice");
        assertEq(registry.getUsername(alice), "");
        assertEq(registry.getPendingOwner("alice"), address(0));
    }

    function test_TransferUsername_RevertWhen_NotOwner() public {
        vm.prank(alice);
        registry.registerUsername("alice", aliceMeta);

        vm.prank(bob);
        vm.expectRevert(ArcyRegistry.NotUsernameOwner.selector);
        registry.transferUsername(carol);
    }

    function test_TransferUsername_RevertWhen_ZeroAddress() public {
        vm.prank(alice);
        registry.registerUsername("alice", aliceMeta);

        vm.prank(alice);
        vm.expectRevert(ArcyRegistry.ZeroAddress.selector);
        registry.transferUsername(address(0));
    }

    function test_TransferUsername_RevertWhen_Self() public {
        vm.prank(alice);
        registry.registerUsername("alice", aliceMeta);

        vm.prank(alice);
        vm.expectRevert(ArcyRegistry.SelfTransfer.selector);
        registry.transferUsername(alice);
    }

    function test_AcceptUsername_RevertWhen_NoPendingTransfer() public {
        vm.prank(alice);
        registry.registerUsername("alice", aliceMeta);

        vm.prank(bob);
        vm.expectRevert(ArcyRegistry.NoPendingTransfer.selector);
        registry.acceptUsername("alice");
    }

    function test_AcceptUsername_RevertWhen_RecipientAlreadyRegistered() public {
        vm.prank(alice);
        registry.registerUsername("alice", aliceMeta);
        vm.prank(bob);
        registry.registerUsername("bob", bobMeta);

        vm.prank(alice);
        registry.transferUsername(bob);

        vm.prank(bob);
        vm.expectRevert(ArcyRegistry.AddressAlreadyHasUsername.selector);
        registry.acceptUsername("alice");
    }

    function test_CancelTransfer() public {
        vm.startPrank(alice);
        registry.registerUsername("alice", aliceMeta);
        registry.transferUsername(bob);

        vm.expectEmit(true, false, false, true, address(registry));
        emit UsernameTransferCancelled(alice, "alice");
        registry.cancelUsernameTransfer();
        vm.stopPrank();

        assertEq(registry.getPendingOwner("alice"), address(0));
    }

    function test_AcceptUsername_RevertWhen_UsernameReleased() public {
        vm.prank(alice);
        registry.registerUsername("alice", aliceMeta);
        vm.prank(alice);
        registry.transferUsername(bob);
        vm.prank(alice);
        registry.releaseUsername();

        vm.prank(bob);
        vm.expectRevert(ArcyRegistry.UsernameNotFound.selector);
        registry.acceptUsername("alice");
    }

    function test_TransferUsername_OverwritesPending() public {
        vm.startPrank(alice);
        registry.registerUsername("alice", aliceMeta);
        registry.transferUsername(bob);
        registry.transferUsername(carol);
        vm.stopPrank();

        assertEq(registry.getPendingOwner("alice"), carol);

        vm.prank(bob);
        vm.expectRevert(ArcyRegistry.NoPendingTransfer.selector);
        registry.acceptUsername("alice");

        vm.prank(carol);
        registry.acceptUsername("alice");
        assertEq(registry.getOwner("alice"), carol);
    }

    function test_ReleaseClearsPendingTransfer() public {
        vm.startPrank(alice);
        registry.registerUsername("alice", aliceMeta);
        registry.transferUsername(bob);
        registry.releaseUsername();
        vm.stopPrank();

        assertEq(registry.getPendingOwner("alice"), address(0));
    }

    function _metaAddress(bytes1 spendingPrefix, bytes1 viewingPrefix, uint8 version)
        internal
        pure
        returns (bytes memory meta)
    {
        meta = new bytes(132);
        meta[0] = spendingPrefix;
        meta[33] = viewingPrefix;
        meta[131] = bytes1(version);
    }
}
