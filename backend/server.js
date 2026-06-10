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

const app = express();
const PORT = process.env.PORT || 3001;

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

/**
 * Generate an enrollment secret for a student (deterministic for prototype)
 */
function generateEnrollmentSecret(matricNumber) {
  const hash = ethers.keccak256(
    ethers.toUtf8Bytes("ENROLLMENT_SECRET:" + matricNumber)
  );
  return BigInt(hash.slice(0, 64));
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
      "SELECT matric_number, full_name, department_name, faculty, level, enrollment_status FROM students"
    )
    .all();
  res.json({ students });
});

/**
 * POST /api/enroll
 * Enroll a student: generate DID, enrollment commitment, and store mapping.
 * This simulates the USB token enrollment process.
 *
 * Body: { matricNumber: string }
 */
app.post("/api/enroll", async (req, res) => {
  try {
    const { matricNumber } = req.body;
    if (!matricNumber) {
      return res.status(400).json({ error: "matricNumber is required" });
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
        didHash: existing.did_hash,
        enrollmentCommitment: existing.enrollment_commitment,
      });
    }

    const p = await getPoseidon();

    // Generate field elements
    const matricField = matricToFieldElement(matricNumber);
    const departmentId = BigInt(student.department_id);
    const enrollmentSecret = generateEnrollmentSecret(matricNumber);

    // Compute DID hash: Poseidon(matricField)
    const didRaw = p([matricField]);
    const didHash = p.F.toString(didRaw);

    // Compute enrollment commitment: Poseidon(matricField, departmentId, enrollmentSecret)
    const commitmentRaw = p([matricField, departmentId, enrollmentSecret]);
    const enrollmentCommitment = p.F.toString(commitmentRaw);

    // Store mapping
    db.prepare(
      `INSERT INTO did_mappings (matric_number, did_hash, enrollment_commitment, enrollment_secret)
       VALUES (?, ?, ?, ?)`
    ).run(
      matricNumber,
      didHash,
      enrollmentCommitment,
      enrollmentSecret.toString()
    );

    res.json({
      message: "Student enrolled successfully",
      student: {
        name: student.full_name,
        department: student.department_name,
        level: student.level,
      },
      didHash,
      enrollmentCommitment,
    });
  } catch (err) {
    console.error("Enrollment error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/verify
 * Verify a student's eligibility and generate a zk-SNARK proof.
 * This is the core endpoint called during the voting flow.
 *
 * Body: { matricNumber: string, electionId: number }
 *
 * Returns: { proof, publicSignals, didHash, calldata }
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

    // Reconstruct the private inputs
    const matricField = matricToFieldElement(matricNumber);
    const departmentId = BigInt(student.department_id);
    const enrollmentSecret = BigInt(mapping.enrollment_secret);
    const elId = BigInt(electionId);

    // Compute enrollment commitment
    const commitmentRaw = p([matricField, departmentId, enrollmentSecret]);
    const enrollmentCommitment = p.F.toString(commitmentRaw);

    // Compute nullifier hash
    const nullifierRaw = p([matricField, elId]);
    const nullifierHash = p.F.toString(nullifierRaw);

    // Build circuit input
    const circuitInput = {
      matricNumber: matricField.toString(),
      departmentId: departmentId.toString(),
      enrollmentSecret: enrollmentSecret.toString(),
      enrollmentCommitment: enrollmentCommitment,
      nullifierHash: nullifierHash,
      electionId: elId.toString(),
    };

    // Check if ZKP artifacts exist
    const fs = require("fs");
    if (!fs.existsSync(WASM_PATH) || !fs.existsSync(ZKEY_PATH)) {
      // Return the data without proof if ZKP not yet set up
      return res.json({
        eligible: true,
        didHash: mapping.did_hash,
        enrollmentCommitment,
        nullifierHash,
        zkpAvailable: false,
        message: "ZKP artifacts not available. Run setup-zkp.js first.",
        student: {
          name: student.full_name,
          department: student.department_name,
        },
      });
    }

    // Generate the Groth16 proof
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      circuitInput,
      WASM_PATH,
      ZKEY_PATH
    );

    // Generate Solidity calldata for on-chain verification
    const calldata = await snarkjs.groth16.exportSolidityCallData(
      proof,
      publicSignals
    );

    res.json({
      eligible: true,
      didHash: mapping.did_hash,
      enrollmentCommitment,
      nullifierHash,
      zkpAvailable: true,
      proof,
      publicSignals,
      calldata,
      student: {
        name: student.full_name,
        department: student.department_name,
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
    .prepare("SELECT matric_number, did_hash, enrollment_commitment FROM did_mappings")
    .all();
  res.json({ commitments: mappings });
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
  console.log(`  POST /api/enroll     { matricNumber }`);
  console.log(`  POST /api/verify     { matricNumber, electionId }`);
  console.log(`  GET  /api/election/:id`);
  console.log(`  GET  /api/enrollment-commitments`);
});
