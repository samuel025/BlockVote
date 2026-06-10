#!/usr/bin/env node

/**
 * Trusted Setup & Verifier Generation Script
 *
 * This script:
 * 1. Compiles the eligibility.circom circuit
 * 2. Performs the Groth16 trusted setup (Powers of Tau + circuit-specific)
 * 3. Exports the Solidity verifier contract (Verifier.sol)
 * 4. Generates a test proof to validate the pipeline
 */

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const snarkjs = require("snarkjs");

const CIRCUITS_DIR = path.resolve(__dirname, "../circuits");
const CONTRACTS_DIR = path.resolve(__dirname, "../contracts");
const BUILD_DIR = path.resolve(CIRCUITS_DIR, "build");

async function main() {
  // Create build directory
  if (!fs.existsSync(BUILD_DIR)) {
    fs.mkdirSync(BUILD_DIR, { recursive: true });
  }

  console.log("=== Phase 1: ZKP Trusted Setup ===\n");

  // -------------------------------------------------------
  // Step 1: Compile the circom circuit
  // -------------------------------------------------------
  console.log("[1/5] Compiling eligibility.circom...");
  const circomPath = process.env.CIRCOM_PATH || "circom";
  execSync(
    `${circomPath} ${path.join(CIRCUITS_DIR, "eligibility.circom")} ` +
      `--r1cs --wasm --sym ` +
      `-o ${BUILD_DIR} ` +
      `-l ${path.resolve(__dirname, "../node_modules")}`,
    { stdio: "inherit" }
  );
  console.log("   ✓ Circuit compiled successfully.\n");

  // -------------------------------------------------------
  // Step 2: Powers of Tau ceremony (Phase 1)
  // -------------------------------------------------------
  console.log("[2/5] Starting Powers of Tau ceremony...");
  // 2^12 = 4096 constraints is more than enough for our circuit
  const bn128 = await snarkjs.curves.getCurveFromName("bn128");
  await snarkjs.powersOfTau.newAccumulator(
    bn128,
    12,
    path.join(BUILD_DIR, "pot12_0000.ptau")
  );
  await snarkjs.powersOfTau.contribute(
    path.join(BUILD_DIR, "pot12_0000.ptau"),
    path.join(BUILD_DIR, "pot12_0001.ptau"),
    "First contribution",
    "random-entropy-string-for-dev-" + Date.now()
  );
  await snarkjs.powersOfTau.preparePhase2(
    path.join(BUILD_DIR, "pot12_0001.ptau"),
    path.join(BUILD_DIR, "pot12_final.ptau")
  );
  console.log("   ✓ Powers of Tau ceremony complete.\n");

  // -------------------------------------------------------
  // Step 3: Circuit-specific setup (Phase 2)
  // -------------------------------------------------------
  console.log("[3/5] Generating circuit-specific proving and verifying keys...");
  await snarkjs.zKey.newZKey(
    path.join(BUILD_DIR, "eligibility.r1cs"),
    path.join(BUILD_DIR, "pot12_final.ptau"),
    path.join(BUILD_DIR, "eligibility_0000.zkey")
  );
  await snarkjs.zKey.contribute(
    path.join(BUILD_DIR, "eligibility_0000.zkey"),
    path.join(BUILD_DIR, "eligibility_final.zkey"),
    "Circuit contribution",
    "another-random-entropy-" + Date.now()
  );
  console.log("   ✓ Proving key (zkey) generated.\n");

  // Export the verification key (JSON)
  const vKey = await snarkjs.zKey.exportVerificationKey(
    path.join(BUILD_DIR, "eligibility_final.zkey")
  );
  fs.writeFileSync(
    path.join(BUILD_DIR, "verification_key.json"),
    JSON.stringify(vKey, null, 2)
  );
  console.log("   ✓ Verification key exported.\n");

  // -------------------------------------------------------
  // Step 4: Export the Solidity verifier contract
  // -------------------------------------------------------
  console.log("[4/5] Exporting Solidity verifier (Verifier.sol)...");
  const solidityVerifier = await snarkjs.zKey.exportSolidityVerifier(
    path.join(BUILD_DIR, "eligibility_final.zkey"),
    {
      groth16: fs.readFileSync(
        path.join(
          __dirname,
          "../node_modules/snarkjs/templates/verifier_groth16.sol.ejs"
        ),
        "utf-8"
      ),
    }
  );
  fs.writeFileSync(path.join(CONTRACTS_DIR, "Verifier.sol"), solidityVerifier);
  console.log(
    `   ✓ Verifier.sol written to ${path.join(CONTRACTS_DIR, "Verifier.sol")}\n`
  );

  // -------------------------------------------------------
  // Step 5: Generate a test proof to validate
  // -------------------------------------------------------
  console.log("[5/5] Generating test proof to validate pipeline...");

  // Build the Poseidon hash for test inputs using snarkjs internals
  const buildPoseidon = require("circomlibjs").buildPoseidon;
  const poseidon = await buildPoseidon();

  const testMatricNumber = BigInt("2021001234");
  const testDepartmentId = BigInt("42");
  const testEnrollmentSecret = BigInt(
    "98765432109876543210987654321098765432109876543210"
  );
  const testElectionId = BigInt("1");

  // Compute enrollment commitment: Poseidon(matricNumber, departmentId, enrollmentSecret)
  const enrollmentHash = poseidon([
    testMatricNumber,
    testDepartmentId,
    testEnrollmentSecret,
  ]);
  const enrollmentCommitment = poseidon.F.toString(enrollmentHash);

  // Compute nullifier hash: Poseidon(matricNumber, electionId)
  const nullifierRaw = poseidon([testMatricNumber, testElectionId]);
  const nullifierHash = poseidon.F.toString(nullifierRaw);

  const input = {
    matricNumber: testMatricNumber.toString(),
    departmentId: testDepartmentId.toString(),
    enrollmentSecret: testEnrollmentSecret.toString(),
    enrollmentCommitment: enrollmentCommitment,
    nullifierHash: nullifierHash,
    electionId: testElectionId.toString(),
  };

  fs.writeFileSync(
    path.join(BUILD_DIR, "test_input.json"),
    JSON.stringify(input, null, 2)
  );

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    path.join(BUILD_DIR, "eligibility_js/eligibility.wasm"),
    path.join(BUILD_DIR, "eligibility_final.zkey")
  );

  // Verify the proof
  const verified = await snarkjs.groth16.verify(vKey, publicSignals, proof);

  if (verified) {
    console.log("   ✓ Test proof generated and VERIFIED successfully!");
    console.log("   Public signals:", publicSignals);
  } else {
    console.error("   ✗ Test proof FAILED verification!");
    process.exit(1);
  }

  // Save proof and public signals for later use
  fs.writeFileSync(
    path.join(BUILD_DIR, "test_proof.json"),
    JSON.stringify(proof, null, 2)
  );
  fs.writeFileSync(
    path.join(BUILD_DIR, "test_public_signals.json"),
    JSON.stringify(publicSignals, null, 2)
  );

  console.log("\n=== Phase 1 Complete ===");
  console.log(`\nArtifacts in ${BUILD_DIR}:`);
  console.log("  - eligibility.r1cs (circuit constraints)");
  console.log("  - eligibility_js/ (WASM prover)");
  console.log("  - eligibility_final.zkey (proving key)");
  console.log("  - verification_key.json");
  console.log(`  - ${path.join(CONTRACTS_DIR, "Verifier.sol")} (on-chain verifier)`);
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
