// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./VoterEligibility.sol";

/**
 * @title Voting
 * @author Katoh Thesis Project
 * @notice Core election contract that manages candidates, enforces one-vote-per-DID,
 *         and provides public self-tallying.
 * @dev This contract supports multiple elections. Data is mapped by electionId.
 */
contract Voting {
    // -------------------------------------------------------
    // State
    // -------------------------------------------------------

    address public admin;
    VoterEligibility public eligibilityContract;

    uint256 public electionId;
    bool public electionActive;
    bool private _locked;

    struct Candidate {
        uint256 id;
        string name;
        string party;
        uint256 voteCount;
        bool exists;
    }

    // Mappings mapped by electionId
    mapping(uint256 => mapping(uint256 => Candidate)) public candidates;
    mapping(uint256 => uint256[]) public candidateIds;
    mapping(uint256 => uint256) public candidateCount;
    mapping(uint256 => mapping(bytes32 => bool)) public hasVoted;
    mapping(uint256 => uint256) public totalVotesCast;

    uint256 public electionStart;
    uint256 public electionEnd;

    // -------------------------------------------------------
    // Events
    // -------------------------------------------------------

    event ElectionInitialized(uint256 indexed electionId, uint256 startTime, uint256 endTime);
    event CandidateAdded(uint256 indexed electionId, uint256 indexed candidateId, string name, string party);
    event VoteCast(uint256 indexed electionId, bytes32 indexed didHash, uint256 indexed candidateId);
    event ElectionEnded(uint256 indexed electionId, uint256 totalVotes);

    // -------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------

    modifier onlyAdmin() {
        require(msg.sender == admin, "Voting: caller is not admin");
        _;
    }

    modifier whenElectionActive() {
        require(electionActive, "Voting: election is not active");
        require(block.timestamp >= electionStart, "Voting: election has not started");
        require(block.timestamp <= electionEnd, "Voting: election has ended");
        _;
    }

    modifier nonReentrant() {
        require(!_locked, "Voting: re-entrant call");
        _locked = true;
        _;
        _locked = false;
    }

    // -------------------------------------------------------
    // Constructor
    // -------------------------------------------------------

    constructor(address _eligibilityContract) {
        admin = msg.sender;
        eligibilityContract = VoterEligibility(_eligibilityContract);
    }

    // -------------------------------------------------------
    // Admin Functions
    // -------------------------------------------------------

    function initializeElection(uint256 _electionId, uint256 _startTime, uint256 _endTime) external onlyAdmin {
        require(!electionActive, "Voting: election already active");
        require(_startTime < _endTime, "Voting: invalid time window");
        require(_electionId == eligibilityContract.currentElectionId(), "Voting: election ID mismatch");

        electionId = _electionId;
        electionStart = _startTime;
        electionEnd = _endTime;
        electionActive = true;

        emit ElectionInitialized(_electionId, _startTime, _endTime);
    }

    function addCandidate(uint256 _candidateId, string calldata _name, string calldata _party) external onlyAdmin {
        require(!candidates[electionId][_candidateId].exists, "Voting: candidate already exists");

        candidates[electionId][_candidateId] = Candidate({
            id: _candidateId,
            name: _name,
            party: _party,
            voteCount: 0,
            exists: true
        });
        candidateIds[electionId].push(_candidateId);
        candidateCount[electionId]++;

        emit CandidateAdded(electionId, _candidateId, _name, _party);
    }

    function endElection() external onlyAdmin {
        require(electionActive, "Voting: no active election");
        electionActive = false;
        emit ElectionEnded(electionId, totalVotesCast[electionId]);
    }

    // -------------------------------------------------------
    // Voting
    // -------------------------------------------------------

    function castVote(bytes32 _didHash, uint256 _candidateId) external whenElectionActive nonReentrant {
        require(eligibilityContract.isEligible(electionId, _didHash), "Voting: voter is not eligible");
        require(!hasVoted[electionId][_didHash], "Voting: already voted");
        require(candidates[electionId][_candidateId].exists, "Voting: candidate does not exist");

        hasVoted[electionId][_didHash] = true;
        candidates[electionId][_candidateId].voteCount++;
        totalVotesCast[electionId]++;

        emit VoteCast(electionId, _didHash, _candidateId);
    }

    // -------------------------------------------------------
    // Public Self-Tallying
    // -------------------------------------------------------

    function getCandidate(uint256 _electionId, uint256 _candidateId) external view returns (string memory name, string memory party, uint256 voteCount) {
        require(candidates[_electionId][_candidateId].exists, "Voting: candidate does not exist");
        Candidate storage c = candidates[_electionId][_candidateId];
        return (c.name, c.party, c.voteCount);
    }

    function getResults(uint256 _electionId) external view returns (uint256[] memory ids, string[] memory names, string[] memory parties, uint256[] memory voteCounts) {
        uint256 len = candidateIds[_electionId].length;
        ids = new uint256[](len);
        names = new string[](len);
        parties = new string[](len);
        voteCounts = new uint256[](len);

        for (uint256 i = 0; i < len; i++) {
            Candidate storage c = candidates[_electionId][candidateIds[_electionId][i]];
            ids[i] = c.id;
            names[i] = c.name;
            parties[i] = c.party;
            voteCounts[i] = c.voteCount;
        }
    }

    function getWinner(uint256 _electionId) external view returns (uint256 winnerId, string memory winnerName, uint256 winnerVotes) {
        require(candidateIds[_electionId].length > 0, "Voting: no candidates");

        uint256 maxVotes = 0;
        uint256 winIdx = 0;

        for (uint256 i = 0; i < candidateIds[_electionId].length; i++) {
            if (candidates[_electionId][candidateIds[_electionId][i]].voteCount > maxVotes) {
                maxVotes = candidates[_electionId][candidateIds[_electionId][i]].voteCount;
                winIdx = i;
            }
        }

        Candidate storage w = candidates[_electionId][candidateIds[_electionId][winIdx]];
        return (w.id, w.name, w.voteCount);
    }

    function hasVoterVoted(uint256 _electionId, bytes32 _didHash) external view returns (bool) {
        return hasVoted[_electionId][_didHash];
    }
}
