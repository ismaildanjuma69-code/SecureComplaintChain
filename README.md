# SecureComplaintChain

## Overview

SecureComplaintChain is a Web3 project built on the Stacks blockchain using Clarity smart contracts. It addresses real-world issues in customer service, particularly in tech support, by providing blockchain-secured call logs for complaints. This ensures that virtual (phone or online) transcripts are immutable and can be verified against in-person follow-ups, reducing disputes, fraud, and miscommunication. 

In industries like telecommunications, IT support, and consumer electronics, customers often face discrepancies between what was promised during a support call and what is delivered in follow-up actions (e.g., repairs, refunds, or escalations). This leads to trust erosion, legal disputes, and inefficient resolutions. SecureComplaintChain solves this by:
- Immutable logging of call transcripts (hashed for privacy).
- Verification mechanisms for follow-ups.
- Decentralized dispute resolution.
- Incentives for honest participation via a utility token.
- Audit trails for compliance and transparency.

The project leverages 6 core smart contracts written in Clarity, ensuring security, clarity (pun intended), and efficiency on the Stacks network, which benefits from Bitcoin's security via Proof-of-Transfer.

## Key Features

- **Immutable Call Logging**: Hash and store call transcripts on-chain, linked to unique complaint IDs.
- **Follow-Up Verification**: Agents or customers submit follow-up details, which are cross-verified against the original log.
- **Dispute Handling**: Automated or oracle-assisted resolution for mismatches.
- **User Roles and Permissions**: Customers, support agents, and admins with role-based access.
- **Token Incentives**: Reward agents for accurate follow-ups and customers for valid complaints.
- **Audit and Reporting**: Generate verifiable reports for regulatory compliance.

## Real-World Problems Solved

1. **Dispute Reduction**: By providing tamper-proof records, it minimizes "he-said-she-said" scenarios in customer complaints.
2. **Accountability in Tech Support**: Ensures companies can't alter logs post-call, promoting better service quality.
3. **Privacy and Compliance**: Uses hashes to store sensitive data off-chain while proving integrity on-chain (GDPR/HIPAA compatible).
4. **Fraud Prevention**: Prevents agents from promising unfeasible solutions or customers from fabricating claims.
5. **Efficiency in Follow-Ups**: Automates verification, speeding up resolutions in sectors like warranty claims or tech troubleshooting.
6. **Transparency for Stakeholders**: Auditors or regulators can verify logs without trusting a central database.

## Architecture

The project consists of 6 smart contracts in Clarity, interacting via public functions and traits. Contracts are designed to be modular, with clear interfaces for extensibility.

### 1. UserRegistry.clar
   - **Purpose**: Manages user registration and roles (Customer, Agent, Admin).
   - **Key Functions**:
     - `register-user (principal, role)`: Registers a user with a role.
     - `get-user-role (principal)`: Retrieves role for access control.
     - `update-role (principal, new-role)`: Admin-only role updates.
   - **Traits Used**: None (base contract).
   - **Storage**: Maps principals to roles.

### 2. ComplaintLogger.clar
   - **Purpose**: Logs new complaints with transcript hashes.
   - **Key Functions**:
     - `log-complaint (complaint-id, transcript-hash, caller-principal)`: Stores a new complaint (Customer-only).
     - `get-complaint (complaint-id)`: Retrieves details (public read).
     - `validate-hash (provided-hash, complaint-id)`: Verifies transcript integrity.
   - **Traits Used**: Implements a simple logging trait.
   - **Storage**: Maps complaint-IDs to tuples (hash, timestamp, caller).

### 3. FollowUpVerifier.clar
   - **Purpose**: Verifies in-person follow-ups against logged complaints.
   - **Key Functions**:
     - `submit-follow-up (complaint-id, follow-up-details, agent-principal)`: Agent submits follow-up (hashed details).
     - `verify-match (complaint-id)`: Compares hashes; emits event on match/mismatch.
     - `get-verification-status (complaint-id)`: Returns status (Pending/Verified/Disputed).
   - **Traits Used**: Depends on ComplaintLogger for reads.
   - **Storage**: Maps complaint-IDs to follow-up tuples (hash, status).

### 4. DisputeResolution.clar
   - **Purpose**: Handles disputes when follow-ups don't match.
   - **Key Functions**:
     - `raise-dispute (complaint-id, evidence-hash)`: Customer/Agent raises dispute.
     - `resolve-dispute (complaint-id, resolution)`: Admin or oracle resolves.
     - `get-dispute-status (complaint-id)`: Public read.
   - **Traits Used**: Integrates with FollowUpVerifier.
   - **Storage**: Maps disputes to evidence and resolutions.
   - **Note**: Can integrate with external oracles for automated evidence checking.

### 5. UtilityToken.clar
   - **Purpose**: SIP-010 compliant fungible token for incentives (e.g., reward agents for verified follow-ups).
   - **Key Functions**:
     - `mint (amount, recipient)`: Admin mints tokens.
     - `transfer (amount, sender, recipient)`: Standard transfer.
     - `reward-verification (complaint-id, amount)`: Auto-rewards on successful verification.
   - **Traits Used**: Implements ft-trait (SIP-010).
   - **Storage**: Balances map and total supply.

### 6. AuditTrail.clar
   - **Purpose**: Logs all actions for immutable auditing.
   - **Key Functions**:
     - `log-action (action-type, principal, details)`: Called by other contracts on events.
     - `get-audit-log (start-index, count)`: Retrieves paginated logs.
     - `export-report (filter)`: Generates filtered report (off-chain consumable).
   - **Traits Used**: Event emitter trait.
   - **Storage**: List of audit entries (tuples: timestamp, action, principal).

Contracts interact via cross-calls (e.g., FollowUpVerifier calls ComplaintLogger). Deployment order: UserRegistry → ComplaintLogger → FollowUpVerifier → DisputeResolution → UtilityToken → AuditTrail.

## Prerequisites

- Stacks Wallet (e.g., Hiro Wallet) for deployment and interaction.
- Clarity development environment: Install Clarinet (Stacks CLI tool) via `cargo install clarinet`.
- Node.js for any frontend (optional; project focuses on backend contracts).
- Stacks Testnet or Mainnet account with STX tokens for deployment fees.

## Installation and Deployment

1. **Clone the Repository**:
   ```
   git clone `git clone <repo-url>`
   cd SecureComplaintChain
   ```

2. **Set Up Clarinet**:
   - Run `clarinet new .` if not already initialized.
   - Place contract files in `./contracts/`.

3. **Deploy to Testnet**:
   - Update `Clarinet.toml` with contract paths.
   - Run `clarinet integrate` for local testing.
   - Deploy: Use Stacks Explorer or `clarinet deploy` with a wallet.

4. **Contract Code Snippets** (Example for ComplaintLogger.clar):
   ```clarity
   (define-map complaints uint {hash: (buff 32), timestamp: uint, caller: principal})

   (define-public (log-complaint (id uint) (hash (buff 32)) (caller principal))
     (if (is-eq tx-sender caller)
       (ok (map-set complaints id {hash: hash, timestamp: block-height, caller: caller}))
       (err u1)))  ;; Error if not caller

   (define-read-only (get-complaint (id uint))
     (map-get? complaints id))
   ```
   (Full code in `./contracts/` directory.)

## Usage

1. **Register Users**: Call `UserRegistry.register-user` via a Stacks wallet or dApp.
2. **Log a Complaint**: Customer calls `ComplaintLogger.log-complaint` with transcript hash (generated off-chain from call audio/text).
3. **Submit Follow-Up**: Agent calls `FollowUpVerifier.submit-follow-up`.
4. **Verify**: System auto-verifies; if mismatch, raise via `DisputeResolution.raise-dispute`.
5. **Rewards**: On verification, tokens are minted/transferred via `UtilityToken`.
6. **Audit**: Query `AuditTrail.get-audit-log` for reports.

Integrate with a frontend (e.g., React + @stacks/connect) for user-friendly interface. Off-chain: Use speech-to-text APIs (e.g., AssemblyAI) for transcripts, hash with SHA-256.

## Testing

- Use Clarinet for unit tests: `clarinet test`.
- Example test in `./tests/`: Simulate logging and verification.

## Security Considerations

- All contracts use `tx-sender` for authentication.
- Avoid storing full transcripts on-chain (privacy); use hashes.
- Audit recommended before mainnet deployment.
- Rate limiting via nonces to prevent spam.

## Contributing

Fork the repo, create a branch, and submit a PR. Follow Clarity best practices.

## License

MIT License. See LICENSE file for details.