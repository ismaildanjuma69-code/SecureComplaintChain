;; ComplaintLogger.clar

(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-COMPLAINT-ID u101)
(define-constant ERR-INVALID-HASH u102)
(define-constant ERR-INVALID-CALLER u103)
(define-constant ERR-COMPLAINT-ALREADY-EXISTS u104)
(define-constant ERR-COMPLAINT-NOT-FOUND u105)
(define-constant ERR-INVALID-TIMESTAMP u106)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u107)
(define-constant ERR-INVALID-DESCRIPTION u108)
(define-constant ERR-INVALID-STATUS u109)
(define-constant ERR-INVALID-PRIORITY u110)
(define-constant ERR-INVALID-CATEGORY u111)
(define-constant ERR-INVALID-LOCATION u112)
(define-constant ERR-INVALID-ATTACHMENT u113)
(define-constant ERR-MAX-COMPLAINTS-EXCEEDED u114)
(define-constant ERR-INVALID-UPDATE-PARAM u115)
(define-constant ERR-UPDATE-NOT-ALLOWED u116)
(define-constant ERR-INVALID-RESOLUTION u117)
(define-constant ERR-INVALID-FEEDBACK u118)
(define-constant ERR-INVALID-RATING u119)
(define-constant ERR-INVALID-EXPIRY u120)

(define-data-var next-complaint-id uint u0)
(define-data-var max-complaints uint u10000)
(define-data-var logging-fee uint u500)
(define-data-var authority-contract (optional principal) none)

(define-map complaints
  uint
  {
    transcript-hash: (buff 32),
    timestamp: uint,
    caller: principal,
    description: (string-utf8 500),
    status: (string-utf8 20),
    priority: uint,
    category: (string-utf8 50),
    location: (string-utf8 100),
    attachment-hash: (optional (buff 32)),
    expiry: uint
  }
)

(define-map complaints-by-hash
  (buff 32)
  uint)

(define-map complaint-updates
  uint
  {
    update-description: (string-utf8 500),
    update-status: (string-utf8 20),
    update-priority: uint,
    update-timestamp: uint,
    updater: principal
  }
)

(define-map complaint-resolutions
  uint
  {
    resolution: (string-utf8 500),
    resolver: principal,
    resolution-timestamp: uint
  }
)

(define-map complaint-feedback
  uint
  {
    feedback: (string-utf8 500),
    rating: uint,
    feedback-timestamp: uint
  }
)

(define-read-only (get-complaint (id uint))
  (map-get? complaints id)
)

(define-read-only (get-complaint-updates (id uint))
  (map-get? complaint-updates id)
)

(define-read-only (get-complaint-resolution (id uint))
  (map-get? complaint-resolutions id)
)

(define-read-only (get-complaint-feedback (id uint))
  (map-get? complaint-feedback id)
)

(define-read-only (is-complaint-registered (hash (buff 32)))
  (is-some (map-get? complaints-by-hash hash))
)

(define-private (validate-hash (hash (buff 32)))
  (if (is-eq (len hash) u32)
      (ok true)
      (err ERR-INVALID-HASH))
)

(define-private (validate-caller (caller principal))
  (if (not (is-eq caller 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-INVALID-CALLER))
)

(define-private (validate-description (desc (string-utf8 500)))
  (if (and (> (len desc) u0) (<= (len desc) u500))
      (ok true)
      (err ERR-INVALID-DESCRIPTION))
)

(define-private (validate-status (status (string-utf8 20)))
  (if (or (is-eq status "open") (is-eq status "in-progress") (is-eq status "closed"))
      (ok true)
      (err ERR-INVALID-STATUS))
)

(define-private (validate-priority (priority uint))
  (if (and (>= priority u1) (<= priority u5))
      (ok true)
      (err ERR-INVALID-PRIORITY))
)

(define-private (validate-category (cat (string-utf8 50)))
  (if (and (> (len cat) u0) (<= (len cat) u50))
      (ok true)
      (err ERR-INVALID-CATEGORY))
)

(define-private (validate-location (loc (string-utf8 100)))
  (if (and (> (len loc) u0) (<= (len loc) u100))
      (ok true)
      (err ERR-INVALID-LOCATION))
)

(define-private (validate-attachment (attach (optional (buff 32))))
  (match attach
    hash (try! (validate-hash hash))
    (ok true))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-expiry (expiry uint))
  (if (> expiry block-height)
      (ok true)
      (err ERR-INVALID-EXPIRY))
)

(define-private (validate-resolution (res (string-utf8 500)))
  (if (and (> (len res) u0) (<= (len res) u500))
      (ok true)
      (err ERR-INVALID-RESOLUTION))
)

(define-private (validate-feedback (fb (string-utf8 500)))
  (if (and (> (len fb) u0) (<= (len fb) u500))
      (ok true)
      (err ERR-INVALID-FEEDBACK))
)

(define-private (validate-rating (rating uint))
  (if (and (>= rating u1) (<= rating u5))
      (ok true)
      (err ERR-INVALID-RATING))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-caller contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-max-complaints (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-MAX-COMPLAINTS-EXCEEDED))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set max-complaints new-max)
    (ok true)
  )
)

(define-public (set-logging-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR-INVALID-UPDATE-PARAM))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set logging-fee new-fee)
    (ok true)
  )
)

(define-public (log-complaint
  (transcript-hash (buff 32))
  (description (string-utf8 500))
  (priority uint)
  (category (string-utf8 50))
  (location (string-utf8 100))
  (attachment-hash (optional (buff 32)))
  (expiry uint)
)
  (let (
        (next-id (var-get next-complaint-id))
        (current-max (var-get max-complaints))
        (authority (var-get authority-contract))
      )
    (asserts! (< next-id current-max) (err ERR-MAX-COMPLAINTS-EXCEEDED))
    (try! (validate-hash transcript-hash))
    (try! (validate-description description))
    (try! (validate-priority priority))
    (try! (validate-category category))
    (try! (validate-location location))
    (try! (validate-attachment attachment-hash))
    (try! (validate-expiry expiry))
    (asserts! (is-none (map-get? complaints-by-hash transcript-hash)) (err ERR-COMPLAINT-ALREADY-EXISTS))
    (let ((authority-recipient (unwrap! authority (err ERR-AUTHORITY-NOT-VERIFIED))))
      (try! (stx-transfer? (var-get logging-fee) tx-sender authority-recipient))
    )
    (map-set complaints next-id
      {
        transcript-hash: transcript-hash,
        timestamp: block-height,
        caller: tx-sender,
        description: description,
        status: "open",
        priority: priority,
        category: category,
        location: location,
        attachment-hash: attachment-hash,
        expiry: expiry
      }
    )
    (map-set complaints-by-hash transcript-hash next-id)
    (var-set next-complaint-id (+ next-id u1))
    (print { event: "complaint-logged", id: next-id })
    (ok next-id)
  )
)

(define-public (update-complaint
  (complaint-id uint)
  (update-description (string-utf8 500))
  (update-status (string-utf8 20))
  (update-priority uint)
)
  (let ((complaint (map-get? complaints complaint-id)))
    (match complaint
      c
        (begin
          (asserts! (is-eq (get caller c) tx-sender) (err ERR-NOT-AUTHORIZED))
          (try! (validate-description update-description))
          (try! (validate-status update-status))
          (try! (validate-priority update-priority))
          (map-set complaints complaint-id
            {
              transcript-hash: (get transcript-hash c),
              timestamp: (get timestamp c),
              caller: (get caller c),
              description: update-description,
              status: update-status,
              priority: update-priority,
              category: (get category c),
              location: (get location c),
              attachment-hash: (get attachment-hash c),
              expiry: (get expiry c)
            }
          )
          (map-set complaint-updates complaint-id
            {
              update-description: update-description,
              update-status: update-status,
              update-priority: update-priority,
              update-timestamp: block-height,
              updater: tx-sender
            }
          )
          (print { event: "complaint-updated", id: complaint-id })
          (ok true)
        )
      (err ERR-COMPLAINT-NOT-FOUND)
    )
  )
)

(define-public (resolve-complaint
  (complaint-id uint)
  (resolution (string-utf8 500))
)
  (let ((complaint (map-get? complaints complaint-id)))
    (match complaint
      c
        (begin
          (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
          (try! (validate-resolution resolution))
          (map-set complaint-resolutions complaint-id
            {
              resolution: resolution,
              resolver: tx-sender,
              resolution-timestamp: block-height
            }
          )
          (map-set complaints complaint-id
            {
              transcript-hash: (get transcript-hash c),
              timestamp: (get timestamp c),
              caller: (get caller c),
              description: (get description c),
              status: "closed",
              priority: (get priority c),
              category: (get category c),
              location: (get location c),
              attachment-hash: (get attachment-hash c),
              expiry: (get expiry c)
            }
          )
          (print { event: "complaint-resolved", id: complaint-id })
          (ok true)
        )
      (err ERR-COMPLAINT-NOT-FOUND)
    )
  )
)

(define-public (provide-feedback
  (complaint-id uint)
  (feedback (string-utf8 500))
  (rating uint)
)
  (let ((complaint (map-get? complaints complaint-id)))
    (match complaint
      c
        (begin
          (asserts! (is-eq (get caller c) tx-sender) (err ERR-NOT-AUTHORIZED))
          (try! (validate-feedback feedback))
          (try! (validate-rating rating))
          (map-set complaint-feedback complaint-id
            {
              feedback: feedback,
              rating: rating,
              feedback-timestamp: block-height
            }
          )
          (print { event: "feedback-provided", id: complaint-id })
          (ok true)
        )
      (err ERR-COMPLAINT-NOT-FOUND)
    )
  )
)

(define-public (validate-transcript-hash (provided-hash (buff 32)) (id uint))
  (match (map-get? complaints id)
    complaint
      (if (is-eq provided-hash (get transcript-hash complaint))
          (ok true)
          (err ERR-INVALID-HASH))
    (err ERR-COMPLAINT-NOT-FOUND)
  )
)

(define-public (get-complaint-count)
  (ok (var-get next-complaint-id))
)

(define-public (check-complaint-existence (hash (buff 32)))
  (ok (is-complaint-registered hash))
)