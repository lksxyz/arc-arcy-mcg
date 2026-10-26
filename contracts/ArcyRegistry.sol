// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ArcyRegistry
/// @notice Permissionless username registry mapping usernames to wallet addresses and ERC-5564 stealth meta-addresses.
contract ArcyRegistry {
    error UsernameAlreadyTaken();
    error UsernameTooShort();
    error UsernameTooLong();
    error UsernameInvalidChars();
    error AddressAlreadyHasUsername();
    error UsernameNotFound();
    error InvalidStealthMetaAddress();
    error NotUsernameOwner();

    event UsernameRegistered(address indexed owner, string username, bytes stealthMetaAddress);
    event StealthMetaAddressUpdated(address indexed owner, bytes stealthMetaAddress);
    event UsernameReleased(address indexed owner, string username);

    mapping(bytes32 usernameHash => address owner) private _ownerByUsernameHash;
    mapping(bytes32 usernameHash => bytes stealthMetaAddress) private _stealthMetaAddressByUsernameHash;
    mapping(address owner => string username) private _usernameByOwner;

    /// @notice Registers a new username and stealth meta-address for the caller.
    /// @param username The lowercase alphanumeric username (hyphens allowed) to register.
    /// @param stealthMetaAddress The ERC-5564 stealth meta-address (132 bytes total).
    function registerUsername(string calldata username, bytes calldata stealthMetaAddress) external {
        _validateUsername(username);
        _validateStealthMetaAddress(stealthMetaAddress);

        if (bytes(_usernameByOwner[msg.sender]).length != 0) {
            revert AddressAlreadyHasUsername();
        }

        bytes32 usernameHash = keccak256(bytes(username));
        if (_ownerByUsernameHash[usernameHash] != address(0)) {
            revert UsernameAlreadyTaken();
        }

        _ownerByUsernameHash[usernameHash] = msg.sender;
        _stealthMetaAddressByUsernameHash[usernameHash] = stealthMetaAddress;
        _usernameByOwner[msg.sender] = username;

        emit UsernameRegistered(msg.sender, username, stealthMetaAddress);
    }

    /// @notice Updates the caller's registered stealth meta-address.
    /// @param stealthMetaAddress The new ERC-5564 stealth meta-address (132 bytes total).
    function updateStealthMetaAddress(bytes calldata stealthMetaAddress) external {
        _validateStealthMetaAddress(stealthMetaAddress);

        string memory username = _usernameByOwner[msg.sender];
        if (bytes(username).length == 0) {
            revert NotUsernameOwner();
        }

        bytes32 usernameHash = keccak256(bytes(username));
        if (_ownerByUsernameHash[usernameHash] != msg.sender) {
            revert NotUsernameOwner();
        }

        _stealthMetaAddressByUsernameHash[usernameHash] = stealthMetaAddress;

        emit StealthMetaAddressUpdated(msg.sender, stealthMetaAddress);
    }

    /// @notice Releases the caller's username, making it available for others to register.
    function releaseUsername() external {
        string memory username = _usernameByOwner[msg.sender];
        if (bytes(username).length == 0) {
            revert NotUsernameOwner();
        }

        bytes32 usernameHash = keccak256(bytes(username));
        if (_ownerByUsernameHash[usernameHash] != msg.sender) {
            revert NotUsernameOwner();
        }

        delete _ownerByUsernameHash[usernameHash];
        delete _stealthMetaAddressByUsernameHash[usernameHash];
        delete _usernameByOwner[msg.sender];

        emit UsernameReleased(msg.sender, username);
    }

    /// @notice Returns the registered stealth meta-address for a username.
    /// @param username The username to query.
    /// @return The associated stealth meta-address bytes.
    function getStealthMetaAddress(string calldata username) external view returns (bytes memory) {
        bytes32 usernameHash = keccak256(bytes(username));
        if (_ownerByUsernameHash[usernameHash] == address(0)) {
            revert UsernameNotFound();
        }

        return _stealthMetaAddressByUsernameHash[usernameHash];
    }

    /// @notice Returns the username registered to an owner address.
    /// @param owner The wallet address to query.
    /// @return The username, or an empty string if none is registered.
    function getUsername(address owner) external view returns (string memory) {
        return _usernameByOwner[owner];
    }

    /// @notice Returns the owner address for a username.
    /// @param username The username to query.
    /// @return The owner address, or address(0) if not registered.
    function getOwner(string calldata username) external view returns (address) {
        return _ownerByUsernameHash[keccak256(bytes(username))];
    }

    /// @notice Returns whether a username is available for registration.
    /// @param username The username to check.
    /// @return True if the username is valid and currently unregistered.
    function isUsernameAvailable(string calldata username) external view returns (bool) {
        if (!_isValidUsername(username)) {
            return false;
        }

        return _ownerByUsernameHash[keccak256(bytes(username))] == address(0);
    }

    function _validateStealthMetaAddress(bytes calldata stealthMetaAddress) private pure {
        if (stealthMetaAddress.length != 132) {
            revert InvalidStealthMetaAddress();
        }
    }

    function _validateUsername(string calldata username) private pure {
        uint256 length = bytes(username).length;
        if (length == 0) {
            revert UsernameTooShort();
        }
        if (length > 32) {
            revert UsernameTooLong();
        }

        if (!_isValidUsername(username)) {
            revert UsernameInvalidChars();
        }
    }

    function _isValidUsername(string calldata username) private pure returns (bool) {
        bytes calldata nameBytes = bytes(username);
        uint256 length = nameBytes.length;

        if (length == 0 || length > 32) {
            return false;
        }

        for (uint256 i = 0; i < length; i++) {
            bytes1 char = nameBytes[i];
            bool isLowercaseLetter = char >= 0x61 && char <= 0x7A;
            bool isDigit = char >= 0x30 && char <= 0x39;
            bool isHyphen = char == 0x2D;

            if (!(isLowercaseLetter || isDigit || isHyphen)) {
                return false;
            }
        }

        return true;
    }
}
