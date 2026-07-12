/**
 * Backend REST API Server
 *
 * Phase 3: Database Integration Layer
 *
 * This Node.js Express server:
 * 1. Interfaces with the simulated university student database (SQLite)
 * 2. Verifies student enrollment status
 * 3. Generates Groth16 zk-SNARK proofs of eligibility using snarkjs
 * 4. Manages DID-to-student mappings
 * 5. Provides endpoints for the React frontend
 */

const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");
const path = require("path");
const snarkjs = require("snarkjs");
const { ethers } = require("ethers");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3002;

// -------------------------------------------------------
// Middleware
// -------------------------------------------------------
app.use(cors());
app.use(express.json());

// -------------------------------------------------------
// Database
// -------------------------------------------------------
const DB_PATH = path.join(__dirname, "university.db");
let db;

try {
  db = new Database(DB_PATH, { readonly: false });
  db.pragma("journal_mode = WAL");
} catch (err) {
  console.error("Database not found. Run 'node seed.js' first.");
  process.exit(1);
}

// -------------------------------------------------------
// ZKP Paths
// -------------------------------------------------------
const CIRCUITS_BUILD = path.join(__dirname, "../circuits/build");
const WASM_PATH = path.join(CIRCUITS_BUILD, "eligibility_js/eligibility.wasm");
const ZKEY_PATH = path.join(CIRCUITS_BUILD, "eligibility_final.zkey");
const VKEY_PATH = path.join(CIRCUITS_BUILD, "verification_key.json");

// -------------------------------------------------------
// Lazy-loaded Poseidon
// -------------------------------------------------------
let poseidon = null;

async function getPoseidon() {
  if (!poseidon) {
    const { buildPoseidon } = require("circomlibjs");
    poseidon = await buildPoseidon();
  }
  return poseidon;
}

// -------------------------------------------------------
// Helper Functions
// -------------------------------------------------------

/**
 * Convert a matriculation number string to a numeric field element
 * by hashing it. This ensures consistent conversion regardless of format.
 */
function matricToFieldElement(matricNumber) {
  const hash = ethers.keccak256(ethers.toUtf8Bytes(matricNumber));
  // Take the first 31 bytes to ensure it fits in the BN128 field
  const truncated = hash.slice(0, 64); // 0x + 62 hex chars = 31 bytes
  return BigInt(truncated);
}

// -------------------------------------------------------
// API Endpoints
// -------------------------------------------------------

/**
 * GET /api/health
 * Health check endpoint
 */
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

/**
 * GET /api/students
 * List all students (for admin dashboard)
 */
app.get("/api/students", (req, res) => {
  const students = db
    .prepare(
      "SELECT matric_number, full_name, department_id, department_name, faculty, level, enrollment_status FROM students"
    )
    .all();
  res.json({ students });
});

/**
 * POST /api/enroll
 * Enroll a student: receives enrollment commitment from the Raspberry Pi kiosk
 * and stores the DID mapping.
 *
 * Body: { matricNumber: string, enrollmentCommitment: string }
 */
app.post("/api/enroll", async (req, res) => {
  try {
    const { matricNumber, enrollmentCommitment } = req.body;
    if (!matricNumber || !enrollmentCommitment) {
      return res.status(400).json({ error: "matricNumber and enrollmentCommitment are required" });
    }

    // Check student exists and is active
    const student = db
      .prepare(
        "SELECT * FROM students WHERE matric_number = ? AND enrollment_status = 'ACTIVE'"
      )
      .get(matricNumber);

    if (!student) {
      return res.status(404).json({
        error: "Student not found or not actively enrolled",
      });
    }

    // Check if already enrolled
    const existing = db
      .prepare("SELECT * FROM did_mappings WHERE matric_number = ?")
      .get(matricNumber);

    if (existing) {
      return res.json({
        message: "Student already enrolled",
        enrollmentCommitment: existing.enrollment_commitment,
      });
    }

    // Store mapping
    db.prepare(
      `INSERT INTO did_mappings (matric_number, enrollment_commitment)
       VALUES (?, ?)`
    ).run(
      matricNumber,
      enrollmentCommitment
    );

    res.json({
      message: "Student enrolled successfully",
      student: {
        name: student.full_name,
        department: student.department_name,
        level: student.level,
      },
      enrollmentCommitment,
    });
  } catch (err) {
    console.error("Enrollment error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/verify
 * Returns voter data so the Raspberry Pi kiosk can generate the zk-SNARK proof locally.
 *
 * Body: { matricNumber: string, electionId: number }
 *
 * Returns: { eligible, didHash, enrollmentCommitment, nullifierHash, student }
 */
app.post("/api/verify", async (req, res) => {
  try {
    const { matricNumber, electionId } = req.body;
    if (!matricNumber || !electionId) {
      return res
        .status(400)
        .json({ error: "matricNumber and electionId are required" });
    }

    // Check student exists and is active
    const student = db
      .prepare(
        "SELECT * FROM students WHERE matric_number = ? AND enrollment_status = 'ACTIVE'"
      )
      .get(matricNumber);

    if (!student) {
      return res.status(403).json({
        error: "Student not found or not actively enrolled",
        eligible: false,
      });
    }

    // Get DID mapping
    const mapping = db
      .prepare("SELECT * FROM did_mappings WHERE matric_number = ?")
      .get(matricNumber);

    if (!mapping) {
      return res.status(400).json({
        error: "Student not enrolled in the voting system. Run /api/enroll first.",
      });
    }

    const p = await getPoseidon();

    // Reconstruct the public inputs for verification
    const matricField = matricToFieldElement(matricNumber);
    const elId = BigInt(electionId);

    // Compute nullifier hash
    const nullifierRaw = p([matricField, elId]);
    const nullifierHash = p.F.toString(nullifierRaw);

    res.json({
      eligible: true,
      enrollmentCommitment: mapping.enrollment_commitment,
      nullifierHash,
      student: {
        name: student.full_name,
        department: student.department_name,
        departmentId: student.department_id,
      },
    });
  } catch (err) {
    console.error("Verification error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/election/:id
 * Get election details
 */
app.get("/api/election/:id", (req, res) => {
  const election = db
    .prepare("SELECT * FROM elections WHERE election_id = ?")
    .get(req.params.id);

  if (!election) {
    return res.status(404).json({ error: "Election not found" });
  }

  res.json({ election });
});

/**
 * GET /api/enrollment-commitments
 * Get all enrollment commitments (for admin to register on-chain)
 */
app.get("/api/enrollment-commitments", (req, res) => {
  const mappings = db
    .prepare("SELECT matric_number, enrollment_commitment FROM did_mappings")
    .all();
  res.json({ commitments: mappings });
});

// -------------------------------------------------------
// Relayer Voting Endpoint (Gasless UX)
// -------------------------------------------------------
app.post("/api/relay-vote", async (req, res) => {
  try {
    const { ephemeralDid, candidateIds, calldataStr } = req.body;
    if (!ephemeralDid || !candidateIds || !Array.isArray(candidateIds) || !calldataStr) {
      return res.status(400).json({ error: "Missing or invalid required parameters" });
    }

    const deployment = JSON.parse(fs.readFileSync(path.join(__dirname, "../deployment.json"), "utf8"));
    const eligibilityAbi = JSON.parse(fs.readFileSync(path.join(__dirname, "../artifacts/contracts/VoterEligibility.sol/VoterEligibility.json"), "utf8")).abi;
    const votingAbi = JSON.parse(fs.readFileSync(path.join(__dirname, "../artifacts/contracts/Voting.sol/Voting.json"), "utf8")).abi;

    const rpcUrl = process.env.SEPOLIA_RPC_URL || "http://127.0.0.1:8545";
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    let signer;
    if (process.env.PRIVATE_KEY) {
      signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    } else {
      signer = await provider.getSigner(0);
    }

    const eligibility = new ethers.Contract(deployment.contracts.VoterEligibility, eligibilityAbi, signer);
    const voting = new ethers.Contract(deployment.contracts.Voting, votingAbi, signer);

    const bytes32Did = ephemeralDid.startsWith("0x")
      ? ethers.zeroPadValue(ethers.toBeHex(BigInt(ephemeralDid)), 32)
      : ethers.zeroPadValue(ethers.toBeHex(BigInt("0x" + ephemeralDid)), 32);

    const currentElectionId = await voting.electionId();
    const isElig = await eligibility.isEligible(currentElectionId, bytes32Did);

    if (!isElig) {
      const args = new Function(`return [${calldataStr}]`)();
      const [pA, pB, pC, pubSignals] = args;
      
      const verifyTx = await eligibility.verifyAndRegister(pA, pB, pC, pubSignals);
      await verifyTx.wait();
    }

    const voteTx = await voting.castVote(bytes32Did, candidateIds);
    await voteTx.wait();

    res.json({ success: true, txHash: voteTx.hash });
  } catch (err) {
    console.error("Relay Vote Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------
// Admin Relayer Endpoints (Protected by ADMIN_SECRET_KEY)
// -------------------------------------------------------
const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || "1234";

function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${ADMIN_SECRET_KEY}`) {
    return res.status(401).json({ error: "Unauthorized. Invalid Admin PIN." });
  }
  next();
}

async function getAdminSigner() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL || "http://127.0.0.1:8545";
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  if (process.env.PRIVATE_KEY) {
    return new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  }
  return await provider.getSigner(0);
}

function getContracts(signer) {
  const deployment = JSON.parse(fs.readFileSync(path.join(__dirname, "../deployment.json"), "utf8"));
  const votingAbi = JSON.parse(fs.readFileSync(path.join(__dirname, "../artifacts/contracts/Voting.sol/Voting.json"), "utf8")).abi;
  const eligAbi = JSON.parse(fs.readFileSync(path.join(__dirname, "../artifacts/contracts/VoterEligibility.sol/VoterEligibility.json"), "utf8")).abi;
  
  return {
    voting: new ethers.Contract(deployment.contracts.Voting, votingAbi, signer),
    eligibility: new ethers.Contract(deployment.contracts.VoterEligibility, eligAbi, signer)
  };
}

app.post("/api/relay/admin/end-election", requireAdminAuth, async (req, res) => {
  try {
    const signer = await getAdminSigner();
    const { voting } = getContracts(signer);
    const tx = await voting.endElection();
    await tx.wait();
    res.json({ success: true, txHash: tx.hash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/relay/admin/sync-commitments", requireAdminAuth, async (req, res) => {
  try {
    const { commitments } = req.body;
    const signer = await getAdminSigner();
    const { eligibility } = getContracts(signer);
    const tx = await eligibility.addEnrollmentCommitments(commitments);
    await tx.wait();
    res.json({ success: true, txHash: tx.hash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/relay/admin/create-election", requireAdminAuth, async (req, res) => {
  try {
    const { electionId, title, now, endTime } = req.body;
    const signer = await getAdminSigner();
    const { voting, eligibility } = getContracts(signer);
    
    // First eligibility
    let tx = await eligibility.createElection(electionId);
    await tx.wait();
    
    // Then voting
    tx = await voting.initializeElection(electionId, title, now, endTime);
    await tx.wait();
    
    res.json({ success: true, txHash: tx.hash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/relay/admin/add-candidate", requireAdminAuth, async (req, res) => {
  try {
    const { candidateId, name, party, post } = req.body;
    const signer = await getAdminSigner();
    const { voting } = getContracts(signer);
    const tx = await voting.addCandidate(candidateId, name, party, post);
    await tx.wait();
    res.json({ success: true, txHash: tx.hash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------
// Revoke Enrollment Endpoint
// -------------------------------------------------------
app.post("/api/relay/admin/revoke-commitment", requireAdminAuth, async (req, res) => {
  try {
    const { matricNumber } = req.body;
    
    // Find the commitment in the database
    const mapping = db.prepare("SELECT enrollment_commitment FROM did_mappings WHERE matric_number = ?").get(matricNumber);
    if (!mapping) {
      return res.status(404).json({ error: "Student not enrolled" });
    }
    
    // Revoke on-chain
    const commitmentBytes32 = ethers.zeroPadValue(ethers.toBeHex(BigInt(mapping.enrollment_commitment)), 32);
    const signer = await getAdminSigner();
    const { eligibility } = getContracts(signer);
    
    const tx = await eligibility.revokeEnrollmentCommitment(commitmentBytes32);
    await tx.wait();
    
    // Update local database
    db.prepare("UPDATE students SET enrollment_status = 'SUSPENDED' WHERE matric_number = ?").run(matricNumber);
    db.prepare("DELETE FROM did_mappings WHERE matric_number = ?").run(matricNumber);
    
    res.json({ success: true, txHash: tx.hash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------
// Start Server
// -------------------------------------------------------
app.listen(PORT, () => {
  console.log(`\n=== University Voting API Server ===`);
  console.log(`Listening on http://localhost:${PORT}`);
  console.log(`Database: ${DB_PATH}`);
  console.log(`ZKP artifacts: ${CIRCUITS_BUILD}`);
  console.log(`\nEndpoints:`);
  console.log(`  GET  /api/health`);
  console.log(`  GET  /api/students`);
  console.log(`  POST /api/enroll     { matricNumber, enrollmentCommitment }`);
  console.log(`  POST /api/verify     { matricNumber, electionId }`);
  console.log(`  GET  /api/election/:id`);
  console.log(`  GET  /api/enrollment-commitments`);
});
