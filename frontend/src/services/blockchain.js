/**
 * Blockchain Service Layer
 * Handles all Ethereum / smart-contract interactions
 */

import { ethers } from "ethers";
import { DEPLOYMENT, VOTING_ABI, ELIGIBILITY_ABI } from "../config/deployment";

let provider = null;
let votingContract = null;
let eligibilityContract = null;

/**
 * Get or initialize the JSON-RPC provider (read-only)
 */
export function getProvider() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(DEPLOYMENT.rpcUrl);
  }
  return provider;
}

/**
 * Get a signer from the Hardhat node (account[0] = admin)
 */
export async function getSigner() {
  const p = getProvider();
  return p.getSigner(0);
}

/**
 * Get the Voting contract instance (read-only)
 */
export function getVotingContract() {
  if (!votingContract) {
    votingContract = new ethers.Contract(
      DEPLOYMENT.contracts.Voting,
      VOTING_ABI,
      getProvider()
    );
  }
  return votingContract;
}

/**
 * Get the VoterEligibility contract instance (read-only)
 */
export function getEligibilityContract() {
  if (!eligibilityContract) {
    eligibilityContract = new ethers.Contract(
      DEPLOYMENT.contracts.VoterEligibility,
      ELIGIBILITY_ABI,
      getProvider()
    );
  }
  return eligibilityContract;
}

/**
 * Get the current active election ID
 */
export async function getCurrentElectionId() {
  const voting = getVotingContract();
  return Number(await voting.electionId());
}

/**
 * Read on-chain election results
 */
export async function fetchOnChainResults(electionId) {
  const voting = getVotingContract();
  const [ids, names, parties, posts, voteCounts] = await voting.getResults(electionId);
  return ids.map((id, i) => ({
    id: Number(id),
    name: names[i],
    party: parties[i],
    post: posts[i],
    voteCount: Number(voteCounts[i]),
  }));
}

/**
 * Read total votes cast
 */
export async function fetchTotalVotes(electionId) {
  const voting = getVotingContract();
  return Number(await voting.totalVotesCast(electionId));
}

/**
 * Check if election is currently active on-chain
 */
export async function isElectionActive() {
  const voting = getVotingContract();
  return voting.electionActive();
}

/**
 * Get election time window
 */
export async function getElectionTimes() {
  const voting = getVotingContract();
  const [start, end] = await Promise.all([
    voting.electionStart(),
    voting.electionEnd(),
  ]);
  return { start: Number(start), end: Number(end) };
}

/**
 * Check if a DID has already voted
 */
export async function hasVoted(electionId, didHash) {
  const voting = getVotingContract();
  const bytes32 = didHash.startsWith("0x")
    ? ethers.zeroPadValue(ethers.toBeHex(BigInt(didHash.replace("0x", ""), 16)), 32)
    : ethers.zeroPadValue(ethers.toBeHex(BigInt(didHash)), 32);
  return voting.hasVoterVoted(electionId, bytes32);
}

/**
 * Cast a vote on-chain via admin signer
 * This handles BOTH the ZKP verification and the voting transaction.
 */
export async function castVoteOnChain(didHash, candidateIds, calldataStr) {
  // Option B: Gasless Backend Relayer
  // We send the vote payload to the backend, which pays the gas and signs the transaction.
  const response = await fetch(`${DEPLOYMENT.apiUrl}/api/relay-vote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ didHash, candidateIds, calldataStr })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to relay vote transaction");
  }

  const data = await response.json();
  return { tx: { hash: data.txHash }, receipt: { status: 1 } };
}

/**
 * Get eligible voter count
 */
export async function getEligibleVoterCount() {
  const eligibility = getEligibilityContract();
  return Number(await eligibility.eligibleVoterCount());
}
