package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"
)

// FileInfo represents information about a file that might be synced
type FileInfo struct {
	Path         string    `json:"path"`
	LastModified time.Time `json:"lastModified"`
	Size         int64     `json:"size"`
}

// Config represents the directories to watch
type Config struct {
	Directories    []string `json:"directories"`
	DaysToLookBack int      `json:"daysToLookBack,omitempty"`
}

// SSHConfig represents the SSH connection configuration
type SSHConfig struct {
	Host           string `json:"host"`
	Port           int    `json:"port"`
	Username       string `json:"username"`
	KeyFile        string `json:"keyFile"`
	KnownHostsFile string `json:"knownHostsFile,omitempty"`
	AllowNewHost   bool   `json:"allowNewHost,omitempty"`
}

// AppConfig represents the application configuration
type AppConfig struct {
	SSH SSHConfig `json:"ssh"`
}

// TransferRequest represents the request body for file transfer
type TransferRequest struct {
	Files            []FileTransfer `json:"files"`
	IsDevEnvironment bool           `json:"isDevEnvironment"`
	BaseRemotePath   string         `json:"baseRemotePath"`
}

type FileTransfer struct {
	LocalPath  string `json:"localPath"`
	RemotePath string `json:"remotePath"`
}

var appConfig AppConfig

// loadConfig loads the application configuration from config.json
func loadConfig() error {
	file, err := os.Open("config.json")
	if err != nil {
		return fmt.Errorf("error opening config file: %v", err)
	}
	defer file.Close()

	if err := json.NewDecoder(file).Decode(&appConfig); err != nil {
		return fmt.Errorf("error decoding config file: %v", err)
	}

	// Validate required fields
	if appConfig.SSH.Host == "" {
		return fmt.Errorf("SSH host is required in config")
	}
	if appConfig.SSH.Username == "" {
		return fmt.Errorf("SSH username is required in config")
	}
	if appConfig.SSH.KeyFile == "" {
		return fmt.Errorf("SSH key file is required in config")
	}
	if appConfig.SSH.Port == 0 {
		appConfig.SSH.Port = 22 // Set default port if not specified
	}

	return nil
}

// createSSHClient creates an SSH client using the configuration
func createSSHClient() (*ssh.Client, error) {
	key, err := os.ReadFile(appConfig.SSH.KeyFile)
	if err != nil {
		return nil, fmt.Errorf("unable to read private key from %s: %v", appConfig.SSH.KeyFile, err)
	}

	signer, err := ssh.ParsePrivateKey(key)
	if err != nil {
		return nil, fmt.Errorf("unable to parse private key: %v", err)
	}

	var hostKeyCallback ssh.HostKeyCallback
	if appConfig.SSH.AllowNewHost {
		// For first-time connections, add the host key to known_hosts
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return nil, fmt.Errorf("failed to get user home directory: %v", err)
		}

		knownHostsFile := appConfig.SSH.KnownHostsFile
		if knownHostsFile == "" {
			knownHostsFile = filepath.Join(homeDir, ".ssh", "known_hosts")
		}

		hostKeyCallback = func(hostname string, remote net.Addr, key ssh.PublicKey) error {
			// Check if the host is already known
			knownHostsData, err := os.ReadFile(knownHostsFile)
			if err != nil && !os.IsNotExist(err) {
				return fmt.Errorf("failed to read known_hosts file: %v", err)
			}

			// Parse known hosts file
			if len(knownHostsData) > 0 {
				_, _, _, _, err := ssh.ParseAuthorizedKey(knownHostsData)
				if err == nil {
					// Check if the host is already known
					hostKeyCallback, err := knownhosts.New(knownHostsFile)
					if err != nil {
						return fmt.Errorf("failed to create host key callback: %v", err)
					}
					err = hostKeyCallback(hostname, remote, key)
					if err == nil {
						return nil // Host is already known and valid
					}
				}
			}

			// Add the new host key
			f, err := os.OpenFile(knownHostsFile, os.O_WRONLY|os.O_CREATE|os.O_APPEND, 0600)
			if err != nil {
				return fmt.Errorf("failed to open known_hosts file: %v", err)
			}
			defer f.Close()

			line := knownhosts.Line([]string{hostname}, key)
			if _, err := f.WriteString(line + "\n"); err != nil {
				return fmt.Errorf("failed to add host key: %v", err)
			}

			log.Printf("Added new host key for %s to %s", hostname, knownHostsFile)
			return nil
		}
	} else {
		// Use standard host key verification
		if appConfig.SSH.KnownHostsFile != "" {
			callback, err := knownhosts.New(appConfig.SSH.KnownHostsFile)
			if err != nil {
				return nil, fmt.Errorf("failed to load known_hosts file: %v", err)
			}
			hostKeyCallback = callback
		} else {
			// If no known_hosts file is specified, use the default one
			homeDir, err := os.UserHomeDir()
			if err != nil {
				return nil, fmt.Errorf("failed to get user home directory: %v", err)
			}
			callback, err := knownhosts.New(filepath.Join(homeDir, ".ssh", "known_hosts"))
			if err != nil {
				return nil, fmt.Errorf("failed to load default known_hosts file: %v", err)
			}
			hostKeyCallback = callback
		}
	}

	config := &ssh.ClientConfig{
		User: appConfig.SSH.Username,
		Auth: []ssh.AuthMethod{
			ssh.PublicKeys(signer),
		},
		HostKeyCallback: hostKeyCallback,
		Timeout:         30 * time.Second,
	}

	addr := fmt.Sprintf("%s:%d", appConfig.SSH.Host, appConfig.SSH.Port)
	client, err := ssh.Dial("tcp", addr, config)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to %s: %v", addr, err)
	}

	return client, nil
}

func main() {
	// Set up logging
	log.SetFlags(log.LstdFlags | log.Lshortfile)

	// Load configuration
	if err := loadConfig(); err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	// Initialize HTTP routes with CORS
	http.HandleFunc("/api/scan", enableCORS(handleScan))
	http.HandleFunc("/api/transfer", enableCORS(handleTransfer))

	// Start the server
	log.Println("Starting server on :8080...")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatal(err)
	}
}

// enableCORS adds CORS headers to the response
func enableCORS(handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Allow requests from our React development server
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		handler(w, r)
	}
}

// handleScan handles the scan request for modified files
func handleScan(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse the request body
	var config Config
	if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Set default days to look back if not specified
	if config.DaysToLookBack <= 0 {
		config.DaysToLookBack = 7
	}

	// Calculate the current time
	now := time.Now()

	// Scan directories and collect file information
	var files []FileInfo
	for _, dir := range config.Directories {
		err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return err
			}
			// Only include non-directory files modified within the specified days
			modTime := info.ModTime()
			daysSinceModification := now.Sub(modTime).Hours() / 24

			if !info.IsDir() && daysSinceModification <= float64(config.DaysToLookBack) {
				files = append(files, FileInfo{
					Path:         path,
					LastModified: modTime,
					Size:         info.Size(),
				})
			}
			return nil
		})
		if err != nil {
			log.Printf("Error scanning directory %s: %v", dir, err)
		}
	}

	// Sort files by modification time (most recent first)
	sort.Slice(files, func(i, j int) bool {
		return files[i].LastModified.After(files[j].LastModified)
	})

	// Send the response
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(files)
}

// transferFile attempts to transfer a file using either SFTP or SCP
func transferFile(client *ssh.Client, localPath, remotePath string, useSCP bool) error {
	if !useSCP {
		// Try SFTP first
		sftp, err := sftp.NewClient(client)
		if err != nil {
			log.Printf("SFTP not available: %v, falling back to SCP", err)
			return transferFileSCP(client, localPath, remotePath)
		}
		defer sftp.Close()

		// Create remote directory if it doesn't exist
		remoteDir := filepath.Dir(remotePath)
		if err := sftp.MkdirAll(remoteDir); err != nil {
			return fmt.Errorf("failed to create remote directory: %v", err)
		}

		// Open local file
		localFile, err := os.Open(localPath)
		if err != nil {
			return fmt.Errorf("failed to open local file: %v", err)
		}
		defer localFile.Close()

		// Create remote file
		remoteFile, err := sftp.Create(remotePath)
		if err != nil {
			return fmt.Errorf("failed to create remote file: %v", err)
		}
		defer remoteFile.Close()

		// Copy file contents
		_, err = io.Copy(remoteFile, localFile)
		if err != nil {
			return fmt.Errorf("failed to copy file: %v", err)
		}

		return nil
	}

	return transferFileSCP(client, localPath, remotePath)
}

// transferFileSCP transfers a file using SCP protocol
func transferFileSCP(client *ssh.Client, localPath, remotePath string) error {
	session, err := client.NewSession()
	if err != nil {
		return fmt.Errorf("failed to create session: %v", err)
	}
	defer session.Close()

	// Open local file
	localFile, err := os.Open(localPath)
	if err != nil {
		return fmt.Errorf("failed to open local file: %v", err)
	}
	defer localFile.Close()

	// Get file info for size
	stat, err := localFile.Stat()
	if err != nil {
		return fmt.Errorf("failed to stat local file: %v", err)
	}

	// Create remote directory using mkdir -p
	remoteDir := filepath.Dir(remotePath)
	mkdirSession, err := client.NewSession()
	if err != nil {
		return fmt.Errorf("failed to create mkdir session: %v", err)
	}
	err = mkdirSession.Run(fmt.Sprintf("mkdir -p %s", remoteDir))
	mkdirSession.Close()
	if err != nil {
		return fmt.Errorf("failed to create remote directory: %v", err)
	}

	// Transfer file using SCP
	go func() {
		w, _ := session.StdinPipe()
		defer w.Close()
		fmt.Fprintf(w, "C0644 %d %s\n", stat.Size(), filepath.Base(remotePath))
		io.Copy(w, localFile)
		fmt.Fprint(w, "\x00")
	}()

	return session.Run(fmt.Sprintf("scp -t %s", remotePath))
}

func handleTransfer(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req TransferRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Create SSH client
	client, err := createSSHClient()
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to create SSH client: %v", err), http.StatusInternalServerError)
		return
	}
	defer client.Close()

	// Try SFTP first
	useSCP := false
	sftp, err := sftp.NewClient(client)
	if err != nil {
		log.Printf("SFTP not available: %v, will use SCP for all transfers", err)
		useSCP = true
	} else {
		sftp.Close()
	}

	// Transfer each file
	for _, file := range req.Files {
		localPath := file.LocalPath
		remotePath := file.RemotePath

		log.Printf("Transferring %s to %s", localPath, remotePath)
		if err := transferFile(client, localPath, remotePath, useSCP); err != nil {
			http.Error(w, fmt.Sprintf("Failed to transfer file %s: %v", localPath, err), http.StatusInternalServerError)
			return
		}
		log.Printf("Successfully transferred %s", localPath)
	}

	w.WriteHeader(http.StatusOK)
}
