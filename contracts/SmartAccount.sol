// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title VoterSmartAccount
 * @author Katoh Thesis Project
 * @notice A minimal ERC-4337-style Smart Account for student voters.
 * @dev Each student gets a Smart Account deployed/resolved from their DID.
 *      The account:
 *      - Is controlled by the student's DID (derived from biometric + matric number)
 *      - Can execute calls to the Voting contract
 *      - Does not require the student to hold private keys or ETH
 *
 *      This is a simplified implementation for the thesis prototype.
 */
contract VoterSmartAccount is Ownable {
    /// @notice The DID hash associated with this account
    bytes32 public didHash;

    /// @notice Whether this account has been initialized
    bool public initialized;

    // -------------------------------------------------------
    // Events
    // -------------------------------------------------------

    event AccountInitialized(bytes32 indexed didHash, address indexed owner);
    event Executed(address indexed target, uint256 value, bytes data);

    // -------------------------------------------------------
    // Constructor
    // -------------------------------------------------------

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Initialize the smart account with a DID hash
     * @param _didHash The Poseidon hash of the student's DID
     * @param _owner The address that controls this account (set by the system)
     */
    function initialize(bytes32 _didHash, address _owner) external {
        require(!initialized, "VoterSmartAccount: already initialized");
        initialized = true;
        didHash = _didHash;
        _transferOwnership(_owner);
        emit AccountInitialized(_didHash, _owner);
    }

    /**
     * @notice Execute a call to another contract (e.g., Voting.castVote)
     * @param target The contract to call
     * @param value ETH value to send (usually 0 for voting)
     * @param data The calldata (e.g., castVote encoded)
     */
    function execute(
        address target,
        uint256 value,
        bytes calldata data
    ) external onlyOwner returns (bytes memory) {
        (bool success, bytes memory result) = target.call{value: value}(data);
        require(success, "VoterSmartAccount: execution failed");
        emit Executed(target, value, data);
        return result;
    }

    /// @notice Allow the account to receive ETH
    receive() external payable {}
}

/**
 * @title SmartAccountFactory
 * @author Katoh Thesis Project
 * @notice Factory contract that deterministically deploys VoterSmartAccount
 *         instances based on DID hashes.
 * @dev Uses CREATE2 for deterministic addresses — given the same DID hash,
 *      the same Smart Account address is always computed.
 */
contract SmartAccountFactory {
    /// @notice Mapping from DID hash to deployed Smart Account address
    mapping(bytes32 => address) public accounts;

    /// @notice Total accounts created
    uint256 public accountCount;

    // -------------------------------------------------------
    // Events
    // -------------------------------------------------------

    event AccountCreated(bytes32 indexed didHash, address indexed account);

    // -------------------------------------------------------
    // Factory Functions
    // -------------------------------------------------------

    /**
     * @notice Deploy or retrieve a Smart Account for a given DID hash
     * @param _didHash The DID hash to associate with the account
     * @param _owner The address that will control the account
     * @return account The address of the Smart Account
     */
    function getOrCreateAccount(
        bytes32 _didHash,
        address _owner
    ) external returns (address account) {
        // If account already exists, return it
        if (accounts[_didHash] != address(0)) {
            return accounts[_didHash];
        }

        // Deploy a new Smart Account using CREATE2 for deterministic addressing
        bytes32 salt = _didHash;
        VoterSmartAccount newAccount = new VoterSmartAccount{salt: salt}();
        newAccount.initialize(_didHash, _owner);

        accounts[_didHash] = address(newAccount);
        accountCount++;

        emit AccountCreated(_didHash, address(newAccount));
        return address(newAccount);
    }

    /**
     * @notice Compute the deterministic address of a Smart Account without deploying
     * @param _didHash The DID hash to compute the address for
     * @return The predicted address
     */
    function computeAddress(bytes32 _didHash) external view returns (address) {
        bytes32 salt = _didHash;
        bytes memory bytecode = type(VoterSmartAccount).creationCode;
        bytes32 hash = keccak256(
            abi.encodePacked(bytes1(0xff), address(this), salt, keccak256(bytecode))
        );
        return address(uint160(uint256(hash)));
    }
}
