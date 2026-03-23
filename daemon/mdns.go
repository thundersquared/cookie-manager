package daemon

import (
	"context"
	"fmt"
	"net"
	"os"

	"github.com/grandcat/zeroconf"
)

const serviceType = "_cookiesync._tcp"
const domain = "local."

// Advertise registers this instance on the LAN via mDNS/DNS-SD.
// Returns a stop function that deregisters the service.
func Advertise(id, hostname, profile string, port int) (func(), error) {
	instanceName := fmt.Sprintf("sqrd-cookie-sync-%s", id[:8])
	txtRecords := []string{
		fmt.Sprintf("id=%s", id),
		fmt.Sprintf("hostname=%s", hostname),
		fmt.Sprintf("profile=%s", profile),
	}

	server, err := zeroconf.Register(instanceName, serviceType, domain, port, txtRecords, nil)
	if err != nil {
		return nil, err
	}

	return func() { server.Shutdown() }, nil
}

// Discover browses the LAN for peers and sends them on the returned channel.
// The caller must cancel ctx to stop discovery.
func Discover(ctx context.Context) (<-chan Peer, error) {
	entries := make(chan *zeroconf.ServiceEntry, 16)

	resolver, err := zeroconf.NewResolver(nil)
	if err != nil {
		return nil, err
	}

	if err := resolver.Browse(ctx, serviceType, domain, entries); err != nil {
		return nil, err
	}

	out := make(chan Peer, 16)
	hostname, _ := os.Hostname()

	go func() {
		defer close(out)
		for {
			select {
			case <-ctx.Done():
				return
			case entry, ok := <-entries:
				if !ok {
					return
				}
				p := parsePeer(entry, hostname)
				if p != nil {
					out <- *p
				}
			}
		}
	}()

	return out, nil
}

func parsePeer(e *zeroconf.ServiceEntry, selfHostname string) *Peer {
	p := &Peer{LastPort: e.Port}

	for _, txt := range e.Text {
		switch {
		case len(txt) > 3 && txt[:3] == "id=":
			p.ID = txt[3:]
		case len(txt) > 9 && txt[:9] == "hostname=":
			p.Hostname = txt[9:]
		case len(txt) > 8 && txt[:8] == "profile=":
			p.Profile = txt[8:]
		}
	}

	if p.ID == "" {
		return nil
	}

	// Pick the first non-loopback IPv4 address.
	for _, addr := range e.AddrIPv4 {
		if !addr.IsLoopback() {
			p.LastIP = addr.String()
			break
		}
	}
	// Fallback: use IPv6.
	if p.LastIP == "" {
		for _, addr := range e.AddrIPv6 {
			if !addr.IsLoopback() {
				p.LastIP = net.JoinHostPort(addr.String(), "")
				break
			}
		}
	}

	if p.LastIP == "" {
		return nil
	}
	return p
}
