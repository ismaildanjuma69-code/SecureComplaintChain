// ComplaintLogger.test.ts

import { describe, it, expect, beforeEach } from "vitest";
import { bufferCV, stringUtf8CV, uintCV } from "@stacks/transactions";
import type { BufferCV } from "@stacks/transactions";
import { Buffer } from 'node:buffer';

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_HASH = 102;
const ERR_COMPLAINT_ALREADY_EXISTS = 104;
const ERR_COMPLAINT_NOT_FOUND = 105;
const ERR_INVALID_DESCRIPTION = 108;
const ERR_INVALID_STATUS = 109;
const ERR_INVALID_PRIORITY = 110;
const ERR_INVALID_CATEGORY = 111;
const ERR_INVALID_LOCATION = 112;
const ERR_INVALID_ATTACHMENT = 113;
const ERR_MAX_COMPLAINTS_EXCEEDED = 114;
const ERR_AUTHORITY_NOT_VERIFIED = 107;
const ERR_INVALID_RESOLUTION = 117;
const ERR_INVALID_FEEDBACK = 118;
const ERR_INVALID_RATING = 119;
const ERR_INVALID_EXPIRY = 120;

interface Complaint {
  transcriptHash: Buffer;
  timestamp: number;
  caller: string;
  description: string;
  status: string;
  priority: number;
  category: string;
  location: string;
  attachmentHash: Buffer | null;
  expiry: number;
}

interface ComplaintUpdate {
  updateDescription: string;
  updateStatus: string;
  updatePriority: number;
  updateTimestamp: number;
  updater: string;
}

interface ComplaintResolution {
  resolution: string;
  resolver: string;
  resolutionTimestamp: number;
}

interface ComplaintFeedback {
  feedback: string;
  rating: number;
  feedbackTimestamp: number;
}

interface Result<T> {
  ok: boolean;
  value: T | number;
}

class ComplaintLoggerMock {
  state: {
    nextComplaintId: number;
    maxComplaints: number;
    loggingFee: number;
    authorityContract: string | null;
    complaints: Map<number, Complaint>;
    complaintUpdates: Map<number, ComplaintUpdate>;
    complaintsByHash: Map<string, number>;
    complaintResolutions: Map<number, ComplaintResolution>;
    complaintFeedback: Map<number, ComplaintFeedback>;
  } = {
    nextComplaintId: 0,
    maxComplaints: 10000,
    loggingFee: 500,
    authorityContract: null,
    complaints: new Map(),
    complaintUpdates: new Map(),
    complaintsByHash: new Map(),
    complaintResolutions: new Map(),
    complaintFeedback: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextComplaintId: 0,
      maxComplaints: 10000,
      loggingFee: 500,
      authorityContract: null,
      complaints: new Map(),
      complaintUpdates: new Map(),
      complaintsByHash: new Map(),
      complaintResolutions: new Map(),
      complaintFeedback: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.stxTransfers = [];
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: false };
    }
    if (this.state.authorityContract !== null) {
      return { ok: false, value: false };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setLoggingFee(newFee: number): Result<boolean> {
    if (this.state.authorityContract === null) return { ok: false, value: false };
    this.state.loggingFee = newFee;
    return { ok: true, value: true };
  }

  setMaxComplaints(newMax: number): Result<boolean> {
    if (newMax <= 0) return { ok: false, value: false };
    if (this.state.authorityContract === null) return { ok: false, value: false };
    this.state.maxComplaints = newMax;
    return { ok: true, value: true };
  }

  logComplaint(
    transcriptHash: Buffer,
    description: string,
    priority: number,
    category: string,
    location: string,
    attachmentHash: Buffer | null,
    expiry: number
  ): Result<number> {
    if (this.state.nextComplaintId >= this.state.maxComplaints) return { ok: false, value: ERR_MAX_COMPLAINTS_EXCEEDED };
    if (transcriptHash.length !== 32) return { ok: false, value: ERR_INVALID_HASH };
    if (!description || description.length > 500) return { ok: false, value: ERR_INVALID_DESCRIPTION };
    if (priority < 1 || priority > 5) return { ok: false, value: ERR_INVALID_PRIORITY };
    if (!category || category.length > 50) return { ok: false, value: ERR_INVALID_CATEGORY };
    if (!location || location.length > 100) return { ok: false, value: ERR_INVALID_LOCATION };
    if (attachmentHash && attachmentHash.length !== 32) return { ok: false, value: ERR_INVALID_ATTACHMENT };
    if (expiry <= this.blockHeight) return { ok: false, value: ERR_INVALID_EXPIRY };
    const hashKey = transcriptHash.toString("hex");
    if (this.state.complaintsByHash.has(hashKey)) return { ok: false, value: ERR_COMPLAINT_ALREADY_EXISTS };
    if (this.state.authorityContract === null) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };

    this.stxTransfers.push({ amount: this.state.loggingFee, from: this.caller, to: this.state.authorityContract });

    const id = this.state.nextComplaintId;
    const complaint: Complaint = {
      transcriptHash,
      timestamp: this.blockHeight,
      caller: this.caller,
      description,
      status: "open",
      priority,
      category,
      location,
      attachmentHash,
      expiry,
    };
    this.state.complaints.set(id, complaint);
    this.state.complaintsByHash.set(hashKey, id);
    this.state.nextComplaintId++;
    return { ok: true, value: id };
  }

  getComplaint(id: number): Complaint | null {
    return this.state.complaints.get(id) || null;
  }

  updateComplaint(id: number, updateDescription: string, updateStatus: string, updatePriority: number): Result<boolean> {
    const complaint = this.state.complaints.get(id);
    if (!complaint) return { ok: false, value: false };
    if (complaint.caller !== this.caller) return { ok: false, value: false };
    if (!updateDescription || updateDescription.length > 500) return { ok: false, value: false };
    if (!["open", "in-progress", "closed"].includes(updateStatus)) return { ok: false, value: false };
    if (updatePriority < 1 || updatePriority > 5) return { ok: false, value: false };

    const updated: Complaint = {
      ...complaint,
      description: updateDescription,
      status: updateStatus,
      priority: updatePriority,
    };
    this.state.complaints.set(id, updated);
    this.state.complaintUpdates.set(id, {
      updateDescription,
      updateStatus,
      updatePriority,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }

  resolveComplaint(id: number, resolution: string): Result<boolean> {
    const complaint = this.state.complaints.get(id);
    if (!complaint) return { ok: false, value: ERR_COMPLAINT_NOT_FOUND };
    if (this.state.authorityContract === null) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    if (!resolution || resolution.length > 500) return { ok: false, value: ERR_INVALID_RESOLUTION };

    const updated: Complaint = {
      ...complaint,
      status: "closed",
    };
    this.state.complaints.set(id, updated);
    this.state.complaintResolutions.set(id, {
      resolution,
      resolver: this.caller,
      resolutionTimestamp: this.blockHeight,
    });
    return { ok: true, value: true };
  }

  provideFeedback(id: number, feedback: string, rating: number): Result<boolean> {
    const complaint = this.state.complaints.get(id);
    if (!complaint) return { ok: false, value: ERR_COMPLAINT_NOT_FOUND };
    if (complaint.caller !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!feedback || feedback.length > 500) return { ok: false, value: ERR_INVALID_FEEDBACK };
    if (rating < 1 || rating > 5) return { ok: false, value: ERR_INVALID_RATING };

    this.state.complaintFeedback.set(id, {
      feedback,
      rating,
      feedbackTimestamp: this.blockHeight,
    });
    return { ok: true, value: true };
  }

  validateTranscriptHash(providedHash: Buffer, id: number): Result<boolean> {
    const complaint = this.state.complaints.get(id);
    if (!complaint) return { ok: false, value: ERR_COMPLAINT_NOT_FOUND };
    if (!providedHash.equals(complaint.transcriptHash)) return { ok: false, value: ERR_INVALID_HASH };
    return { ok: true, value: true };
  }

  getComplaintCount(): Result<number> {
    return { ok: true, value: this.state.nextComplaintId };
  }

  checkComplaintExistence(hash: Buffer): Result<boolean> {
    const hashKey = hash.toString("hex");
    return { ok: true, value: this.state.complaintsByHash.has(hashKey) };
  }
}

describe("ComplaintLogger", () => {
  let contract: ComplaintLoggerMock;

  beforeEach(() => {
    contract = new ComplaintLoggerMock();
    contract.reset();
  });

  it("logs a complaint successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const transcriptHash = Buffer.alloc(32, 1);
    const result = contract.logComplaint(
      transcriptHash,
      "Test description",
      3,
      "Tech",
      "Office",
      null,
      100
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);

    const complaint = contract.getComplaint(0);
    expect(complaint?.transcriptHash).toEqual(transcriptHash);
    expect(complaint?.description).toBe("Test description");
    expect(complaint?.priority).toBe(3);
    expect(complaint?.category).toBe("Tech");
    expect(complaint?.location).toBe("Office");
    expect(complaint?.attachmentHash).toBe(null);
    expect(complaint?.expiry).toBe(100);
    expect(complaint?.status).toBe("open");
    expect(contract.stxTransfers).toEqual([{ amount: 500, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects duplicate complaint hashes", () => {
    contract.setAuthorityContract("ST2TEST");
    const transcriptHash = Buffer.alloc(32, 1);
    contract.logComplaint(
      transcriptHash,
      "Test description",
      3,
      "Tech",
      "Office",
      null,
      100
    );
    const result = contract.logComplaint(
      transcriptHash,
      "Another description",
      4,
      "Support",
      "Home",
      Buffer.alloc(32, 2),
      200
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_COMPLAINT_ALREADY_EXISTS);
  });

  it("rejects logging without authority contract", () => {
    const transcriptHash = Buffer.alloc(32, 1);
    const result = contract.logComplaint(
      transcriptHash,
      "Test description",
      3,
      "Tech",
      "Office",
      null,
      100
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
  });

  it("rejects invalid hash length", () => {
    contract.setAuthorityContract("ST2TEST");
    const invalidHash = Buffer.alloc(31, 1);
    const result = contract.logComplaint(
      invalidHash,
      "Test description",
      3,
      "Tech",
      "Office",
      null,
      100
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_HASH);
  });

  it("rejects invalid description", () => {
    contract.setAuthorityContract("ST2TEST");
    const transcriptHash = Buffer.alloc(32, 1);
    const result = contract.logComplaint(
      transcriptHash,
      "",
      3,
      "Tech",
      "Office",
      null,
      100
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_DESCRIPTION);
  });

  it("updates a complaint successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const transcriptHash = Buffer.alloc(32, 1);
    contract.logComplaint(
      transcriptHash,
      "Old description",
      3,
      "Tech",
      "Office",
      null,
      100
    );
    const result = contract.updateComplaint(0, "New description", "in-progress", 4);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const complaint = contract.getComplaint(0);
    expect(complaint?.description).toBe("New description");
    expect(complaint?.status).toBe("in-progress");
    expect(complaint?.priority).toBe(4);
    const update = contract.state.complaintUpdates.get(0);
    expect(update?.updateDescription).toBe("New description");
    expect(update?.updateStatus).toBe("in-progress");
    expect(update?.updatePriority).toBe(4);
    expect(update?.updater).toBe("ST1TEST");
  });

  it("rejects update for non-existent complaint", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.updateComplaint(99, "New description", "in-progress", 4);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects update by non-caller", () => {
    contract.setAuthorityContract("ST2TEST");
    const transcriptHash = Buffer.alloc(32, 1);
    contract.logComplaint(
      transcriptHash,
      "Test description",
      3,
      "Tech",
      "Office",
      null,
      100
    );
    contract.caller = "ST3FAKE";
    const result = contract.updateComplaint(0, "New description", "in-progress", 4);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("resolves a complaint successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const transcriptHash = Buffer.alloc(32, 1);
    contract.logComplaint(
      transcriptHash,
      "Test description",
      3,
      "Tech",
      "Office",
      null,
      100
    );
    const result = contract.resolveComplaint(0, "Resolved successfully");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const complaint = contract.getComplaint(0);
    expect(complaint?.status).toBe("closed");
    const resolution = contract.state.complaintResolutions.get(0);
    expect(resolution?.resolution).toBe("Resolved successfully");
    expect(resolution?.resolver).toBe("ST1TEST");
  });

  it("rejects resolution without authority", () => {
    contract.setAuthorityContract("ST2TEST");
    const transcriptHash = Buffer.alloc(32, 1);
    contract.logComplaint(
      transcriptHash,
      "Test description",
      3,
      "Tech",
      "Office",
      null,
      100
    );
    contract.state.authorityContract = null;
    const result = contract.resolveComplaint(0, "Resolved successfully");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
  });

  it("provides feedback successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const transcriptHash = Buffer.alloc(32, 1);
    contract.logComplaint(
      transcriptHash,
      "Test description",
      3,
      "Tech",
      "Office",
      null,
      100
    );
    const result = contract.provideFeedback(0, "Good service", 5);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const feedback = contract.state.complaintFeedback.get(0);
    expect(feedback?.feedback).toBe("Good service");
    expect(feedback?.rating).toBe(5);
  });

  it("rejects feedback by non-caller", () => {
    contract.setAuthorityContract("ST2TEST");
    const transcriptHash = Buffer.alloc(32, 1);
    contract.logComplaint(
      transcriptHash,
      "Test description",
      3,
      "Tech",
      "Office",
      null,
      100
    );
    contract.caller = "ST3FAKE";
    const result = contract.provideFeedback(0, "Good service", 5);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("validates transcript hash successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const transcriptHash = Buffer.alloc(32, 1);
    contract.logComplaint(
      transcriptHash,
      "Test description",
      3,
      "Tech",
      "Office",
      null,
      100
    );
    const result = contract.validateTranscriptHash(transcriptHash, 0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
  });

  it("rejects invalid transcript hash", () => {
    contract.setAuthorityContract("ST2TEST");
    const transcriptHash = Buffer.alloc(32, 1);
    contract.logComplaint(
      transcriptHash,
      "Test description",
      3,
      "Tech",
      "Office",
      null,
      100
    );
    const invalidHash = Buffer.alloc(32, 2);
    const result = contract.validateTranscriptHash(invalidHash, 0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_HASH);
  });

  it("returns correct complaint count", () => {
    contract.setAuthorityContract("ST2TEST");
    const transcriptHash1 = Buffer.alloc(32, 1);
    contract.logComplaint(
      transcriptHash1,
      "Test1",
      3,
      "Tech",
      "Office",
      null,
      100
    );
    const transcriptHash2 = Buffer.alloc(32, 2);
    contract.logComplaint(
      transcriptHash2,
      "Test2",
      4,
      "Support",
      "Home",
      null,
      200
    );
    const result = contract.getComplaintCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("checks complaint existence correctly", () => {
    contract.setAuthorityContract("ST2TEST");
    const transcriptHash = Buffer.alloc(32, 1);
    contract.logComplaint(
      transcriptHash,
      "Test description",
      3,
      "Tech",
      "Office",
      null,
      100
    );
    const result = contract.checkComplaintExistence(transcriptHash);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const invalidHash = Buffer.alloc(32, 2);
    const result2 = contract.checkComplaintExistence(invalidHash);
    expect(result2.ok).toBe(true);
    expect(result2.value).toBe(false);
  });

  it("sets logging fee successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setLoggingFee(1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.loggingFee).toBe(1000);
    const transcriptHash = Buffer.alloc(32, 1);
    contract.logComplaint(
      transcriptHash,
      "Test description",
      3,
      "Tech",
      "Office",
      null,
      100
    );
    expect(contract.stxTransfers).toEqual([{ amount: 1000, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects max complaints exceeded", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.setMaxComplaints(1);
    const transcriptHash1 = Buffer.alloc(32, 1);
    contract.logComplaint(
      transcriptHash1,
      "Test1",
      3,
      "Tech",
      "Office",
      null,
      100
    );
    const transcriptHash2 = Buffer.alloc(32, 2);
    const result = contract.logComplaint(
      transcriptHash2,
      "Test2",
      4,
      "Support",
      "Home",
      null,
      200
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_COMPLAINTS_EXCEEDED);
  });

  it("parses complaint parameters with Clarity types", () => {
    const desc = stringUtf8CV("Test description");
    const priority = uintCV(3);
    const hash: BufferCV = bufferCV(Buffer.alloc(32, 1));
    expect(desc.value).toBe("Test description");
    expect(priority.value).toEqual(BigInt(3));
    expect(hash.value.length).toBe(64);
  });

  it("rejects complaint logging with empty description", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.logComplaint(
      Buffer.alloc(32, 1),
      "",
      3,
      "Tech",
      "Office",
      null,
      100
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_DESCRIPTION);
  });

  it("rejects invalid expiry", () => {
    contract.setAuthorityContract("ST2TEST");
    const transcriptHash = Buffer.alloc(32, 1);
    const result = contract.logComplaint(
      transcriptHash,
      "Test description",
      3,
      "Tech",
      "Office",
      null,
      0
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_EXPIRY);
  });

  it("rejects invalid attachment hash", () => {
    contract.setAuthorityContract("ST2TEST");
    const transcriptHash = Buffer.alloc(32, 1);
    const invalidAttach = Buffer.alloc(31, 2);
    const result = contract.logComplaint(
      transcriptHash,
      "Test description",
      3,
      "Tech",
      "Office",
      invalidAttach,
      100
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_ATTACHMENT);
  });
});