package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"

	daemon "github.com/thundersquared/cookie-manager/daemon"
)

func main() {
	// Load stable identity.
	id, err := daemon.LoadOrCreateID()
	if err != nil {
		fmt.Fprintln(os.Stderr, "id:", err)
		os.Exit(1)
	}

	hostname, _ := os.Hostname()
	profile := chromeProfile()

	// Load known peers and probe them in the background.
	if err := daemon.LoadPeers(); err != nil {
		fmt.Fprintln(os.Stderr, "peers load:", err)
	}
	go probeKnownPeers()

	// Start LAN HTTP server.
	q := &daemon.Queue{}
	port, stopHTTP, err := daemon.NewHTTPServer(id, q)
	if err != nil {
		fmt.Fprintln(os.Stderr, "http:", err)
		os.Exit(1)
	}
	defer stopHTTP()

	// Advertise via mDNS.
	stopMDNS, err := daemon.Advertise(id, hostname, profile, port)
	if err != nil {
		fmt.Fprintln(os.Stderr, "mdns advertise:", err)
		// non-fatal — carry on without advertising
	} else {
		defer stopMDNS()
	}

	// Discover peers in background, updating in-memory store.
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	peers, err := daemon.Discover(ctx)
	if err != nil {
		fmt.Fprintln(os.Stderr, "mdns discover:", err)
	} else {
		go func() {
			for p := range peers {
				daemon.UpsertPeer(p) //nolint:errcheck
			}
		}()
	}

	// Build NM handler map.
	handlers := map[string]daemon.HandlerFunc{
		"list_peers": func(_ map[string]json.RawMessage) (any, error) {
			type peerResp struct {
				daemon.Peer
				Known bool `json:"known"`
			}
			all := daemon.AllPeers()
			resp := make([]peerResp, 0, len(all))
			for _, p := range all {
				resp = append(resp, peerResp{Peer: p, Known: p.LastIP != ""})
			}
			return map[string]any{"peers": resp}, nil
		},

		"push_cookies": func(msg map[string]json.RawMessage) (any, error) {
			var peerID string
			var domain string
			var cookies json.RawMessage
			if err := json.Unmarshal(msg["peer_id"], &peerID); err != nil {
				return nil, fmt.Errorf("peer_id required")
			}
			if err := json.Unmarshal(msg["domain"], &domain); err != nil {
				return nil, fmt.Errorf("domain required")
			}
			cookies = msg["cookies"]

			// Find peer.
			var target *daemon.Peer
			for _, p := range daemon.AllPeers() {
				if p.ID == peerID {
					cp := p
					target = &cp
					break
				}
			}
			if target == nil || target.LastIP == "" {
				return nil, fmt.Errorf("peer unreachable")
			}

			payload, _ := json.Marshal(map[string]any{
				"from":    map[string]string{"id": id, "hostname": hostname, "profile": profile},
				"domain":  domain,
				"cookies": cookies,
			})

			url := fmt.Sprintf("http://%s:%d/sync", target.LastIP, target.LastPort)
			resp, err := http.Post(url, "application/json", bytes.NewReader(payload))
			if err != nil {
				return nil, fmt.Errorf("peer unreachable: %w", err)
			}
			resp.Body.Close()
			if resp.StatusCode != http.StatusOK {
				return nil, fmt.Errorf("peer returned %d", resp.StatusCode)
			}

			// Remember updated address.
			daemon.UpsertPeer(*target) //nolint:errcheck

			return map[string]any{"ok": true}, nil
		},

		"check_pending": func(_ map[string]json.RawMessage) (any, error) {
			batches := q.DrainAll()
			return map[string]any{"pending": batches}, nil
		},
	}

	// Block until stdin EOF (Chrome killed us or popup closed).
	if err := daemon.Run(os.Stdin, os.Stdout, handlers); err != nil {
		fmt.Fprintln(os.Stderr, "nm run:", err)
		os.Exit(1)
	}
}

// chromeProfile returns the Chrome profile name from the environment, if set.
func chromeProfile() string {
	if p := os.Getenv("CHROME_PROFILE"); p != "" {
		return p
	}
	return "Default"
}

func probeKnownPeers() {
	client := &http.Client{Timeout: 2 * time.Second}
	for _, p := range daemon.AllPeers() {
		if p.LastIP == "" {
			continue
		}
		url := fmt.Sprintf("http://%s:%d/ping", p.LastIP, p.LastPort)
		resp, err := client.Get(url)
		if err == nil {
			resp.Body.Close()
		}
		// Peer is reachable: already in store with correct IP/port.
	}
}

