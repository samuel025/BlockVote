import { ethers } from "ethers";
import { buildPoseidon } from "circomlibjs";

let poseidon = null;

export async function getPoseidon() {
  if (!poseidon) {
    poseidon = await buildPoseidon();
  }
  return poseidon;
}

export function matricToFieldElement(matricNumber) {
  const hash = ethers.keccak256(ethers.toUtf8Bytes(matricNumber));
  const truncated = hash.slice(0, 64);
  return BigInt(truncated);
}

async function callHardwareBridge(endpoint) {
  try {
    console.log(`Attempting to connect to hardware bridge at http://127.0.0.1:5000/${endpoint}...`);
    const response = await fetch(`http://127.0.0.1:5000/${endpoint}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(60000) // Wait up to 60 seconds
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.secret) {
        console.log("Hardware scan successful!");
        const hash = ethers.keccak256(ethers.toUtf8Bytes(data.secret));
        return BigInt(hash.slice(0, 64)).toString();
      } else {
        throw new Error(data.error || "Hardware returned invalid data");
      }
    } else {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Hardware Bridge returned HTTP ${response.status}`);
    }
  } catch (err) {
    console.error(`Hardware connection failed for /${endpoint}:`, err);
    throw new Error(err.message || "HARDWARE DISCONNECTED: Could not reach the fingerprint scanner on the Raspberry Pi.");
  }
}

/**
 * Called during Enrollment.
 * Tells the Pi to scan the finger TWICE and save it to the sensor.
 * Uses a callback to update the React UI on progress.
 */
export async function enrollFingerprint(matricNumber, onProgress) {
  // Step 1: Wait for first finger placement
  onProgress("Place finger on scanner...");
  const step1Response = await fetch("http://127.0.0.1:5000/enroll/step1", {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(60000)
  });
  
  if (!step1Response.ok) throw new Error("Hardware Bridge step 1 failed");
  const step1Data = await step1Response.json();
  if (!step1Data.success) throw new Error(step1Data.error || "Step 1 failed");

  // Step 2: Wait for removal and second placement
  onProgress("Remove finger, then place it again...");
  const step2Response = await fetch("http://127.0.0.1:5000/enroll/step2", {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(60000)
  });

  if (!step2Response.ok) throw new Error("Hardware Bridge step 2 failed");
  const step2Data = await step2Response.json();
  if (!step2Data.success) throw new Error(step2Data.error || "Step 2 failed");

  onProgress("Enrollment complete! Generating ZK Identity...");
  const hash = ethers.keccak256(ethers.toUtf8Bytes(step2Data.secret));
  return BigInt(hash.slice(0, 64)).toString();
}

/**
 * Called during Voting.
 * Tells the Pi to scan the finger ONCE and search the sensor for a match.
 */
export async function verifyFingerprint(matricNumber) {
  return await callHardwareBridge("verify");
}
