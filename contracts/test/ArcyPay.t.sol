// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ArcyRegistry} from "../../contracts/ArcyRegistry.sol";
import {ArcyAnnouncer} from "../../contracts/ArcyAnnouncer.sol";
import {ArcyPay} from "../../contracts/ArcyPay.sol";

interface IERC20Like {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
}

interface IERC20PermitLike {
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

contract ArcyPayTest is Test {
    address internal constant USDC = 0x3600000000000000000000000000000000000000;

    ArcyRegistry internal registry;
    ArcyAnnouncer internal announcer;
    ArcyPay internal pay;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal stealth = makeAddr("stealth");

    bytes internal aliceMeta;
    bytes internal ephemeralPubKey;

    event PaymentSent(address indexed sender, address indexed stealthAddress, uint256 amount);
    event Announcement(
        uint256 indexed schemeId,
        address indexed stealthAddress,
        address indexed caller,
        bytes ephemeralPubKey,
        bytes1 viewTag
    );

    function setUp() public {
        registry = new ArcyRegistry();
        announcer = new ArcyAnnouncer();
        pay = new ArcyPay(address(registry), address(announcer));

        aliceMeta = _metaAddress();
        ephemeralPubKey = _ephemeralPubKey();

        vm.prank(alice);
        registry.registerUsername("alice", aliceMeta);
    }

    function test_Constructor_RevertWhen_ZeroRegistry() public {
        vm.expectRevert(ArcyPay.ZeroAddress.selector);
        new ArcyPay(address(0), address(announcer));
    }

    function test_Constructor_RevertWhen_ZeroAnnouncer() public {
        vm.expectRevert(ArcyPay.ZeroAddress.selector);
        new ArcyPay(address(registry), address(0));
    }

    function test_PayByUsername() public {
        uint256 amount = 1_000_000;
        vm.mockCall(
            USDC,
            abi.encodeWithSelector(IERC20Like.transferFrom.selector, bob, stealth, amount),
            abi.encode(true)
        );

        vm.expectEmit(true, true, false, true, address(announcer));
        emit Announcement(1, stealth, address(pay), ephemeralPubKey, 0xab);

        vm.expectEmit(true, true, false, true, address(pay));
        emit PaymentSent(bob, stealth, amount);

        vm.prank(bob);
        pay.payByUsername("alice", stealth, amount, ephemeralPubKey, 0xab);
    }

    function test_PayByUsername_RevertWhen_ZeroAmount() public {
        vm.prank(bob);
        vm.expectRevert(ArcyPay.ZeroAmount.selector);
        pay.payByUsername("alice", stealth, 0, ephemeralPubKey, 0xab);
    }

    function test_PayByUsername_RevertWhen_ZeroStealthAddress() public {
        vm.prank(bob);
        vm.expectRevert(ArcyPay.ZeroAddress.selector);
        pay.payByUsername("alice", address(0), 1, ephemeralPubKey, 0xab);
    }

    function test_PayByUsername_RevertWhen_UsernameUnknown() public {
        vm.prank(bob);
        vm.expectRevert(ArcyRegistry.UsernameNotFound.selector);
        pay.payByUsername("nobody", stealth, 1, ephemeralPubKey, 0xab);
    }

    function test_PayByUsername_RevertWhen_TransferFails() public {
        vm.mockCall(
            USDC,
            abi.encodeWithSelector(IERC20Like.transferFrom.selector, bob, stealth, 1),
            abi.encode(false)
        );

        vm.prank(bob);
        vm.expectRevert(ArcyPay.TransferFailed.selector);
        pay.payByUsername("alice", stealth, 1, ephemeralPubKey, 0xab);
    }

    function test_PayByUsernameWithPermit() public {
        uint256 amount = 2_000_000;

        vm.mockCall(USDC, abi.encodeWithSelector(IERC20PermitLike.permit.selector), "");
        vm.mockCall(
            USDC,
            abi.encodeWithSelector(IERC20Like.transferFrom.selector, bob, stealth, amount),
            abi.encode(true)
        );

        vm.prank(bob);
        pay.payByUsernameWithPermit(
            "alice",
            stealth,
            amount,
            ephemeralPubKey,
            0xcd,
            block.timestamp + 1 hours,
            27,
            bytes32(uint256(1)),
            bytes32(uint256(2))
        );
    }

    function test_PayByUsernameWithPermit_ToleratesConsumedPermit() public {
        uint256 amount = 2_000_000;

        vm.mockCallRevert(
            USDC,
            abi.encodeWithSelector(IERC20PermitLike.permit.selector),
            abi.encodeWithSignature("Error(string)", "invalid signature")
        );
        vm.mockCall(
            USDC,
            abi.encodeWithSelector(IERC20Like.allowance.selector, bob, address(pay)),
            abi.encode(amount)
        );
        vm.mockCall(
            USDC,
            abi.encodeWithSelector(IERC20Like.transferFrom.selector, bob, stealth, amount),
            abi.encode(true)
        );

        vm.prank(bob);
        pay.payByUsernameWithPermit(
            "alice",
            stealth,
            amount,
            ephemeralPubKey,
            0xcd,
            block.timestamp + 1 hours,
            27,
            bytes32(uint256(1)),
            bytes32(uint256(2))
        );
    }

    function test_PayByUsernameWithPermit_RevertWhen_PermitFailsAndNoAllowance() public {
        uint256 amount = 2_000_000;

        vm.mockCallRevert(
            USDC,
            abi.encodeWithSelector(IERC20PermitLike.permit.selector),
            abi.encodeWithSignature("Error(string)", "invalid signature")
        );
        vm.mockCall(
            USDC,
            abi.encodeWithSelector(IERC20Like.allowance.selector, bob, address(pay)),
            abi.encode(0)
        );

        vm.prank(bob);
        vm.expectRevert(ArcyPay.PermitFailed.selector);
        pay.payByUsernameWithPermit(
            "alice",
            stealth,
            amount,
            ephemeralPubKey,
            0xcd,
            block.timestamp + 1 hours,
            27,
            bytes32(uint256(1)),
            bytes32(uint256(2))
        );
    }

    function test_PayByUsernameWithPermit_RevertWhen_ZeroAmount() public {
        vm.prank(bob);
        vm.expectRevert(ArcyPay.ZeroAmount.selector);
        pay.payByUsernameWithPermit("alice", stealth, 0, ephemeralPubKey, 0xcd, 0, 27, 0, 0);
    }

    function _metaAddress() internal pure returns (bytes memory meta) {
        meta = new bytes(132);
        meta[0] = 0x02;
        meta[33] = 0x03;
    }

    function _ephemeralPubKey() internal pure returns (bytes memory pubKey) {
        pubKey = new bytes(33);
        pubKey[0] = 0x02;
    }
}
