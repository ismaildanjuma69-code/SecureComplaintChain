import { describe, it, expect, beforeEach } from "vitest";
import { stringUtf8CV, uintCV, bufferCV, principalCV, boolCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 200;
const ERR_INVALID_COMPLAINT_ID = 201;
const ERR_DISPUTE_ALREADY_RAISED = 202;
const ERR_INVALID_EVIDENCE_HASH = 203;
const ERR_DISPUTE_NOT_FOUND = 204;
const ERR_VOTING_NOT_OPEN = 205;
const ERR_ALREADY_VOTED = 206;
const ERR_INVALID_VOTE = 207;
const ERR_INSUFFICIENT_VOTES = 208;
const ERR_TIME_EXPIRED = 209;
const ERR_INVALID_RESOLUTION = 210;
const ERR_VOTING_THRESHOLD_NOT_MET = 211;
const ERR_INVALID_DISPUTE_STATUS = 212;
const ERR_MAX_DISPUTES_EXCEEDED = 213;
const ERR_INVALID_VOTING_PERIOD = 214;
const ERR_INVALID_PENALTY_AMOUNT = 215;
const ERR_INVALID_THRESHOLD = 216;
const ERR_AUTHORITY_NOT_SET = 217;
const ERR_DISPUTE_CLOSED = 218;
const ERR_INVALID_ROLE = 219;

interface Dispute {
  complaintId: number;
  raisedBy: string;
  evidenceHash: Uint8Array;
  status: string;
  votesYes: number;
  votesNo: number;
  resolution: string | null;
  raisedAt: number;
  closesAt: number;
  resolvedBy: string | null;
}

interface VoteKey {
  disputeId: number;
  voter: string;
}

interface ParticipantKey {
  disputeId: number;
  participant: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class DisputeResolutionMock {
  state: {
    nextDisputeId: number;
    maxDisputes: number;
    votingPeriod: number;
    votingThreshold: number;
    penaltyAmount: number;
    authority: string | null;
    disputes: Map<number, Dispute>;
    complaintToDispute: Map<number, number>;
    disputeVotes: Map<string, boolean>;
    disputeParticipants: Map<string, boolean>;
  } = {
    nextDisputeId: 0,
    maxDisputes: 500,
    votingPeriod: 144,
    votingThreshold: 51,
    penaltyAmount: 500,
    authority: null,
    disputes: new Map(),
    complaintToDispute: new Map(),
    disputeVotes: new Map(),
    disputeParticipants: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  authoritySet: Set<string> = new Set(["ST1TEST"]);

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextDisputeId: 0,
      maxDisputes: 500,
      votingPeriod: 144,
      votingThreshold: 51,
      penaltyAmount: 500,
      authority: null,
      disputes: new Map(),
      complaintToDispute: new Map(),
      disputeVotes: new Map(),
      disputeParticipants: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.authoritySet = new Set(["ST1TEST"]);
  }

  setAuthority(auth: string): Result<boolean> {
    if (this.state.authority !== null) return { ok: false, value: false };
    this.state.authority = auth;
    return { ok: true, value: true };
  }

  setVotingPeriod(period: number): Result<boolean> {
    if (!this.state.authority || !this.authoritySet.has(this.caller)) return { ok: false, value: false };
    if (period <= 0 || period > 1008) return { ok: false, value: false };
    this.state.votingPeriod = period;
    return { ok: true, value: true };
  }

  setVotingThreshold(thresh: number): Result<boolean> {
    if (!this.state.authority || !this.authoritySet.has(this.caller)) return { ok: false, value: false };
    if (thresh <= 0 || thresh > 100) return { ok: false, value: false };
    this.state.votingThreshold = thresh;
    return { ok: true, value: true };
  }

  setPenaltyAmount(amt: number): Result<boolean> {
    if (!this.state.authority || !this.authoritySet.has(this.caller)) return { ok: false, value: false };
    if (amt < 0) return { ok: false, value: false };
    this.state.penaltyAmount = amt;
    return { ok: true, value: true };
  }

  setMaxDisputes(max: number): Result<boolean> {
    if (!this.state.authority || !this.authoritySet.has(this.caller)) return { ok: false, value: false };
    if (max <= 0) return { ok: false, value: false };
    this.state.maxDisputes = max;
    return { ok: true, value: true };
  }

  raiseDispute(complaintId: number, evidenceHash: Uint8Array, role: string): Result<number> {
    if (this.state.nextDisputeId >= this.state.maxDisputes) return { ok: false, value: ERR_MAX_DISPUTES_EXCEEDED };
    if (complaintId <= 0) return { ok: false, value: ERR_INVALID_COMPLAINT_ID };
    if (evidenceHash.length !== 32) return { ok: false, value: ERR_INVALID_EVIDENCE_HASH };
    if (!["customer", "agent"].includes(role)) return { ok: false, value: ERR_INVALID_ROLE };
    if (this.state.complaintToDispute.has(complaintId)) return { ok: false, value: ERR_DISPUTE_ALREADY_RAISED };

    const id = this.state.nextDisputeId;
    const dispute: Dispute = {
      complaintId,
      raisedBy: this.caller,
      evidenceHash,
      status: "open",
      votesYes: 0,
      votesNo: 0,
      resolution: null,
      raisedAt: this.blockHeight,
      closesAt: this.blockHeight + this.state.votingPeriod,
      resolvedBy: null,
    };
    this.state.disputes.set(id, dispute);
    this.state.complaintToDispute.set(complaintId, id);
    this.state.disputeParticipants.set(JSON.stringify({ disputeId: id, participant: this.caller }), true);
    this.state.nextDisputeId++;
    return { ok: true, value: id };
  }

  addParticipant(disputeId: number, participant: string): Result<boolean> {
    if (!this.state.disputes.has(disputeId)) return { ok: false, value: false };
    this.state.disputeParticipants.set(JSON.stringify({ disputeId, participant }), true);
    return { ok: true, value: true };
  }

  voteOnDispute(disputeId: number, vote: boolean): Result<boolean> {
    const dispute = this.state.disputes.get(disputeId);
    if (!dispute) return { ok: false, value: ERR_DISPUTE_NOT_FOUND };
    if (!["open", "voting"].includes(dispute.status)) return { ok: false, value: ERR_VOTING_NOT_OPEN };
    if (this.blockHeight > dispute.closesAt) return { ok: false, value: ERR_TIME_EXPIRED };
    const voteKey = JSON.stringify({ disputeId, voter: this.caller });
    if (this.state.disputeVotes.has(voteKey)) return { ok: false, value: ERR_ALREADY_VOTED };
    if (!this.state.disputeParticipants.has(JSON.stringify({ disputeId, participant: this.caller }))) return { ok: false, value: ERR_NOT_AUTHORIZED };

    this.state.disputeVotes.set(voteKey, true);
    if (vote) {
      dispute.votesYes += 1;
    } else {
      dispute.votesNo += 1;
    }
    dispute.status = "voting";
    this.state.disputes.set(disputeId, dispute);
    return { ok: true, value: true };
  }

  resolveDispute(disputeId: number, resolution: string): Result<boolean> {
    const dispute = this.state.disputes.get(disputeId);
    if (!dispute) return { ok: false, value: ERR_DISPUTE_NOT_FOUND };
    if (dispute.status !== "voting") return { ok: false, value: ERR_DISPUTE_CLOSED };
    if (!["in-favor", "against", "settled"].includes(resolution)) return { ok: false, value: ERR_INVALID_RESOLUTION };
    if (!this.state.authority || this.caller !== this.state.authority) return { ok: false, value: ERR_NOT_AUTHORIZED };

    const totalVotes = dispute.votesYes + dispute.votesNo;
    const yesPercent = totalVotes > 0 ? Math.floor((dispute.votesYes * 100) / totalVotes) : 0;
    if (yesPercent < this.state.votingThreshold) return { ok: false, value: ERR_VOTING_THRESHOLD_NOT_MET };

    dispute.status = "resolved";
    dispute.resolution = resolution;
    dispute.resolvedBy = this.caller;
    this.state.disputes.set(disputeId, dispute);
    return { ok: true, value: true };
  }

  closeDispute(disputeId: number): Result<boolean> {
    const dispute = this.state.disputes.get(disputeId);
    if (!dispute) return { ok: false, value: ERR_DISPUTE_NOT_FOUND };
    if (dispute.status !== "voting") return { ok: false, value: ERR_DISPUTE_CLOSED };
    if (!this.state.authority || this.caller !== this.state.authority) return { ok: false, value: ERR_NOT_AUTHORIZED };

    dispute.status = "closed";
    dispute.resolution = null;
    this.state.disputes.set(disputeId, dispute);
    return { ok: true, value: true };
  }

  getDispute(id: number): Dispute | null {
    return this.state.disputes.get(id) || null;
  }

  getDisputeStatus(id: number): Result<string> {
    const dispute = this.state.disputes.get(id);
    if (!dispute) return { ok: false, value: ERR_DISPUTE_NOT_FOUND };
    return { ok: true, value: dispute.status };
  }

  getDisputeCount(): Result<number> {
    return { ok: true, value: this.state.nextDisputeId };
  }
}

describe("DisputeResolution", () => {
  let contract: DisputeResolutionMock;

  beforeEach(() => {
    contract = new DisputeResolutionMock();
    contract.reset();
  });

  it("raises a dispute successfully", () => {
    contract.setAuthority("ST2TEST");
    const hash = new Uint8Array(32);
    const result = contract.raiseDispute(1, hash, "customer");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);

    const dispute = contract.getDispute(0);
    expect(dispute?.complaintId).toBe(1);
    expect(dispute?.raisedBy).toBe("ST1TEST");
    expect(dispute?.evidenceHash).toEqual(hash);
    expect(dispute?.status).toBe("open");
    expect(dispute?.votesYes).toBe(0);
    expect(dispute?.votesNo).toBe(0);
    expect(dispute?.resolution).toBeNull();
    expect(dispute?.raisedAt).toBe(0);
    expect(dispute?.closesAt).toBe(144);
    expect(dispute?.resolvedBy).toBeNull();
  });

  it("rejects raising duplicate dispute", () => {
    contract.setAuthority("ST2TEST");
    const hash = new Uint8Array(32);
    contract.raiseDispute(1, hash, "customer");
    const result = contract.raiseDispute(1, hash, "customer");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_DISPUTE_ALREADY_RAISED);
  });

  it("rejects invalid complaint id", () => {
    contract.setAuthority("ST2TEST");
    const hash = new Uint8Array(32);
    const result = contract.raiseDispute(0, hash, "customer");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_COMPLAINT_ID);
  });

  it("rejects invalid evidence hash length", () => {
    contract.setAuthority("ST2TEST");
    const hash = new Uint8Array(31);
    const result = contract.raiseDispute(1, hash, "customer");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_EVIDENCE_HASH);
  });

  it("rejects max disputes exceeded", () => {
    contract.setAuthority("ST2TEST");
    contract.state.maxDisputes = 1;
    const hash = new Uint8Array(32);
    contract.raiseDispute(1, hash, "customer");
    const result = contract.raiseDispute(2, hash, "customer");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_DISPUTES_EXCEEDED);
  });

  it("adds participant successfully", () => {
    contract.setAuthority("ST2TEST");
    const hash = new Uint8Array(32);
    contract.raiseDispute(1, hash, "customer");
    const result = contract.addParticipant(0, "ST3TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.disputeParticipants.has(JSON.stringify({ disputeId: 0, participant: "ST3TEST" }))).toBe(true);
  });

  it("rejects add participant for non-existent dispute", () => {
    const result = contract.addParticipant(99, "ST3TEST");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("votes on dispute successfully yes", () => {
    contract.setAuthority("ST2TEST");
    const hash = new Uint8Array(32);
    contract.raiseDispute(1, hash, "customer");
    contract.addParticipant(0, "ST1TEST");
    contract.blockHeight = 10;
    const result = contract.voteOnDispute(0, true);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);

    const dispute = contract.getDispute(0);
    expect(dispute?.votesYes).toBe(1);
    expect(dispute?.status).toBe("voting");
  });

  it("votes on dispute successfully no", () => {
    contract.setAuthority("ST2TEST");
    const hash = new Uint8Array(32);
    contract.raiseDispute(1, hash, "customer");
    contract.addParticipant(0, "ST1TEST");
    contract.blockHeight = 10;
    const result = contract.voteOnDispute(0, false);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);

    const dispute = contract.getDispute(0);
    expect(dispute?.votesNo).toBe(1);
    expect(dispute?.status).toBe("voting");
  });

  it("rejects vote on non-open dispute", () => {
    contract.setAuthority("ST2TEST");
    const hash = new Uint8Array(32);
    contract.raiseDispute(1, hash, "customer");
    contract.addParticipant(0, "ST1TEST");
    contract.blockHeight = 10;
    contract.voteOnDispute(0, true);
    const result = contract.voteOnDispute(0, true);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ALREADY_VOTED);
  });

  it("rejects vote after time expired", () => {
    contract.setAuthority("ST2TEST");
    const hash = new Uint8Array(32);
    contract.raiseDispute(1, hash, "customer");
    contract.addParticipant(0, "ST1TEST");
    contract.blockHeight = 150;
    const result = contract.voteOnDispute(0, true);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_TIME_EXPIRED);
  });

  it("rejects vote by non-participant", () => {
    contract.setAuthority("ST2TEST");
    const hash = new Uint8Array(32);
    contract.raiseDispute(1, hash, "customer");
    contract.blockHeight = 10;
    contract.caller = "ST3FAKE";
    const result = contract.voteOnDispute(0, true);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("resolves dispute successfully", () => {
    contract.setAuthority("ST2TEST");
    contract.state.authority = "ST1TEST";
    const hash = new Uint8Array(32);
    contract.raiseDispute(1, hash, "customer");
    contract.addParticipant(0, "ST1TEST");
    contract.addParticipant(0, "ST3TEST");
    contract.caller = "ST3TEST";
    contract.authoritySet.add("ST3TEST");
    contract.voteOnDispute(0, true);
    contract.caller = "ST1TEST";
    contract.voteOnDispute(0, true);
    contract.blockHeight = 20;
    contract.caller = "ST1TEST";
    const result = contract.resolveDispute(0, "in-favor");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);

    const dispute = contract.getDispute(0);
    expect(dispute?.status).toBe("resolved");
    expect(dispute?.resolution).toBe("in-favor");
    expect(dispute?.resolvedBy).toBe("ST1TEST");
  });

  it("rejects resolve with insufficient votes", () => {
    contract.setAuthority("ST2TEST");
    contract.state.authority = "ST1TEST";
    const hash = new Uint8Array(32);
    contract.raiseDispute(1, hash, "customer");
    contract.addParticipant(0, "ST1TEST");
    contract.addParticipant(0, "ST3TEST");
    contract.caller = "ST3TEST";
    contract.authoritySet.add("ST3TEST");
    contract.voteOnDispute(0, false);
    contract.caller = "ST1TEST";
    contract.voteOnDispute(0, true);
    contract.blockHeight = 20;
    const result = contract.resolveDispute(0, "in-favor");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_VOTING_THRESHOLD_NOT_MET);
  });

  it("rejects resolve by non-authority", () => {
    contract.setAuthority("ST2TEST");
    contract.state.authority = "ST2TEST";
    const hash = new Uint8Array(32);
    contract.raiseDispute(1, hash, "customer");
    contract.addParticipant(0, "ST1TEST");
    contract.addParticipant(0, "ST3TEST");
    contract.caller = "ST3TEST";
    contract.authoritySet.add("ST3TEST");
    contract.voteOnDispute(0, true);
    contract.caller = "ST1TEST";
    contract.voteOnDispute(0, true);
    contract.blockHeight = 20;
    contract.caller = "ST3TEST";
    const result = contract.resolveDispute(0, "in-favor");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects invalid resolution", () => {
    contract.setAuthority("ST2TEST");
    contract.state.authority = "ST1TEST";
    const hash = new Uint8Array(32);
    contract.raiseDispute(1, hash, "customer");
    contract.addParticipant(0, "ST1TEST");
    contract.addParticipant(0, "ST3TEST");
    contract.caller = "ST3TEST";
    contract.authoritySet.add("ST3TEST");
    contract.voteOnDispute(0, true);
    contract.caller = "ST1TEST";
    contract.voteOnDispute(0, true);
    contract.blockHeight = 20;
    const result = contract.resolveDispute(0, "invalid");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_RESOLUTION);
  });

  it("closes dispute successfully", () => {
    contract.setAuthority("ST2TEST");
    contract.state.authority = "ST1TEST";
    const hash = new Uint8Array(32);
    contract.raiseDispute(1, hash, "customer");
    contract.addParticipant(0, "ST1TEST");
    contract.addParticipant(0, "ST3TEST");
    contract.caller = "ST3TEST";
    contract.authoritySet.add("ST3TEST");
    contract.voteOnDispute(0, true);
    contract.caller = "ST1TEST";
    contract.voteOnDispute(0, true);
    contract.blockHeight = 20;
    contract.caller = "ST1TEST";
    const result = contract.closeDispute(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);

    const dispute = contract.getDispute(0);
    expect(dispute?.status).toBe("closed");
    expect(dispute?.resolution).toBeNull();
  });

  it("rejects close by non-authority", () => {
    contract.setAuthority("ST2TEST");
    contract.state.authority = "ST2TEST";
    const hash = new Uint8Array(32);
    contract.raiseDispute(1, hash, "customer");
    contract.addParticipant(0, "ST1TEST");
    contract.voteOnDispute(0, true);
    contract.blockHeight = 20;
    contract.caller = "ST3TEST";
    const result = contract.closeDispute(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects close non-voting dispute", () => {
    contract.setAuthority("ST2TEST");
    contract.state.authority = "ST1TEST";
    const hash = new Uint8Array(32);
    contract.raiseDispute(1, hash, "customer");
    contract.blockHeight = 20;
    const result = contract.closeDispute(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_DISPUTE_CLOSED);
  });

  it("returns correct dispute status", () => {
    contract.setAuthority("ST2TEST");
    const hash = new Uint8Array(32);
    contract.raiseDispute(1, hash, "customer");
    const result = contract.getDisputeStatus(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe("open");
  });

  it("rejects get status for non-existent dispute", () => {
    const result = contract.getDisputeStatus(99);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_DISPUTE_NOT_FOUND);
  });

  it("returns correct dispute count", () => {
    contract.setAuthority("ST2TEST");
    const hash = new Uint8Array(32);
    contract.raiseDispute(1, hash, "customer");
    contract.raiseDispute(2, hash, "customer");
    const result = contract.getDisputeCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("sets voting period successfully", () => {
    contract.setAuthority("ST2TEST");
    contract.state.authority = "ST1TEST";
    const result = contract.setVotingPeriod(200);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.votingPeriod).toBe(200);
  });

  it("rejects invalid voting period", () => {
    contract.setAuthority("ST2TEST");
    contract.state.authority = "ST1TEST";
    const result = contract.setVotingPeriod(1009);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets voting threshold successfully", () => {
    contract.setAuthority("ST2TEST");
    contract.state.authority = "ST1TEST";
    const result = contract.setVotingThreshold(60);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.votingThreshold).toBe(60);
  });

  it("rejects invalid threshold", () => {
    contract.setAuthority("ST2TEST");
    contract.state.authority = "ST1TEST";
    const result = contract.setVotingThreshold(101);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets penalty amount successfully", () => {
    contract.setAuthority("ST2TEST");
    contract.state.authority = "ST1TEST";
    const result = contract.setPenaltyAmount(1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.penaltyAmount).toBe(1000);
  });

  it("rejects negative penalty", () => {
    contract.setAuthority("ST2TEST");
    contract.state.authority = "ST1TEST";
    const result = contract.setPenaltyAmount(-1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets max disputes successfully", () => {
    contract.setAuthority("ST2TEST");
    contract.state.authority = "ST1TEST";
    const result = contract.setMaxDisputes(1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.maxDisputes).toBe(1000);
  });

  it("rejects zero max disputes", () => {
    contract.setAuthority("ST2TEST");
    contract.state.authority = "ST1TEST";
    const result = contract.setMaxDisputes(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });
});