// tests/follow-up-verifier.test.ts

import { describe, it, expect, beforeEach } from "vitest";
import { stringAsciiCV, stringUtf8CV, uintCV, bufferCV, principalCV, noneCV, someCV } from "@stacks/transactions";
import { ClarityValue } from "@stacks/transactions";

const ERR_NOT_AGENT = 200;
const ERR_COMPLAINT_NOT_FOUND = 201;
const ERR_INVALID_FOLLOW_UP_HASH = 202;
const ERR_INVALID_DETAILS_LENGTH = 203;
const ERR_VERIFICATION_PENDING = 204;
const ERR_MISMATCH_HASH = 205;
const ERR_DISPUTE_ALREADY_RAISED = 206;
const ERR_INVALID_DISPUTE_EVIDENCE = 207;
const ERR_NOT_AUTHORIZED_RESOLVE = 208;
const ERR_INVALID_STATUS = 209;
const ERR_MAX_FOLLOW_UPS_EXCEEDED = 210;
const ERR_INVALID_TIMESTAMP = 211;
const ERR_INVALID_AGENT_ROLE = 212;
const ERR_FOLLOW_UP_ALREADY_SUBMITTED = 213;
const ERR_INVALID_MATCH_THRESHOLD = 214;
const ERR_NO_COMPLAINT_LOGGER = 215;

interface FollowUp {
  followUpHash: Buffer;
  detailsHash: Buffer;
  timestamp: bigint;
  status: string;
  evidence?: Buffer | null;
  resolver?: string | null;
}

interface VerificationStatus {
  complaintId: bigint;
  overallStatus: string;
  verificationCount: bigint;
  matchScore: bigint;
  lastUpdated: bigint;
}

interface Dispute {
  complaintId: bigint;
  raisedBy: string;
  evidenceHash: Buffer;
  timestamp: bigint;
  resolved: boolean;
  resolution?: string | null;
}

interface Result<T> {
  ok: boolean;
  value: T | number;
}

class FollowUpVerifierMock {
  state: {
    complaintLoggerContract: string | null;
    maxFollowUpsPerComplaint: bigint;
    matchThreshold: bigint;
    resolutionFee: bigint;
    followUps: Map<string, FollowUp>;
    verificationStatus: Map<bigint, VerificationStatus>;
    disputes: Map<bigint, Dispute>;
    adminPrincipal: string;
  } = {
    complaintLoggerContract: null,
    maxFollowUpsPerComplaint: BigInt(5),
    matchThreshold: BigInt(80),
    resolutionFee: BigInt(500),
    followUps: new Map(),
    verificationStatus: new Map(),
    disputes: new Map(),
    adminPrincipal: "SZ2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKQ9H6DPR",
  };
  blockHeight: bigint = BigInt(0);
  caller: string = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
  agents: Set<string> = new Set(["ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM"]);
  stxTransfers: Array<{ amount: bigint; from: string; to: string }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      complaintLoggerContract: null,
      maxFollowUpsPerComplaint: BigInt(5),
      matchThreshold: BigInt(80),
      resolutionFee: BigInt(500),
      followUps: new Map(),
      verificationStatus: new Map(),
      disputes: new Map(),
      adminPrincipal: "SZ2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKQ9H6DPR",
    };
    this.blockHeight = BigInt(0);
    this.caller = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    this.agents.add(this.caller);
    this.stxTransfers = [];
  }

  getUserRole(agent: string, role: string): Result<boolean> {
    return { ok: true, value: this.agents.has(agent) ? true : false };
  }

  getComplaintHash(complaintId: bigint): Result<Buffer> {
    return { ok: true, value: Buffer.from("sample-hash") };
  }

  stxTransfer(amount: bigint, from: string, to: string): Result<boolean> {
    this.stxTransfers.push({ amount, from, to });
    return { ok: true, value: true };
  }

  setComplaintLogger(logger: string): Result<boolean> {
    if (this.caller !== this.state.adminPrincipal) return { ok: false, value: ERR_NOT_AUTHORIZED_RESOLVE };
    this.state.complaintLoggerContract = logger;
    return { ok: true, value: true };
  }

  setMaxFollowUps(max: bigint): Result<boolean> {
    if (this.caller !== this.state.adminPrincipal) return { ok: false, value: ERR_NOT_AUTHORIZED_RESOLVE };
    if (max <= BigInt(0)) return { ok: false, value: ERR_INVALID_MATCH_THRESHOLD };
    this.state.maxFollowUpsPerComplaint = max;
    return { ok: true, value: true };
  }

  setMatchThreshold(threshold: bigint): Result<boolean> {
    if (this.caller !== this.state.adminPrincipal) return { ok: false, value: ERR_NOT_AUTHORIZED_RESOLVE };
    if (threshold <= BigInt(0) || threshold > BigInt(100)) return { ok: false, value: ERR_INVALID_MATCH_THRESHOLD };
    this.state.matchThreshold = threshold;
    return { ok: true, value: true };
  }

  setResolutionFee(fee: bigint): Result<boolean> {
    if (this.caller !== this.state.adminPrincipal) return { ok: false, value: ERR_NOT_AUTHORIZED_RESOLVE };
    this.state.resolutionFee = fee;
    return { ok: true, value: true };
  }

  submitFollowUp(
    complaintId: bigint,
    followUpHash: Buffer,
    details: string,
    detailsHash: Buffer
  ): Result<boolean> {
    if (followUpHash.length === 0) return { ok: false, value: ERR_INVALID_FOLLOW_UP_HASH };
    if (details.length === 0 || details.length > 200) return { ok: false, value: ERR_INVALID_DETAILS_LENGTH };
    if (detailsHash.length === 0) return { ok: false, value: ERR_INVALID_FOLLOW_UP_HASH };
    if (!this.agents.has(this.caller)) return { ok: false, value: ERR_INVALID_AGENT_ROLE };
    const key = `${complaintId}-${this.caller}`;
    if (this.state.followUps.has(key)) return { ok: false, value: ERR_FOLLOW_UP_ALREADY_SUBMITTED };
    const count = this.getVerificationCount(complaintId);
    if (count >= this.state.maxFollowUpsPerComplaint) return { ok: false, value: ERR_MAX_FOLLOW_UPS_EXCEEDED };
    if (!this.state.complaintLoggerContract) return { ok: false, value: ERR_NO_COMPLAINT_LOGGER };
    this.state.followUps.set(key, {
      followUpHash,
      detailsHash,
      timestamp: this.blockHeight,
      status: "pending",
      evidence: null,
      resolver: null,
    });
    this.updateVerificationStatus(complaintId);
    return { ok: true, value: true };
  }

  private getVerificationCount(complaintId: bigint): bigint {
    const status = this.state.verificationStatus.get(complaintId);
    return status ? status.verificationCount : BigInt(0);
  }

  private updateVerificationStatus(complaintId: bigint): void {
    const keys = Array.from(this.state.followUps.keys()).filter(key => key.startsWith(`${complaintId}-`));
    const count = keys.length;
    let matches = BigInt(0);
    keys.forEach(key => {
      const fu = this.state.followUps.get(key);
      if (fu && fu.status === "verified") {
        matches += BigInt(1);
      }
    });
    const countBig = BigInt(count);
    const score = countBig > BigInt(0) ? (matches * BigInt(100)) / countBig : BigInt(0);
    const status = score >= this.state.matchThreshold ? "verified" : "disputed";
    this.state.verificationStatus.set(complaintId, {
      complaintId,
      overallStatus: status,
      verificationCount: countBig,
      matchScore: score,
      lastUpdated: this.blockHeight,
    });
  }

  verifyMatch(complaintId: bigint): Result<boolean> {
    const status = this.state.verificationStatus.get(complaintId);
    const overallStatus = status ? status.overallStatus : "pending";
    if (overallStatus !== "pending") return { ok: false, value: ERR_VERIFICATION_PENDING };
    const key = `${complaintId}-${this.caller}`;
    const followUp = this.state.followUps.get(key);
    if (!followUp) return { ok: false, value: ERR_COMPLAINT_NOT_FOUND };
    const compHashResult = this.getComplaintHash(complaintId);
    if (!compHashResult.ok) return { ok: false, value: ERR_COMPLAINT_NOT_FOUND };
    const compHash = compHashResult.value as Buffer;
    if (followUp.followUpHash.equals(compHash)) {
      this.state.followUps.set(key, { ...followUp, status: "verified" });
      this.updateVerificationStatus(complaintId);
      return { ok: true, value: true };
    } else {
      this.state.followUps.set(key, { ...followUp, status: "disputed" });
      this.updateVerificationStatus(complaintId);
      return { ok: false, value: ERR_MISMATCH_HASH };
    }
  }

  raiseDispute(complaintId: bigint, evidenceHash: Buffer): Result<boolean> {
    if (evidenceHash.length === 0) return { ok: false, value: ERR_INVALID_DISPUTE_EVIDENCE };
    if (this.state.disputes.has(complaintId)) return { ok: false, value: ERR_DISPUTE_ALREADY_RAISED };
    const key = `${complaintId}-${this.caller}`;
    const followUp = this.state.followUps.get(key);
    if (!followUp) return { ok: false, value: ERR_COMPLAINT_NOT_FOUND };
    this.state.disputes.set(complaintId, {
      complaintId,
      raisedBy: this.caller,
      evidenceHash,
      timestamp: this.blockHeight,
      resolved: false,
      resolution: null,
    });
    this.state.followUps.set(key, { ...followUp, evidence: evidenceHash });
    return { ok: true, value: true };
  }

  resolveDispute(complaintId: bigint, resolution: string): Result<boolean> {
    const dispute = this.state.disputes.get(complaintId);
    if (!dispute) return { ok: false, value: ERR_COMPLAINT_NOT_FOUND };
    if (this.caller !== this.state.adminPrincipal) return { ok: false, value: ERR_NOT_AUTHORIZED_RESOLVE };
    if (dispute.resolved) return { ok: false, value: ERR_INVALID_STATUS };
    if (resolution.length > 50) return { ok: false, value: ERR_INVALID_STATUS };
    const transferResult = this.stxTransfer(this.state.resolutionFee, this.caller, dispute.raisedBy);
    if (!transferResult.ok) return transferResult;
    this.state.disputes.set(complaintId, { ...dispute, resolved: true, resolution });
    const key = `${complaintId}-${dispute.raisedBy}`;
    const followUp = this.state.followUps.get(key);
    if (followUp) {
      this.state.followUps.set(key, { ...followUp, status: resolution, resolver: this.caller });
    }
    this.updateVerificationStatus(complaintId);
    return { ok: true, value: true };
  }

  getFollowUp(complaintId: bigint, agent: string): FollowUp | null {
    const key = `${complaintId}-${agent}`;
    return this.state.followUps.get(key) || null;
  }

  getVerificationStatus(complaintId: bigint): VerificationStatus | null {
    return this.state.verificationStatus.get(complaintId) || null;
  }

  getDispute(complaintId: bigint): Dispute | null {
    return this.state.disputes.get(complaintId) || null;
  }

  isFollowUpSubmitted(complaintId: bigint, agent: string): boolean {
    const key = `${complaintId}-${agent}`;
    return this.state.followUps.has(key);
  }
}

describe("FollowUpVerifier", () => {
  let contract: FollowUpVerifierMock;

  beforeEach(() => {
    contract = new FollowUpVerifierMock();
    contract.reset();
    contract.blockHeight = BigInt(100);
  });

  it("submits a follow-up successfully", () => {
    contract.caller = contract.state.adminPrincipal;
    contract.setComplaintLogger("ST2TEST");
    contract.caller = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    const followUpHash = Buffer.from("sample-hash");
    const details = "Sample details text";
    const detailsHash = Buffer.from("details-hash");
    const result = contract.submitFollowUp(BigInt(1), followUpHash, details, detailsHash);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const fu = contract.getFollowUp(BigInt(1), "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM");
    expect(fu?.status).toBe("pending");
    expect(fu?.timestamp).toBe(BigInt(100));
    const vs = contract.getVerificationStatus(BigInt(1));
    expect(vs?.overallStatus).toBe("disputed");
    expect(vs?.verificationCount).toBe(BigInt(1));
  });

  it("rejects submit with invalid hash", () => {
    contract.caller = contract.state.adminPrincipal;
    contract.setComplaintLogger("ST2TEST");
    contract.caller = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    const followUpHash = Buffer.from("");
    const details = "Sample details";
    const detailsHash = Buffer.from("details-hash");
    const result = contract.submitFollowUp(BigInt(1), followUpHash, details, detailsHash);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_FOLLOW_UP_HASH);
  });

  it("rejects submit with invalid details length", () => {
    contract.caller = contract.state.adminPrincipal;
    contract.setComplaintLogger("ST2TEST");
    contract.caller = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    const followUpHash = Buffer.from("hash123456789012345678901234567890");
    const details = "a".repeat(201);
    const detailsHash = Buffer.from("details-hash");
    const result = contract.submitFollowUp(BigInt(1), followUpHash, details, detailsHash);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_DETAILS_LENGTH);
  });

  it("rejects submit for non-agent", () => {
    contract.caller = contract.state.adminPrincipal;
    contract.setComplaintLogger("ST2TEST");
    contract.caller = "ST2FAKE";
    contract.agents.delete("ST2FAKE");
    const followUpHash = Buffer.from("hash123456789012345678901234567890");
    const details = "Sample details";
    const detailsHash = Buffer.from("details-hash");
    const result = contract.submitFollowUp(BigInt(1), followUpHash, details, detailsHash);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_AGENT_ROLE);
  });

  it("rejects submit if already submitted", () => {
    contract.caller = contract.state.adminPrincipal;
    contract.setComplaintLogger("ST2TEST");
    contract.caller = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    const followUpHash = Buffer.from("hash123456789012345678901234567890");
    const details = "Sample details";
    const detailsHash = Buffer.from("details-hash");
    contract.submitFollowUp(BigInt(1), followUpHash, details, detailsHash);
    const result = contract.submitFollowUp(BigInt(1), followUpHash, details, detailsHash);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_FOLLOW_UP_ALREADY_SUBMITTED);
  });

  it("rejects submit when max follow-ups exceeded", () => {
    contract.caller = contract.state.adminPrincipal;
    contract.setComplaintLogger("ST2TEST");
    contract.caller = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    contract.state.maxFollowUpsPerComplaint = BigInt(1);
    const followUpHash = Buffer.from("hash123456789012345678901234567890");
    const details = "Sample details";
    const detailsHash = Buffer.from("details-hash");
    contract.submitFollowUp(BigInt(1), followUpHash, details, detailsHash);
    contract.caller = "ST2AGENT";
    contract.agents.add("ST2AGENT");
    const result = contract.submitFollowUp(BigInt(1), followUpHash, details, detailsHash);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_FOLLOW_UPS_EXCEEDED);
  });

  it("rejects verify when pending not set", () => {
    contract.caller = contract.state.adminPrincipal;
    contract.setComplaintLogger("ST2TEST");
    contract.caller = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    contract.state.verificationStatus.set(BigInt(1), { complaintId: BigInt(1), overallStatus: "verified", verificationCount: BigInt(0), matchScore: BigInt(100), lastUpdated: BigInt(0) });
    const result = contract.verifyMatch(BigInt(1));
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_VERIFICATION_PENDING);
  });

  it("raises dispute successfully", () => {
    contract.caller = contract.state.adminPrincipal;
    contract.setComplaintLogger("ST2TEST");
    contract.caller = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    const followUpHash = Buffer.from("hash123456789012345678901234567890");
    const details = "Sample details";
    const detailsHash = Buffer.from("details-hash");
    contract.submitFollowUp(BigInt(1), followUpHash, details, detailsHash);
    const evidenceHash = Buffer.from("evidence-hash");
    const result = contract.raiseDispute(BigInt(1), evidenceHash);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const dispute = contract.getDispute(BigInt(1));
    expect(dispute?.resolved).toBe(false);
    const fu = contract.getFollowUp(BigInt(1), "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM");
    expect(fu?.evidence).toEqual(evidenceHash);
  });

  it("rejects raise dispute with invalid evidence", () => {
    contract.caller = contract.state.adminPrincipal;
    contract.setComplaintLogger("ST2TEST");
    contract.caller = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    const followUpHash = Buffer.from("hash123456789012345678901234567890");
    const details = "Sample details";
    const detailsHash = Buffer.from("details-hash");
    contract.submitFollowUp(BigInt(1), followUpHash, details, detailsHash);
    const evidenceHash = Buffer.from("");
    const result = contract.raiseDispute(BigInt(1), evidenceHash);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_DISPUTE_EVIDENCE);
  });

  it("rejects raise dispute if already raised", () => {
    contract.caller = contract.state.adminPrincipal;
    contract.setComplaintLogger("ST2TEST");
    contract.caller = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    const followUpHash = Buffer.from("hash123456789012345678901234567890");
    const details = "Sample details";
    const detailsHash = Buffer.from("details-hash");
    contract.submitFollowUp(BigInt(1), followUpHash, details, detailsHash);
    const evidenceHash = Buffer.from("evidence-hash");
    contract.raiseDispute(BigInt(1), evidenceHash);
    const result = contract.raiseDispute(BigInt(1), evidenceHash);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_DISPUTE_ALREADY_RAISED);
  });

  it("resolves dispute successfully", () => {
    contract.caller = contract.state.adminPrincipal;
    contract.setComplaintLogger("ST2TEST");
    contract.caller = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    const followUpHash = Buffer.from("hash123456789012345678901234567890");
    const details = "Sample details";
    const detailsHash = Buffer.from("details-hash");
    contract.submitFollowUp(BigInt(1), followUpHash, details, detailsHash);
    const evidenceHash = Buffer.from("evidence-hash");
    contract.raiseDispute(BigInt(1), evidenceHash);
    contract.caller = contract.state.adminPrincipal;
    const result = contract.resolveDispute(BigInt(1), "verified");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const dispute = contract.getDispute(BigInt(1));
    expect(dispute?.resolved).toBe(true);
    expect(dispute?.resolution).toBe("verified");
    expect(contract.stxTransfers.length).toBe(1);
    expect(contract.stxTransfers[0].amount).toBe(BigInt(500));
    const fu = contract.getFollowUp(BigInt(1), "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM");
    expect(fu?.status).toBe("verified");
    expect(fu?.resolver).toBe(contract.state.adminPrincipal);
  });

  it("rejects resolve by non-admin", () => {
    contract.caller = contract.state.adminPrincipal;
    contract.setComplaintLogger("ST2TEST");
    contract.caller = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    const followUpHash = Buffer.from("hash123456789012345678901234567890");
    const details = "Sample details";
    const detailsHash = Buffer.from("details-hash");
    contract.submitFollowUp(BigInt(1), followUpHash, details, detailsHash);
    const evidenceHash = Buffer.from("evidence-hash");
    contract.raiseDispute(BigInt(1), evidenceHash);
    const result = contract.resolveDispute(BigInt(1), "verified");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED_RESOLVE);
  });

  it("rejects resolve if already resolved", () => {
    contract.caller = contract.state.adminPrincipal;
    contract.setComplaintLogger("ST2TEST");
    contract.caller = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    const followUpHash = Buffer.from("hash123456789012345678901234567890");
    const details = "Sample details";
    const detailsHash = Buffer.from("details-hash");
    contract.submitFollowUp(BigInt(1), followUpHash, details, detailsHash);
    const evidenceHash = Buffer.from("evidence-hash");
    contract.raiseDispute(BigInt(1), evidenceHash);
    contract.caller = contract.state.adminPrincipal;
    contract.resolveDispute(BigInt(1), "verified");
    const result = contract.resolveDispute(BigInt(1), "Another resolution");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_STATUS);
  });

  it("sets complaint logger successfully", () => {
    contract.caller = contract.state.adminPrincipal;
    const result = contract.setComplaintLogger("ST2TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.complaintLoggerContract).toBe("ST2TEST");
  });

  it("rejects set complaint logger by non-admin", () => {
    const result = contract.setComplaintLogger("ST2TEST");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED_RESOLVE);
  });

  it("sets max follow-ups successfully", () => {
    contract.caller = contract.state.adminPrincipal;
    const result = contract.setMaxFollowUps(BigInt(10));
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.maxFollowUpsPerComplaint).toBe(BigInt(10));
  });

  it("rejects invalid max follow-ups", () => {
    contract.caller = contract.state.adminPrincipal;
    const result = contract.setMaxFollowUps(BigInt(0));
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_MATCH_THRESHOLD);
  });

  it("sets match threshold successfully", () => {
    contract.caller = contract.state.adminPrincipal;
    const result = contract.setMatchThreshold(BigInt(90));
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.matchThreshold).toBe(BigInt(90));
  });

  it("rejects invalid match threshold", () => {
    contract.caller = contract.state.adminPrincipal;
    const result = contract.setMatchThreshold(BigInt(101));
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_MATCH_THRESHOLD);
  });

  it("sets resolution fee successfully", () => {
    contract.caller = contract.state.adminPrincipal;
    const result = contract.setResolutionFee(BigInt(1000));
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.resolutionFee).toBe(BigInt(1000));
  });

  it("rejects submit without complaint logger", () => {
    const followUpHash = Buffer.from("hash123456789012345678901234567890");
    const details = "Sample details";
    const detailsHash = Buffer.from("details-hash");
    const result = contract.submitFollowUp(BigInt(1), followUpHash, details, detailsHash);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NO_COMPLAINT_LOGGER);
  });
});