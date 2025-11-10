;; contracts/FollowUpVerifier.clar

(define-constant ERR-NOT-AGENT u200)
(define-constant ERR-COMPLAINT-NOT-FOUND u201)
(define-constant ERR-INVALID-FOLLOW-UP-HASH u202)
(define-constant ERR-INVALID-DETAILS-LENGTH u203)
(define-constant ERR-VERIFICATION-PENDING u204)
(define-constant ERR-MISMATCH-HASH u205)
(define-constant ERR-DISPUTE-ALREADY-RAISED u206)
(define-constant ERR-INVALID-DISPUTE-EVIDENCE u207)
(define-constant ERR-NOT-AUTHORIZED-RESOLVE u208)
(define-constant ERR-INVALID-STATUS u209)
(define-constant ERR-MAX-FOLLOW-UPS-EXCEEDED u210)
(define-constant ERR-INVALID-TIMESTAMP u211)
(define-constant ERR-INVALID-AGENT-ROLE u212)
(define-constant ERR-FOLLOW-UP-ALREADY-SUBMITTED u213)
(define-constant ERR-INVALID-MATCH-THRESHOLD u214)
(define-constant ERR-NO-COMPLAINT-LOGGER u215)
(define-constant ADMIN-PRINCIPAL 'SP000000000000000000002Q6VF78)

(define-data-var complaint-logger-contract principal ADMIN-PRINCIPAL)
(define-data-var max-follow-ups-per-complaint uint u5)
(define-data-var match-threshold uint u80)
(define-data-var resolution-fee uint u500)
(define-data-var current-complaint uint u0)

(define-map follow-ups
  { complaint-id: uint, agent: principal }
  {
    follow-up-hash: (buff 32),
    details-hash: (buff 32),
    timestamp: uint,
    status: (string-ascii 20),
    evidence: (optional (buff 32)),
    resolver: (optional principal)
  }
)

(define-map verification-status
  uint
  {
    complaint-id: uint,
    overall-status: (string-ascii 20),
    verification-count: uint,
    match-score: uint,
    last-updated: uint
  }
)

(define-map disputes
  uint
  {
    complaint-id: uint,
    raised-by: principal,
    evidence-hash: (buff 32),
    timestamp: uint,
    resolved: bool,
    resolution: (optional (string-ascii 50))
  }
)

(define-map complaint-agents uint (list 5 principal))

(define-read-only (get-follow-up (complaint-id uint) (agent principal))
  (map-get? follow-ups { complaint-id: complaint-id, agent: agent })
)

(define-read-only (get-verification-status (complaint-id uint))
  (map-get? verification-status complaint-id)
)

(define-read-only (get-dispute (complaint-id uint))
  (map-get? disputes complaint-id)
)

(define-read-only (is-follow-up-submitted (complaint-id uint) (agent principal))
  (is-some (map-get? follow-ups { complaint-id: complaint-id, agent: agent }))
)

(define-private (validate-hash (h (buff 32)))
  (if (> (len h) u0) (ok true) (err ERR-INVALID-FOLLOW-UP-HASH))
)

(define-private (validate-details-length (details (string-utf8 200)))
  (if (and (> (len details) u0) (<= (len details) u200)) (ok true) (err ERR-INVALID-DETAILS-LENGTH))
)

(define-private (validate-status (s (string-ascii 20)))
  (if (or (is-eq s "pending") (is-eq s "verified") (is-eq s "disputed")) (ok true) (err ERR-INVALID-STATUS))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height) (ok true) (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-agent-role (agent principal))
  (ok true)
)

(define-private (get-complaint-hash (complaint-id uint))
  (match (contract-call? (var-get complaint-logger-contract) get-complaint complaint-id)
    c (ok (get hash c))
    (err ERR-COMPLAINT-NOT-FOUND)
  )
)

(define-public (set-complaint-logger (logger principal))
  (begin
    (asserts! (is-eq tx-sender ADMIN-PRINCIPAL) (err ERR-NOT-AUTHORIZED-RESOLVE))
    (var-set complaint-logger-contract logger)
    (ok true)
  )
)

(define-public (set-max-follow-ups (max uint))
  (begin
    (asserts! (is-eq tx-sender ADMIN-PRINCIPAL) (err ERR-NOT-AUTHORIZED-RESOLVE))
    (asserts! (> max u0) (err ERR-INVALID-MATCH-THRESHOLD))
    (var-set max-follow-ups-per-complaint max)
    (ok true)
  )
)

(define-public (set-match-threshold (threshold uint))
  (begin
    (asserts! (is-eq tx-sender ADMIN-PRINCIPAL) (err ERR-NOT-AUTHORIZED-RESOLVE))
    (asserts! (and (> threshold u0) (<= threshold u100)) (err ERR-INVALID-MATCH-THRESHOLD))
    (var-set match-threshold threshold)
    (ok true)
  )
)

(define-public (set-resolution-fee (fee uint))
  (begin
    (asserts! (is-eq tx-sender ADMIN-PRINCIPAL) (err ERR-NOT-AUTHORIZED-RESOLVE))
    (var-set resolution-fee fee)
    (ok true)
  )
)

(define-public (submit-follow-up
  (complaint-id uint)
  (follow-up-hash (buff 32))
  (details (string-utf8 200))
  (details-hash (buff 32))
)
  (let (
        (agent tx-sender)
        (existing (is-follow-up-submitted complaint-id agent))
        (agents (default-to (list) (map-get? complaint-agents complaint-id)))
        (count (len agents))
        (comp-hash (try! (get-complaint-hash complaint-id)))
      )
    (asserts! (not existing) (err ERR-FOLLOW-UP-ALREADY-SUBMITTED))
    (asserts! (< count (var-get max-follow-ups-per-complaint)) (err ERR-MAX-FOLLOW-UPS-EXCEEDED))
    (try! (validate-hash follow-up-hash))
    (try! (validate-details-length details))
    (try! (validate-hash details-hash))
    (try! (validate-agent-role agent))
    (map-set follow-ups { complaint-id: complaint-id, agent: agent }
      {
        follow-up-hash: follow-up-hash,
        details-hash: details-hash,
        timestamp: block-height,
        status: "pending",
        evidence: none,
        resolver: none
      }
    )
    (map-set complaint-agents complaint-id (append agents agent))
    (try! (update-verification-status complaint-id))
    (print { event: "follow-up-submitted", complaint-id: complaint-id, agent: agent })
    (ok true)
  )
)

(define-private (update-verification-status (complaint-id uint))
  (let (
        (agents (default-to (list) (map-get? complaint-agents complaint-id)))
        (follow-up-count (len agents))
        (matches (fold count-matches agents u0))
        (score (if (> follow-up-count u0) (/ (* matches u100) follow-up-count) u0))
        (status (if (>= score (var-get match-threshold)) "verified" "disputed"))
      )
    (var-set current-complaint complaint-id)
    (map-set verification-status complaint-id
      {
        complaint-id: complaint-id,
        overall-status: status,
        verification-count: follow-up-count,
        match-score: score,
        last-updated: block-height
      }
    )
    (ok true)
  )
)

(define-private (count-matches (agent principal) (acc uint))
  (let ((fu (unwrap! (map-get? follow-ups { complaint-id: (var-get current-complaint), agent: agent }) acc)))
    (+ acc (if (is-eq (get status fu) "verified") u1 u0))
  )
)

(define-public (verify-match (complaint-id uint))
  (let (
        (status (get overall-status (default-to { overall-status: "pending" } (map-get? verification-status complaint-id))))
        (follow-up (unwrap! (map-get? follow-ups { complaint-id: complaint-id, agent: tx-sender }) (err ERR-FOLLOW-UP-ALREADY-SUBMITTED)))
      )
    (asserts! (is-eq status "pending") (err ERR-VERIFICATION-PENDING))
    (if (is-eq (get follow-up-hash follow-up) (unwrap-panic (get-complaint-hash complaint-id)))
      (begin
        (map-set follow-ups { complaint-id: complaint-id, agent: tx-sender }
          (merge follow-up { status: "verified" })
        )
        (try! (update-verification-status complaint-id))
        (print { event: "match-verified", complaint-id: complaint-id })
        (ok true)
      )
      (begin
        (map-set follow-ups { complaint-id: complaint-id, agent: tx-sender }
          (merge follow-up { status: "disputed" })
        )
        (print { event: "mismatch-disputed", complaint-id: complaint-id })
        (err ERR-MISMATCH-HASH)
      )
    )
  )
)

(define-public (raise-dispute (complaint-id uint) (evidence-hash (buff 32)))
  (let (
        (existing (map-get? disputes complaint-id))
        (follow-up (unwrap! (map-get? follow-ups { complaint-id: complaint-id, agent: tx-sender }) (err ERR-COMPLAINT-NOT-FOUND)))
      )
    (asserts! (is-none existing) (err ERR-DISPUTE-ALREADY-RAISED))
    (try! (validate-hash evidence-hash))
    (map-set disputes complaint-id
      {
        complaint-id: complaint-id,
        raised-by: tx-sender,
        evidence-hash: evidence-hash,
        timestamp: block-height,
        resolved: false,
        resolution: none
      }
    )
    (map-set follow-ups { complaint-id: complaint-id, agent: tx-sender }
      (merge follow-up { evidence: (some evidence-hash) })
    )
    (print { event: "dispute-raised", complaint-id: complaint-id })
    (ok true)
  )
)

(define-public (resolve-dispute (complaint-id uint) (resolution (string-ascii 50)))
  (let (
        (dispute (unwrap! (map-get? disputes complaint-id) (err ERR-COMPLAINT-NOT-FOUND)))
        (follow-up (unwrap! (map-get? follow-ups { complaint-id: complaint-id, agent: (get raised-by dispute) }) (err ERR-COMPLAINT-NOT-FOUND)))
      )
    (asserts! (is-eq tx-sender ADMIN-PRINCIPAL) (err ERR-NOT-AUTHORIZED-RESOLVE))
    (asserts! (not (get resolved dispute)) (err ERR-INVALID-STATUS))
    (try! (stx-transfer? (var-get resolution-fee) tx-sender (get raised-by dispute)))
    (map-set disputes complaint-id
      (merge dispute { resolved: true, resolution: (some resolution) })
    )
    (map-set follow-ups { complaint-id: complaint-id, agent: (get raised-by dispute) }
      (merge follow-up { status: resolution, resolver: (some tx-sender) })
    )
    (try! (update-verification-status complaint-id))
    (print { event: "dispute-resolved", complaint-id: complaint-id, resolution: resolution })
    (ok true)
  )
)