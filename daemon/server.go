package daemon

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
)

type syncPayload struct {
	From struct {
		ID       string `json:"id"`
		Hostname string `json:"hostname"`
		Profile  string `json:"profile"`
	} `json:"from"`
	Domain  string          `json:"domain"`
	Cookies json.RawMessage `json:"cookies"`
}

// NewHTTPServer starts a LAN HTTP server on a random port.
// Returns the assigned port and a stop function.
func NewHTTPServer(id string, q *Queue) (int, func(), error) {
	ln, err := net.Listen("tcp", ":0")
	if err != nil {
		return 0, nil, err
	}
	port := ln.Addr().(*net.TCPAddr).Port

	mux := http.NewServeMux()

	mux.HandleFunc("/ping", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"id": id})
	})

	mux.HandleFunc("/sync", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var p syncPayload
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		q.Add(p.From.ID, p.From.Hostname, p.Domain, p.Cookies)
		// Upsert peer so we remember it across sessions (best-effort).
		_ = UpsertPeer(Peer{
			ID:       p.From.ID,
			Hostname: p.From.Hostname,
			Profile:  p.From.Profile,
		})
		w.WriteHeader(http.StatusOK)
	})

	srv := &http.Server{Handler: mux}
	go srv.Serve(ln) //nolint:errcheck

	stop := func() {
		srv.Shutdown(context.Background()) //nolint:errcheck
	}
	return port, stop, nil
}
