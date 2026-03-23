package daemon

import (
	"encoding/json"
	"sync"
)

// PendingBatch is a set of cookies pushed from a peer, waiting for the popup to consume.
type PendingBatch struct {
	FromID       string          `json:"from_id"`
	FromHostname string          `json:"from_hostname"`
	Domain       string          `json:"domain"`
	Cookies      json.RawMessage `json:"cookies"`
}

// Queue is a thread-safe in-memory store for incoming cookie batches.
type Queue struct {
	mu    sync.Mutex
	items []PendingBatch
}

func (q *Queue) Add(fromID, fromHostname, domain string, cookies json.RawMessage) {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.items = append(q.items, PendingBatch{
		FromID:       fromID,
		FromHostname: fromHostname,
		Domain:       domain,
		Cookies:      cookies,
	})
}

// DrainAll returns all pending batches and clears the queue.
func (q *Queue) DrainAll() []PendingBatch {
	q.mu.Lock()
	defer q.mu.Unlock()
	items := q.items
	q.items = nil
	return items
}
