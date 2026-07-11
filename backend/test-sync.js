require("dotenv").config({ path: "../.env" });
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

async function run() {
  const deployment = JSON.parse(fs.readFileSync("../deployment.json", "utf8"));
  const eligAbi = JSON.parse(fs.readFileSync("../artifacts/contracts/VoterEligibility.sol/VoterEligibility.json", "utf8")).abi;
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const eligibility = new ethers.Contract(deployment.contracts.VoterEligibility, eligAbi, signer);

  const db = require("better-sqlite3")("university.db");
  const mappings = db.prepare("SELECT enrollment_commitment FROM did_mappings").all();
  
  const commitments = mappings.map(c => {
    return c.enrollment_commitment.startsWith("0x") ? c.enrollment_commitment : ethers.toBeHex(BigInt(c.enrollment_commitment), 32);
  });

  console.log("Syncing commitments:", commitments);
  try {
    const tx = await eligibility.addEnrollmentCommitments(commitments);
    console.log("Tx sent:", tx.hash);
    await tx.wait();
    console.log("Tx mined!");
  } catch(e) {
    console.error("Error:", e);
  }
}
run();
