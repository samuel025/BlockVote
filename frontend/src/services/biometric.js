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

/**
 * Mocks the Raspberry Pi Biometric Scanner
 * In the final hardware implementation, this would call a local Python server (e.g. localhost:5000/scan)
 * to get the hash of the scanned biometric data.
 */
export async function scanFingerprint(matricNumber) {
  // Simulate delay of a hardware scan
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // For the thesis prototype, we mock the biometric hash based on the matric number
  // so that the same student always produces the same biometric hash.
  const hash = ethers.keccak256(ethers.toUtf8Bytes("BIOMETRIC_TEMPLATE:" + matricNumber));
  
  // Truncate to 31 bytes to fit in BN128 field for snarkjs
  return BigInt(hash.slice(0, 64)).toString();
}
