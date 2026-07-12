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
 * Connects to the local Raspberry Pi hardware bridge (bridge.py)
 * If the hardware script is not running, falls back to the deterministic mock.
 */
export async function scanFingerprint(matricNumber) {
  try {
    // 1. Try to talk to the physical JM-101 fingerprint sensor via the local Python bridge
    console.log("Attempting to connect to hardware bridge at http://127.0.0.1:5000/scan...");
    const response = await fetch("http://127.0.0.1:5000/scan", {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(3000) // Don't wait forever if script isn't running
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.secret) {
        console.log("Hardware scan successful!");
        // Hash the secret returned from the sensor to generate a ZK-compatible field element
        const hash = ethers.keccak256(ethers.toUtf8Bytes(data.secret));
        return BigInt(hash.slice(0, 64)).toString();
      }
    }
  } catch (err) {
    console.warn("Hardware bridge not detected on localhost:5000. Falling back to software simulation.");
    alert("DEVELOPER WARNING:\nCould not connect to the physical fingerprint scanner on the Raspberry Pi (Hardware Bridge not running).\n\nFalling back to software simulation.");
  }

  // 2. Fallback: Software simulation for testing on your laptop without the Pi connected
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const hash = ethers.keccak256(ethers.toUtf8Bytes("BIOMETRIC_TEMPLATE:" + matricNumber));
  return BigInt(hash.slice(0, 64)).toString();
}
