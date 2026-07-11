pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

/*
 * EligibilityProof Circuit (Groth16 zk-SNARK)
 *
 * Purpose: Proves a student is enrolled at the university without revealing
 * their personal academic data on-chain.
 *
 * How it works:
 *   - The university computes a Poseidon hash commitment of each student's
 *     (matricNumber, departmentId, enrollmentSecret). This commitment is
 *     stored publicly on-chain or provided to the verifier contract.
 *   - The student (prover) supplies these values as private inputs.
 *   - The circuit hashes them and checks the result matches the public
 *     commitment, proving the student possesses valid enrollment data.
 *   - A nullifier (derived from matricNumber + electionId) prevents
 *     double-registration for a single election.
 *
 * Public Inputs:
 *   - enrollmentCommitment: The Poseidon hash of the student's enrollment data
 *   - nullifierHash: Hash of (matricNumber, electionId) to prevent double-voting
 *   - electionId: The identifier for the current election
 *
 * Private Inputs:
 *   - matricNumber: The student's matriculation number (as a field element)
 *   - departmentId: The student's department identifier
 *   - enrollmentSecret: A secret issued during enrollment (stored on USB token chip)
 */
template EligibilityProof() {
    // Private inputs (known only to the student / USB token)
    signal input matricNumber;
    signal input departmentId;
    signal input enrollmentSecret;

    // Public inputs (known to the verifier contract)
    signal input enrollmentCommitment;
    signal input nullifierHash;
    signal input electionId;
    signal input ephemeralDid;

    // -------------------------------------------------------
    // Step 1: Verify the enrollment commitment
    // Hash(matricNumber, departmentId, enrollmentSecret) == enrollmentCommitment
    // -------------------------------------------------------
    component enrollmentHasher = Poseidon(3);
    enrollmentHasher.inputs[0] <== matricNumber;
    enrollmentHasher.inputs[1] <== departmentId;
    enrollmentHasher.inputs[2] <== enrollmentSecret;

    // Constrain: the computed hash must equal the public commitment
    enrollmentHasher.out === enrollmentCommitment;

    // -------------------------------------------------------
    // Step 2: Compute the nullifier
    // Hash(matricNumber, electionId) == nullifierHash
    // This ensures each student can only register once per election
    // -------------------------------------------------------
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== matricNumber;
    nullifierHasher.inputs[1] <== electionId;

    // Constrain: the computed nullifier must match the public nullifier hash
    nullifierHasher.out === nullifierHash;
    // -------------------------------------------------------
    // Step 3: Bind Ephemeral DID
    // -------------------------------------------------------
    // We add a dummy constraint to ensure the compiler doesn't optimize away
    // the ephemeralDid. This forces the generated verifier smart contract to 
    // include it in the public signals, binding the proof to this specific DID.
    signal dummy;
    dummy <== ephemeralDid * ephemeralDid;
}

component main {public [enrollmentCommitment, nullifierHash, electionId, ephemeralDid]} = EligibilityProof();
