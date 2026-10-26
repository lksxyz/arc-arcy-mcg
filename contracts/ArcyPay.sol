// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
}

interface IERC20Permit {
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

interface IArcyRegistry {
    function getStealthMetaAddress(string calldata username) external view returns (bytes memory);
}

interface IArcyAnnouncer {
    function announce(
        uint256 schemeId,
        address stealthAddress,
        bytes calldata ephemeralPubKey,
        bytes1 viewTag
    ) external;
}

contract ArcyPay {
    error ZeroAmount();
    error ZeroAddress();
    error TransferFailed();
    error PermitFailed();

    address internal constant USDC = 0x3600000000000000000000000000000000000000;

    IArcyRegistry public immutable registry;
    IArcyAnnouncer public immutable announcer;

    event PaymentSent(address indexed sender, address indexed stealthAddress, uint256 amount);

    constructor(address registry_, address announcer_) {
        if (registry_ == address(0) || announcer_ == address(0)) {
            revert ZeroAddress();
        }

        registry = IArcyRegistry(registry_);
        announcer = IArcyAnnouncer(announcer_);
    }

    function payByUsername(
        string calldata recipientUsername,
        address stealthAddress,
        uint256 amount,
        bytes calldata ephemeralPubKey,
        bytes1 viewTag
    ) external {
        if (amount == 0) revert ZeroAmount();
        if (stealthAddress == address(0)) revert ZeroAddress();

        registry.getStealthMetaAddress(recipientUsername);

        bool success = IERC20(USDC).transferFrom(msg.sender, stealthAddress, amount);
        if (!success) revert TransferFailed();

        announcer.announce(1, stealthAddress, ephemeralPubKey, viewTag);

        emit PaymentSent(msg.sender, stealthAddress, amount);
    }

    function payByUsernameWithPermit(
        string calldata recipientUsername,
        address stealthAddress,
        uint256 amount,
        bytes calldata ephemeralPubKey,
        bytes1 viewTag,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        if (amount == 0) revert ZeroAmount();
        if (stealthAddress == address(0)) revert ZeroAddress();

        registry.getStealthMetaAddress(recipientUsername);

        try IERC20Permit(USDC).permit(msg.sender, address(this), amount, deadline, v, r, s) {}
        catch {
            if (IERC20(USDC).allowance(msg.sender, address(this)) < amount) revert PermitFailed();
        }

        bool success = IERC20(USDC).transferFrom(msg.sender, stealthAddress, amount);
        if (!success) revert TransferFailed();

        announcer.announce(1, stealthAddress, ephemeralPubKey, viewTag);

        emit PaymentSent(msg.sender, stealthAddress, amount);
    }
}
