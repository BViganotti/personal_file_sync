# File Sync Tool

A modern, secure file synchronization tool with a beautiful dark-themed UI. Easily sync files between your local machine and remote servers using SSH.

![File Sync Tool Screenshot](docs/images/Screenshot%202025-02-05%20at%2015.27.00.png)

## Features

- 🎨 Modern dark theme UI with excellent visibility
- 🔒 Secure SSH file transfer with SFTP/SCP support
- 🔑 Proper host key verification with first-time connection support
- 📁 Multiple directory scanning
- ⏱️ Time-based file filtering
- 🚀 Fast file transfer with progress tracking
- 🔄 Development/Production path transformation
- 📝 Clear logging and error reporting

## Why

I'm working for big tech company and my work VM is far away. Whether it is for updating files with VSCode remotely or using AI tools the latency is so long that i can drink an espresso between two prompts which i'm not a fan of. I'm also not a fan of modifying 150x a day some rsync commands or scp this and that, so i created this tool to quiet my frustration. Now i can use VSCode locally and its a much better experience.

## Prerequisites

- Go 1.21 or later
- Node.js 18 or later
- npm or yarn
- SSH access to your remote server

## Installation

1. Clone the repository:
```bash
git clone https://github.com/BViganotti/personal_file_sync.git
cd syncing
```

2. Install frontend dependencies:
```bash
cd frontend
npm install
cd ..
```

3. Copy the configuration template:
```bash
cp config.template.json config.json
```

4. Edit `config.json` with your SSH settings:
```json
{
    "ssh": {
        "host": "your-host",
        "port": 22,
        "username": "your-username",
        "keyFile": "/path/to/.ssh/id_rsa",
        "allowNewHost": true
    }
}
```

## Running the Project

The easiest way to run both the frontend and backend is to use the provided script:

```bash
# Make the script executable (only needed once)
chmod +x run.sh

# Run both frontend and backend
./run.sh
```

The script will:
- Kill any existing frontend/backend processes if they're running
- Start the backend server on port 8080
- Start the frontend development server on port 5173
- Output the frontend URL for easy access

The script redirects output to `frontend.log` and `backend.log` files for debugging purposes.

## Usage

1. Start the backend server:
```bash
go run main.go
```

2. Start the frontend development server:
```bash
cd frontend
npm run dev
```

3. Open your browser and navigate to http://localhost:5174

4. Add directories to scan and specify how many days back to look for modified files

5. Select files to transfer and specify the remote path

## Development Features

### Path Transformation
When working in a development environment, you can enable path transformation to automatically map local paths to their corresponding remote paths. For example:

- Local: `/Users/username/projects/myapp/src/file.txt`
- Remote: `/var/www/myapp/src/file.txt`

Simply enable the development environment checkbox and set your base remote path.

### Security Features

- Secure SSH key authentication
- Proper host key verification
- Option for automatic host key addition on first connection
- No hardcoded secrets
- Configuration file excluded from version control

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
