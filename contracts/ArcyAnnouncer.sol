// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ArcyAnnouncer
/// @notice ERC-5564-style announcement emitter for stealth payment discovery.
contract ArcyAnnouncer {
    error InvalidEphemeralPubKey();

    event Announcement(
        uint256 indexed schemeId,
        address indexed stealthAddress,
        address indexed caller,
        bytes ephemeralPubKey,
        bytes1 viewTag
    );

    event AnnouncementWithRecipient(
        uint256 indexed schemeId,
        address indexed stealthAddress,
        address indexed caller,
        bytes ephemeralPubKey,
        bytes1 viewTag,
        string recipientUsername
    );

    /// @notice Emits a stealth payment announcement event.
    /// @param schemeId The ERC-5564 scheme identifier.
    /// @param stealthAddress The generated stealth recipient address funded by the sender.
    /// @param ephemeralPubKey The compressed ephemeral secp256k1 public key (33 bytes).
    /// @param viewTag The 1-byte view tag used for efficient scanning.
    function announce(
        uint256 schemeId,
        address stealthAddress,
        bytes calldata ephemeralPubKey,
        bytes1 viewTag
    ) external {
        _validateEphemeralPubKey(ephemeralPubKey);

        emit Announcement(schemeId, stealthAddress, msg.sender, ephemeralPubKey, viewTag);
    }

    /// @notice Emits a stealth payment announcement event with recipient username context.
    /// @param schemeId The ERC-5564 scheme identifier.
    /// @param stealthAddress The generated stealth recipient address funded by the sender.
    /// @param ephemeralPubKey The compressed ephemeral secp256k1 public key (33 bytes).
    /// @param viewTag The 1-byte view tag used for efficient scanning.
    /// @param recipientUsername The intended recipient username for easier off-chain filtering.
    function announceWithRecipient(
        uint256 schemeId,
        address stealthAddress,
        bytes calldata ephemeralPubKey,
        bytes1 viewTag,
        string calldata recipientUsername
    ) external {
        _validateEphemeralPubKey(ephemeralPubKey);

        emit AnnouncementWithRecipient(
            schemeId,
            stealthAddress,
            msg.sender,
            ephemeralPubKey,
            viewTag,
            recipientUsername
        );
    }

    function _validateEphemeralPubKey(bytes calldata ephemeralPubKey) private pure {
        if (ephemeralPubKey.length != 33) {
            revert InvalidEphemeralPubKey();
        }
    }
}
