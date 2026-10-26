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

/// @title ArcyPay
/// @notice Atomic USDC transfer + ERC-5564-style announcement helper.
/// @dev The caller must compute the stealth address off-chain using ERC-5564 SECP256k1 scheme.
/// The contract trusts the provided stealthAddress but records the ephemeralPubKey so the recipient can verify it.
contract ArcyPay {
    error ZeroAmount();
    error ZeroAddress();
    error TransferFailed();

    address internal constant USDC = 0x3600000000000000000000000000000000000000;

    IArcyRegistry public immutable registry;
    IArcyAnnouncer public immutable announcer;

    event PaymentSent(address indexed sender, address indexed stealthAddress, uint256 amount);

    /// @notice Initializes the payment router with registry and announcer dependencies.
    /// @param registry_ Address of the ArcyRegistry contract.
    /// @param announcer_ Address of the ArcyAnnouncer contract.
    constructor(address registry_, address announcer_) {
        if (registry_ == address(0) || announcer_ == address(0)) {
            revert ZeroAddress();
        }

        registry = IArcyRegistry(registry_);
        announcer = IArcyAnnouncer(announcer_);
    }

    /// @notice Pays a recipient in USDC and emits an announcement for stealth payment discovery.
    /// @dev The caller must compute `stealthAddress` off-chain using the recipient's stealth meta-address.
    /// This contract does not verify the derivation; it only enforces username registration and records metadata.
    /// The recipient username is used only to resolve the stealth meta-address off-chain; it is NOT recorded in any on-chain event, preserving recipient privacy.
    /// @param recipientUsername Registered recipient username in ArcyRegistry.
    /// @param stealthAddress Caller-provided derived stealth recipient address.
    /// @param amount USDC amount to transfer.
    /// @param ephemeralPubKey Compressed ephemeral secp256k1 public key (33 bytes).
    /// @param viewTag 1-byte ERC-5564 view tag.
    function payByUsername(
        string calldata recipientUsername,
        address stealthAddress,
        uint256 amount,
        bytes calldata ephemeralPubKey,
        bytes1 viewTag
    ) external {
        if (amount == 0) {
            revert ZeroAmount();
        }
        if (stealthAddress == address(0)) {
            revert ZeroAddress();
        }

        registry.getStealthMetaAddress(recipientUsername);

        bool success = IERC20(USDC).transferFrom(msg.sender, stealthAddress, amount);
        if (!success) {
            revert TransferFailed();
        }

        announcer.announce(1, stealthAddress, ephemeralPubKey, viewTag);

        emit PaymentSent(msg.sender, stealthAddress, amount);
    }

    /// @notice Pays a recipient using an EIP-2612 permit signature — no prior approve tx needed.
    /// @dev The caller signs a permit off-chain; this function calls permit() then transferFrom()
    /// in a single transaction. The username is used only to verify registration and is never emitted.
    /// @param recipientUsername Registered recipient username in ArcyRegistry.
    /// @param stealthAddress Caller-provided derived stealth recipient address.
    /// @param amount USDC amount to transfer.
    /// @param ephemeralPubKey Compressed ephemeral secp256k1 public key (33 bytes).
    /// @param viewTag 1-byte ERC-5564 view tag.
    /// @param deadline Permit expiry timestamp.
    /// @param v Permit signature v.
    /// @param r Permit signature r.
    /// @param s Permit signature s.
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

        // Verify username is registered
        registry.getStealthMetaAddress(recipientUsername);

        // Gasless approve via permit
        IERC20Permit(USDC).permit(msg.sender, address(this), amount, deadline, v, r, s);

        // Transfer USDC to stealth address
        bool success = IERC20(USDC).transferFrom(msg.sender, stealthAddress, amount);
        if (!success) revert TransferFailed();

        // Announce for recipient scanning
        announcer.announce(1, stealthAddress, ephemeralPubKey, viewTag);

        emit PaymentSent(msg.sender, stealthAddress, amount);
    }
}
