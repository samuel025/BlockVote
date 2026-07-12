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
 * STRICT MODE: Fails immediately if the physical hardware bridge is not running.
 */
export async function scanFingerprint(matricNumber) {
  try {
    console.log("Attempting to connect to hardware bridge at http://127.0.0.1:5000/scan...");
    const response = await fetch("http://127.0.0.1:5000/scan", {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(60000) // Wait up to 60 seconds for a physical scan
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.secret) {
        console.log("Hardware scan successful!");
        // Hash the secret returned from the sensor to generate a ZK-compatible field element
        const hash = ethers.keccak256(ethers.toUtf8Bytes(data.secret));
        return BigInt(hash.slice(0, 64)).toString();
      } else {
        throw new Error(data.error || "Hardware returned invalid data");
      }
    } else {
      throw new Error(`Hardware Bridge returned HTTP ${response.status}`);
    }
  } catch (err) {
    console.error("Hardware connection failed:", err);
    throw new Error("HARDWARE DISCONNECTED: Could not reach the fingerprint scanner on the Raspberry Pi. Ensure bridge.py is running.");
  }
}
