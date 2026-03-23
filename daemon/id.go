package daemon

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
)

func supportDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Library", "Application Support", "sqrd-cookie-sync")
}

// LoadOrCreateID returns the stable UUID for this installation,
// generating and persisting one if none exists yet.
func LoadOrCreateID() (string, error) {
	dir := supportDir()
	if err := os.MkdirAll(dir, 0700); err != nil {
		return "", err
	}

	idFile := filepath.Join(dir, "id")
	data, err := os.ReadFile(idFile)
	if err == nil {
		id := strings.TrimSpace(string(data))
		if _, parseErr := uuid.Parse(id); parseErr == nil {
			return id, nil
		}
	}

	id := uuid.New().String()
	if err := os.WriteFile(idFile, []byte(id+"\n"), 0600); err != nil {
		return "", err
	}
	return id, nil
}
