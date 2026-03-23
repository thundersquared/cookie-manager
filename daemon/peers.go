package daemon

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

// Peer represents a discovered or known remote instance.
type Peer struct {
	ID       string `json:"id"`
	Hostname string `json:"hostname"`
	Profile  string `json:"profile"`
	LastIP   string `json:"last_ip"`
	LastPort int    `json:"last_port"`
}

type peerStore struct {
	mu    sync.RWMutex
	peers map[string]Peer // keyed by ID
}

var store = &peerStore{peers: make(map[string]Peer)}

func peersFile() string {
	return filepath.Join(supportDir(), "peers.json")
}

// LoadPeers reads persisted peers from disk into the in-memory store.
func LoadPeers() error {
	data, err := os.ReadFile(peersFile())
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}

	var list []Peer
	if err := json.Unmarshal(data, &list); err != nil {
		return err
	}

	store.mu.Lock()
	defer store.mu.Unlock()
	for _, p := range list {
		store.peers[p.ID] = p
	}
	return nil
}

// UpsertPeer adds or updates a peer in memory and persists to disk.
func UpsertPeer(p Peer) error {
	store.mu.Lock()
	store.peers[p.ID] = p
	list := peersSlice()
	store.mu.Unlock()

	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(peersFile(), data, 0600)
}

// AllPeers returns a snapshot of all peers.
func AllPeers() []Peer {
	store.mu.RLock()
	defer store.mu.RUnlock()
	return peersSlice()
}

func peersSlice() []Peer {
	out := make([]Peer, 0, len(store.peers))
	for _, p := range store.peers {
		out = append(out, p)
	}
	return out
}
