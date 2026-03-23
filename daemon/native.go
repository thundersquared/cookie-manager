package daemon

import (
	"encoding/binary"
	"encoding/json"
	"io"
)

// ReadMessage reads a single Native Messaging message from r.
// Format: 4-byte little-endian length, then that many bytes of JSON.
func ReadMessage(r io.Reader) ([]byte, error) {
	var length uint32
	if err := binary.Read(r, binary.LittleEndian, &length); err != nil {
		return nil, err
	}
	buf := make([]byte, length)
	if _, err := io.ReadFull(r, buf); err != nil {
		return nil, err
	}
	return buf, nil
}

// WriteMessage writes a single Native Messaging message to w.
func WriteMessage(w io.Writer, b []byte) error {
	length := uint32(len(b))
	if err := binary.Write(w, binary.LittleEndian, length); err != nil {
		return err
	}
	_, err := w.Write(b)
	return err
}

// HandlerFunc handles an incoming NM message and returns a response payload.
type HandlerFunc func(msg map[string]json.RawMessage) (any, error)

// Run reads NM messages from r and writes responses to w until EOF or error.
func Run(r io.Reader, w io.Writer, handlers map[string]HandlerFunc) error {
	for {
		raw, err := ReadMessage(r)
		if err == io.EOF || err == io.ErrUnexpectedEOF {
			return nil // popup closed
		}
		if err != nil {
			return err
		}

		var msg map[string]json.RawMessage
		if err := json.Unmarshal(raw, &msg); err != nil {
			continue
		}

		var action string
		if err := json.Unmarshal(msg["action"], &action); err != nil {
			continue
		}

		var resp any
		if h, ok := handlers[action]; ok {
			resp, err = h(msg)
			if err != nil {
				resp = map[string]any{"ok": false, "error": err.Error()}
			}
		} else {
			resp = map[string]any{"ok": false, "error": "unknown action"}
		}

		out, err := json.Marshal(resp)
		if err != nil {
			continue
		}
		if err := WriteMessage(w, out); err != nil {
			return err
		}
	}
}
