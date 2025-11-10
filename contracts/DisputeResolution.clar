;; DisputeResolution

(define-constant ERR-NOT-AUTHORIZED u200)
(define-constant ERR-INVALID-COMPLAINT-ID u201)
(define-constant ERR-DISPUTE-ALREADY-RAISED u202)
(define-constant ERR-INVALID-EVIDENCE-HASH u203)
(define-constant ERR-DISPUTE-NOT-FOUND u204)
(define-constant ERR-VOTING-NOT-OPEN u205)
(define-constant ERR-ALREADY-VOTED u206)
(define-constant ERR-INVALID-VOTE u207)
(define-constant ERR-INSUFFICIENT-VOTES u208)
(define-constant ERR-TIME-EXPIRED u209)
(define-constant ERR-INVALID-RESOLUTION u210)
(define-constant ERR-VOTING-THRESHOLD-NOT-MET u211)
(define-constant ERR-INVALID-DISPUTE-STATUS u212)
(define-constant ERR-MAX-DISPUTES-EXCEEDED u213)
(define-constant ERR-INVALID-VOTING-PERIOD u214)
(define-constant ERR-INVALID-PENALTY-AMOUNT u215)
(define-constant ERR-INVALID-THRESHOLD u216)
(define-constant ERR-AUTHORITY-NOT-SET u217)
(define-constant ERR-DISPUTE-CLOSED u218)
(define-constant ERR-INVALID-ROLE u219)

(define-data-var next-dispute-id uint u0)
(define-data-var max-disputes uint u500)
(define-data-var voting-period uint u144) ;; blocks
(define-data-var voting-threshold uint u51) ;; percentage
(define-data-var penalty-amount uint u500)
(define-data-var authority (optional principal) none)

(define-map disputes
  uint
  {
    complaint-id: uint,
    raised-by: principal,
    evidence-hash: (buff 32),
    status: (string-utf8 20),
    votes-yes: uint,
    votes-no: uint,
    resolution: (optional (string-utf8 50)),
    raised-at: uint,
    closes-at: uint,
    resolved-by: (optional principal)
  }
)

(define-map complaint-to-dispute uint uint)

(define-map dispute-votes
  {dispute-id: uint, voter: principal}
  bool
)

(define-map dispute-participants
  {dispute-id: uint, participant: principal}
  bool
)

;; ----------------------
;; Read-only helpers
;; ----------------------

(define-read-only (get-dispute (id uint))
  (map-get? disputes id)
)

(define-read-only (get-vote-status (id uint) (voter principal))
  (map-get? dispute-votes {dispute-id: id, voter: voter})
)

(define-read-only (is-participant (id uint) (p principal))
  (is-some (map-get? dispute-participants {dispute-id: id, participant: p}))
)

(define-read-only (get-dispute-count)
  (var-get next-dispute-id)
)

;; ----------------------
;; Validation helpers
;; ----------------------

(define-private (validate-complaint-id (cid uint))
  (if (> cid u0)
      (ok true)
      (err ERR-INVALID-COMPLAINT-ID))
)

(define-private (validate-evidence-hash (hash (buff 32)))
  (if (is-eq (len hash) u32)
      (ok true)
      (err ERR-INVALID-EVIDENCE-HASH))
)

(define-private (validate-status (s (string-utf8 20)))
  (let ((valid-statuses (list "open" "voting" "resolved" "closed")))
    (if (is-some (index-of valid-statuses s))
        (ok true)
        (err ERR-INVALID-DISPUTE-STATUS))
  )
)

(define-private (validate-vote (vote bool))
  (ok true)
)

(define-private (validate-resolution (res (string-utf8 50)))
  (if (or (is-eq res "in-favor") (is-eq res "against") (is-eq res "settled"))
      (ok true)
      (err ERR-INVALID-RESOLUTION))
)

(define-private (validate-voting-period (period uint))
  (if (and (> period u0) (<= period u1008))
      (ok true)
      (err ERR-INVALID-VOTING-PERIOD))
)

(define-private (validate-threshold (thresh uint))
  (if (and (> thresh u0) (<= thresh u100))
      (ok true)
      (err ERR-INVALID-THRESHOLD))
)

(define-private (validate-penalty (amt uint))
  (if (>= amt u0)
      (ok true)
      (err ERR-INVALID-PENALTY-AMOUNT))
)

(define-private (validate-role (role (string-utf8 20)))
  (if (or (is-eq role "customer") (is-eq role "agent"))
      (ok true)
      (err ERR-INVALID-ROLE))
)

(define-private (validate-participant (p principal))
  (ok true)
)

(define-private (validate-authority (auth principal))
  (ok true)
)

(define-private (check-dispute-open (id uint))
  (let ((dispute (unwrap! (map-get? disputes id) (err ERR-DISPUTE-NOT-FOUND))))
    (if (or (is-eq (get status dispute) "open") (is-eq (get status dispute) "voting"))
        (ok true)
        (err ERR-VOTING-NOT-OPEN))
  )
)

(define-private (check-time-not-expired (id uint))
  (let ((dispute (unwrap! (map-get? disputes id) (err ERR-DISPUTE-NOT-FOUND))))
    (if (<= block-height (get closes-at dispute))
        (ok true)
        (err ERR-TIME-EXPIRED))
  )
)

(define-private (check-votes-sufficient (id uint))
  (let* (
         (dispute (unwrap! (map-get? disputes id) (err ERR-DISPUTE-NOT-FOUND)))
         (total-votes (+ (get votes-yes dispute) (get votes-no dispute)))
         (yes-percent (if (> total-votes u0)
                          (/ (* u100 (get votes-yes dispute)) total-votes)
                          u0))
       )
    (if (>= yes-percent (var-get voting-threshold))
        (ok true)
        (err ERR-VOTING-THRESHOLD-NOT-MET))
  )
)

;; ----------------------
;; Admin setters
;; ----------------------

(define-public (set-authority (auth principal))
  (begin
    (asserts! (is-none (var-get authority)) (err ERR-AUTHORITY-NOT-SET))
    (try! (validate-authority auth))
    (var-set authority (some auth))
    (ok true)
  )
)

(define-public (set-voting-period (period uint))
  (begin
    (asserts! (is-some (var-get authority)) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-eq tx-sender (unwrap-panic (var-get authority))) (err ERR-NOT-AUTHORIZED))
    (try! (validate-voting-period period))
    (var-set voting-period period)
    (ok true)
  )
)

(define-public (set-voting-threshold (thresh uint))
  (begin
    (asserts! (is-some (var-get authority)) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-eq tx-sender (unwrap-panic (var-get authority))) (err ERR-NOT-AUTHORIZED))
    (try! (validate-threshold thresh))
    (var-set voting-threshold thresh)
    (ok true)
  )
)

(define-public (set-penalty-amount (amt uint))
  (begin
    (asserts! (is-some (var-get authority)) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-eq tx-sender (unwrap-panic (var-get authority))) (err ERR-NOT-AUTHORIZED))
    (try! (validate-penalty amt))
    (var-set penalty-amount amt)
    (ok true)
  )
)

(define-public (set-max-disputes (max uint))
  (begin
    (asserts! (is-some (var-get authority)) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-eq tx-sender (unwrap-panic (var-get authority))) (err ERR-NOT-AUTHORIZED))
    (asserts! (> max u0) (err ERR-INVALID-THRESHOLD))
    (var-set max-disputes max)
    (ok true)
  )
)

;; ----------------------
;; Core actions
;; ----------------------

(define-public (raise-dispute (complaint-id uint) (evidence-hash (buff 32)) (role (string-utf8 20)))
  (let (
        (next-id (var-get next-dispute-id))
        (current-max (var-get max-disputes))
      )
    (asserts! (< next-id current-max) (err ERR-MAX-DISPUTES-EXCEEDED))
    (try! (validate-complaint-id complaint-id))
    (try! (validate-evidence-hash evidence-hash))
    (try! (validate-role role))
    (asserts! (is-none (map-get? complaint-to-dispute complaint-id)) (err ERR-DISPUTE-ALREADY-RAISED))
    (map-set disputes next-id
      {
        complaint-id: complaint-id,
        raised-by: tx-sender,
        evidence-hash: evidence-hash,
        status: "open",
        votes-yes: u0,
        votes-no: u0,
        resolution: none,
        raised-at: block-height,
        closes-at: (+ block-height (var-get voting-period)),
        resolved-by: none
      }
    )
    (map-set complaint-to-dispute complaint-id next-id)
    (map-set dispute-participants {dispute-id: next-id, participant: tx-sender} true)
    (var-set next-dispute-id (+ next-id u1))
    (print { event: "dispute-raised", id: next-id })
    (ok next-id)
  )
)

(define-public (add-participant (dispute-id uint) (participant principal))
  (begin
    (try! (validate-participant participant))
    (asserts! (is-some (map-get? disputes dispute-id)) (err ERR-DISPUTE-NOT-FOUND))
    (map-set dispute-participants {dispute-id: dispute-id, participant: participant} true)
    (ok true)
  )
)

(define-public (vote-on-dispute (dispute-id uint) (vote bool))
  (let (
        (dispute (unwrap! (map-get? disputes dispute-id) (err ERR-DISPUTE-NOT-FOUND)))
        (vote-key {dispute-id: dispute-id, voter: tx-sender})
      )
    (try! (check-dispute-open dispute-id))
    (try! (check-time-not-expired dispute-id))
    (asserts! (is-participant dispute-id tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-none (map-get? dispute-votes vote-key)) (err ERR-ALREADY-VOTED))
    (try! (validate-vote vote))
    (map-set dispute-votes vote-key true)
    (if vote
        (map-set disputes dispute-id
          {
            complaint-id: (get complaint-id dispute),
            raised-by: (get raised-by dispute),
            evidence-hash: (get evidence-hash dispute),
            status: "voting",
            votes-yes: (+ u1 (get votes-yes dispute)),
            votes-no: (get votes-no dispute),
            resolution: (get resolution dispute),
            raised-at: (get raised-at dispute),
            closes-at: (get closes-at dispute),
            resolved-by: (get resolved-by dispute)
          }
        )
        (map-set disputes dispute-id
          {
            complaint-id: (get complaint-id dispute),
            raised-by: (get raised-by dispute),
            evidence-hash: (get evidence-hash dispute),
            status: "voting",
            votes-yes: (get votes-yes dispute),
            votes-no: (+ u1 (get votes-no dispute)),
            resolution: (get resolution dispute),
            raised-at: (get raised-at dispute),
            closes-at: (get closes-at dispute),
            resolved-by: (get resolved-by dispute)
          }
        )
    )
    (print { event: "vote-cast", dispute-id: dispute-id, vote: vote })
    (ok true)
  )
)

(define-public (resolve-dispute (dispute-id uint) (resolution (string-utf8 50)))
  (let (
        (dispute (unwrap! (map-get? disputes dispute-id) (err ERR-DISPUTE-NOT-FOUND)))
      )
    (try! (check-votes-sufficient dispute-id))
    (try! (validate-resolution resolution))
    (asserts! (is-eq (get status dispute) "voting") (err ERR-DISPUTE-CLOSED))
    (asserts! (is-some (var-get authority)) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-eq tx-sender (unwrap-panic (var-get authority))) (err ERR-NOT-AUTHORIZED))
    (map-set disputes dispute-id
      {
        complaint-id: (get complaint-id dispute),
        raised-by: (get raised-by dispute),
        evidence-hash: (get evidence-hash dispute),
        status: "resolved",
        votes-yes: (get votes-yes dispute),
        votes-no: (get votes-no dispute),
        resolution: (some resolution),
        raised-at: (get raised-at dispute),
        closes-at: (get closes-at dispute),
        resolved-by: (some tx-sender)
      }
    )
    (print { event: "dispute-resolved", id: dispute-id, resolution: resolution })
    (ok true)
  )
)

(define-public (close-dispute (dispute-id uint))
  (let (
        (dispute (unwrap! (map-get? disputes dispute-id) (err ERR-DISPUTE-NOT-FOUND)))
      )
    (asserts! (is-eq (get status dispute) "voting") (err ERR-DISPUTE-CLOSED))
    (asserts! (is-some (var-get authority)) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-eq tx-sender (unwrap-panic (var-get authority))) (err ERR-NOT-AUTHORIZED))
    (map-set disputes dispute-id
      {
        complaint-id: (get complaint-id dispute),
        raised-by: (get raised-by dispute),
        evidence-hash: (get evidence-hash dispute),
        status: "closed",
        votes-yes: (get votes-yes dispute),
        votes-no: (get votes-no dispute),
        resolution: none,
        raised-at: (get raised-at dispute),
        closes-at: (get closes-at dispute),
        resolved-by: (get resolved-by dispute)
      }
    )
    (ok true)
  )
)

(define-read-only (get-dispute-status (id uint))
  (match (map-get? disputes id)
    d (ok (get status d))
    (err ERR-DISPUTE-NOT-FOUND)
  )
)