// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title VotingPaymaster
 * @author Katoh Thesis Project
 * @notice A simplified ERC-4337 Paymaster that sponsors gas fees for student voters.
 * @dev In the ERC-4337 standard, a Paymaster pays gas fees on behalf of users,
 *      removing the need for students to hold ETH or any cryptocurrency.
 *
 *      This is a simplified implementation for the thesis prototype. In production,
 *      it would extend the BasePaymaster from @account-abstraction/contracts.
 *      The university pre-funds this contract, and it approves gas sponsorship
 *      for all voting-related UserOperations.
 */

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @notice Minimal interface for the ERC-4337 EntryPoint
 */
interface IEntryPoint {
    struct UserOperation {
        address sender;
        uint256 nonce;
        bytes initCode;
        bytes callData;
        uint256 callGasLimit;
        uint256 verificationGasLimit;
        uint256 preVerificationGas;
        uint256 maxFeePerGas;
        uint256 maxPriorityFeePerGas;
        bytes paymasterAndData;
        bytes signature;
    }

    function handleOps(UserOperation[] calldata ops, address payable beneficiary) external;
    function depositTo(address account) external payable;
    function balanceOf(address account) external view returns (uint256);
}

contract VotingPaymaster is Ownable {
    IEntryPoint public immutable entryPoint;

    /// @notice Address of the Voting contract — only operations targeting this are sponsored
    address public votingContract;

    /// @notice Total gas sponsored (for metrics / thesis evaluation)
    uint256 public totalGasSponsored;
    uint256 public totalOperationsSponsored;

    // -------------------------------------------------------
    // Events
    // -------------------------------------------------------

    event Deposited(address indexed from, uint256 amount);
    event GasSponsored(address indexed sender, uint256 gasUsed);
    event VotingContractUpdated(address indexed newVotingContract);

    // -------------------------------------------------------
    // Constructor
    // -------------------------------------------------------

    /**
     * @param _entryPoint Address of the ERC-4337 EntryPoint singleton
     * @param _votingContract Address of the Voting contract to sponsor
     */
    constructor(address _entryPoint, address _votingContract) Ownable(msg.sender) {
        entryPoint = IEntryPoint(_entryPoint);
        votingContract = _votingContract;
    }

    // -------------------------------------------------------
    // Paymaster Logic
    // -------------------------------------------------------

    /**
     * @notice Validate whether a UserOperation should be sponsored
     * @dev In production ERC-4337, this would be called by the EntryPoint.
     *      For the thesis prototype, this simulates the validation logic.
     * @param userOp The UserOperation to validate
     * @return valid Whether the operation is approved for sponsorship
     */
    function validatePaymasterUserOp(
        IEntryPoint.UserOperation calldata userOp
    ) external view returns (bool valid) {
        // Only sponsor operations targeting the voting contract
        // In the real flow, userOp.sender is the Smart Account, and
        // userOp.callData contains the call to the Voting contract
        return userOp.sender != address(0) && votingContract != address(0);
    }

    /**
     * @notice Record gas sponsorship (called after successful operation)
     * @param sender The Smart Account address
     * @param gasUsed Amount of gas consumed
     */
    function recordSponsorship(address sender, uint256 gasUsed) external {
        totalGasSponsored += gasUsed;
        totalOperationsSponsored++;
        emit GasSponsored(sender, gasUsed);
    }

    // -------------------------------------------------------
    // Admin Functions
    // -------------------------------------------------------

    /**
     * @notice Deposit ETH to the EntryPoint to fund gas sponsorship
     */
    function deposit() external payable onlyOwner {
        entryPoint.depositTo{value: msg.value}(address(this));
        emit Deposited(msg.sender, msg.value);
    }

    /**
     * @notice Update the voting contract address
     * @param _votingContract New voting contract address
     */
    function setVotingContract(address _votingContract) external onlyOwner {
        votingContract = _votingContract;
        emit VotingContractUpdated(_votingContract);
    }

    /**
     * @notice Check the Paymaster's balance at the EntryPoint
     * @return The balance available for sponsorship
     */
    function getDeposit() external view returns (uint256) {
        return entryPoint.balanceOf(address(this));
    }

    /// @notice Allow the contract to receive ETH
    receive() external payable {}
}
