// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ArcyRegistry {
    error UsernameAlreadyTaken();
    error UsernameTooShort();
    error UsernameTooLong();
    error UsernameInvalidChars();
    error AddressAlreadyHasUsername();
    error UsernameNotFound();
    error InvalidStealthMetaAddress();
    error NotUsernameOwner();
    error ZeroAddress();
    error NoPendingTransfer();
    error SelfTransfer();

    event UsernameRegistered(address indexed owner, string username, bytes stealthMetaAddress);
    event StealthMetaAddressUpdated(address indexed owner, bytes stealthMetaAddress);
    event UsernameReleased(address indexed owner, string username);
    event UsernameTransferStarted(address indexed owner, string username, address indexed pendingOwner);
    event UsernameTransferCancelled(address indexed owner, string username);
    event UsernameTransferred(address indexed from, address indexed to, string username);

    mapping(bytes32 usernameHash => address owner) private _ownerByUsernameHash;
    mapping(bytes32 usernameHash => bytes stealthMetaAddress) private _stealthMetaAddressByUsernameHash;
    mapping(bytes32 usernameHash => address pendingOwner) private _pendingOwnerByUsernameHash;
    mapping(address owner => string username) private _usernameByOwner;

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

    function updateStealthMetaAddress(bytes calldata stealthMetaAddress) external {
        _validateStealthMetaAddress(stealthMetaAddress);

        bytes32 usernameHash = _usernameHashOf(msg.sender);

        _stealthMetaAddressByUsernameHash[usernameHash] = stealthMetaAddress;

        emit StealthMetaAddressUpdated(msg.sender, stealthMetaAddress);
    }

    function releaseUsername() external {
        bytes32 usernameHash = _usernameHashOf(msg.sender);
        string memory username = _usernameByOwner[msg.sender];

        delete _ownerByUsernameHash[usernameHash];
        delete _stealthMetaAddressByUsernameHash[usernameHash];
        delete _pendingOwnerByUsernameHash[usernameHash];
        delete _usernameByOwner[msg.sender];

        emit UsernameReleased(msg.sender, username);
    }

    function transferUsername(address newOwner) external {
        if (newOwner == address(0)) revert ZeroAddress();
        if (newOwner == msg.sender) revert SelfTransfer();

        bytes32 usernameHash = _usernameHashOf(msg.sender);

        _pendingOwnerByUsernameHash[usernameHash] = newOwner;

        emit UsernameTransferStarted(msg.sender, _usernameByOwner[msg.sender], newOwner);
    }

    function cancelUsernameTransfer() external {
        bytes32 usernameHash = _usernameHashOf(msg.sender);

        delete _pendingOwnerByUsernameHash[usernameHash];

        emit UsernameTransferCancelled(msg.sender, _usernameByOwner[msg.sender]);
    }

    function acceptUsername(string calldata username) external {
        bytes32 usernameHash = keccak256(bytes(username));

        if (_ownerByUsernameHash[usernameHash] == address(0)) revert UsernameNotFound();
        if (_pendingOwnerByUsernameHash[usernameHash] != msg.sender) revert NoPendingTransfer();
        if (bytes(_usernameByOwner[msg.sender]).length != 0) revert AddressAlreadyHasUsername();

        address previousOwner = _ownerByUsernameHash[usernameHash];

        delete _usernameByOwner[previousOwner];
        _usernameByOwner[msg.sender] = username;
        _ownerByUsernameHash[usernameHash] = msg.sender;
        delete _pendingOwnerByUsernameHash[usernameHash];

        emit UsernameTransferred(previousOwner, msg.sender, username);
    }

    function getStealthMetaAddress(string calldata username) external view returns (bytes memory) {
        bytes32 usernameHash = keccak256(bytes(username));
        if (_ownerByUsernameHash[usernameHash] == address(0)) revert UsernameNotFound();
        return _stealthMetaAddressByUsernameHash[usernameHash];
    }

    function getUsername(address owner) external view returns (string memory) {
        return _usernameByOwner[owner];
    }

    function getOwner(string calldata username) external view returns (address) {
        return _ownerByUsernameHash[keccak256(bytes(username))];
    }

    function getPendingOwner(string calldata username) external view returns (address) {
        return _pendingOwnerByUsernameHash[keccak256(bytes(username))];
    }

    function isUsernameAvailable(string calldata username) external view returns (bool) {
        if (!_isValidUsername(username)) return false;
        return _ownerByUsernameHash[keccak256(bytes(username))] == address(0);
    }

    function _usernameHashOf(address owner) private view returns (bytes32) {
        string memory username = _usernameByOwner[owner];
        if (bytes(username).length == 0) revert NotUsernameOwner();

        bytes32 usernameHash = keccak256(bytes(username));
        if (_ownerByUsernameHash[usernameHash] != owner) revert NotUsernameOwner();
        return usernameHash;
    }

    function _validateStealthMetaAddress(bytes calldata stealthMetaAddress) private pure {
        if (stealthMetaAddress.length != 132) revert InvalidStealthMetaAddress();
        if (!_isCompressedKeyPrefix(stealthMetaAddress[0])) revert InvalidStealthMetaAddress();
        if (!_isCompressedKeyPrefix(stealthMetaAddress[33])) revert InvalidStealthMetaAddress();

        for (uint256 i = 66; i < 131; i++) {
            if (stealthMetaAddress[i] != 0) revert InvalidStealthMetaAddress();
        }

        uint8 version = uint8(stealthMetaAddress[131]);
        if (version != 0 && version != 2) revert InvalidStealthMetaAddress();
    }

    function _validateUsername(string calldata username) private pure {
        uint256 length = bytes(username).length;
        if (length == 0) revert UsernameTooShort();
        if (length > 32) revert UsernameTooLong();
        if (!_isValidUsername(username)) revert UsernameInvalidChars();
    }

    function _isValidUsername(string calldata username) private pure returns (bool) {
        bytes calldata nameBytes = bytes(username);
        uint256 length = nameBytes.length;

        if (length == 0 || length > 32) return false;

        for (uint256 i = 0; i < length; i++) {
            bytes1 char = nameBytes[i];
            bool isLowercaseLetter = char >= 0x61 && char <= 0x7A;
            bool isDigit = char >= 0x30 && char <= 0x39;
            bool isHyphen = char == 0x2D;

            if (!(isLowercaseLetter || isDigit || isHyphen)) return false;
            if (isHyphen && (i == 0 || i == length - 1)) return false;
        }

        return true;
    }

    function _isCompressedKeyPrefix(bytes1 prefix) private pure returns (bool) {
        return prefix == 0x02 || prefix == 0x03;
    }
}
