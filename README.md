# UniVote

> **DID-Based Blockchain Voting System with Zero-Knowledge Proof Verification**

A university election platform combining Decentralized Identifiers (DIDs), Groth16 zk-SNARKs, and Ethereum smart contracts to achieve verifiable, privacy-preserving voting.

## 📖 Comprehensive Documentation

For an exhaustive, deep-dive technical guide covering the architecture, data flow, trust model, smart contracts, ZKP circuits, and the full step-by-step setup guide, please refer to the [**DOCUMENTATION.md**](./DOCUMENTATION.md) file.

## ✨ Key Features

- **Decentralized Identifiers (DIDs)**: Each student gets a unique, anonymous DID to interact with the system.
- **zk-SNARKs (Zero-Knowledge Proofs)**: Ensures the voter is eligible without revealing their real identity on-chain.
- **Smart Contracts (Solidity)**: Handles immutable vote casting, self-tallying, and prevents double-voting.
- **Gasless Voting (ERC-4337)**: Features account abstraction and a paymaster, meaning students don't need to hold ETH or manage private keys to cast their vote.
- **Full-Stack DApp**: Built with a React (Vite) frontend, Node.js/Express backend API, and a Hardhat local Ethereum node.

## 🚀 Quick-Start Cheatsheet

Here is the fastest way to get the local development environment up and running. 

*Prerequisites: Node.js (≥18.x), npm, Git, and `circom` compiled and installed.*

Open 3 separate terminals in the project root:

**Terminal 1 — Local Blockchain**
```bash
npm install
npx hardhat node
```

**Terminal 2 — Deploy Contracts & Start Backend**
```bash
npx hardhat run scripts/deploy.js --network localhost
cd backend
npm install
node seed.js
npm run dev
```
*(Note: Remember to update `frontend/src/config/deployment.js` with the new contract addresses generated in `deployment.json` after deployment).*

**Terminal 3 — Start Frontend**
```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at [http://localhost:5173](http://localhost:5173) and the backend API at [http://localhost:3001](http://localhost:3001).

## 🧪 Running Tests

To run the full integration test suite covering smart contracts, ZKP mock verification, and eligibility logic:

```bash
npx hardhat test
```
