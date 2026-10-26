// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ArcyAnnouncer {
    error InvalidEphemeralPubKey();

    event Announcement(
        uint256 indexed schemeId,
        address indexed stealthAddress,
        address indexed caller,
        bytes ephemeralPubKey,
        bytes1 viewTag
    );

    function announce(
        uint256 schemeId,
        address stealthAddress,
        bytes calldata ephemeralPubKey,
        bytes1 viewTag
    ) external {
        _validateEphemeralPubKey(ephemeralPubKey);

        emit Announcement(schemeId, stealthAddress, msg.sender, ephemeralPubKey, viewTag);
    }

    function _validateEphemeralPubKey(bytes calldata ephemeralPubKey) private pure {
        if (ephemeralPubKey.length != 33) revert InvalidEphemeralPubKey();

        bytes1 prefix = ephemeralPubKey[0];
        if (prefix != 0x02 && prefix != 0x03) revert InvalidEphemeralPubKey();
    }
}
