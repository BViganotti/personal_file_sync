import React, { useState, useEffect } from 'react'
import './App.css'

// FileInfo interface matches the Go backend structure
interface FileInfo {
  path: string
  lastModified: string
  size: number
}

// Interface for our structured file system
interface FileNode {
  path: string;
  name: string;
  isDirectory: boolean;
  children: { [key: string]: FileNode };
  size?: number;
  modTime?: string;
}

interface TransferStatus {
  isLoading: boolean;
  message: string;
  isError: boolean;
}

interface TransformedFile {
  localPath: string;
  remotePath: string;
}

function App() {
  // State for managing directories to scan and found files
  const [directories, setDirectories] = useState<string[]>([''])
  const [files, setFiles] = useState<FileInfo[]>([])
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [daysToLookBack, setDaysToLookBack] = useState<number>(7)
  
  // State for file transfer
  const [remotePath, setRemotePath] = useState('')
  const [transferring, setTransferring] = useState(false)
  const [showTransferDialog, setShowTransferDialog] = useState(false)

  // State for directory expansion
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())

  // State for transfer status
  const [transferStatus, setTransferStatus] = useState<TransferStatus>({
    isLoading: false,
    message: '',
    isError: false
  });

  // State for dev environment
  const [isDevEnvironment, setIsDevEnvironment] = useState(false);
  const [baseRemotePath, setBaseRemotePath] = useState('');

  // Add a new directory input field
  const addDirectory = () => {
    setDirectories([...directories, ''])
  }

  // Update directory path at specific index
  const updateDirectory = (index: number, value: string) => {
    const newDirs = [...directories]
    newDirs[index] = value
    setDirectories(newDirs)
  }

  // Organize files into a tree structure
  const organizeFiles = (files: FileInfo[]): FileNode => {
    const root: FileNode = {
      name: 'root',
      path: '',
      isDirectory: true,
      children: {}
    }

    files.forEach(file => {
      const parts = file.path.split('/')
      let current = root

      // Get the relative path by removing the common prefix
      const commonPrefix = directories[0] // Assuming first directory is the base
      const relativePath = file.path.replace(commonPrefix, '').split('/')

      relativePath.forEach((part, index) => {
        if (!part) return

        if (index === relativePath.length - 1) {
          // This is a file
          current.children[part] = {
            name: part,
            path: file.path,
            isDirectory: false,
            size: file.size,
            modTime: file.lastModified,
            children: {}
          }
        } else {
          // This is a directory
          if (!current.children[part]) {
            current.children[part] = {
              name: part,
              path: parts.slice(0, index + 1).join('/'),
              isDirectory: true,
              children: {}
            }
          }
          current = current.children[part]
        }
      })
    })

    return root
  }

  // Toggle directory expansion
  const toggleDirectory = (path: string) => {
    const newExpanded = new Set(expandedDirs)
    if (newExpanded.has(path)) {
      newExpanded.delete(path)
    } else {
      newExpanded.add(path)
    }
    setExpandedDirs(newExpanded)
  }

  // Get all files in a directory (recursive)
  const getAllFilesInDirectory = (node: FileNode): string[] => {
    let files: string[] = [];
    if (node.isDirectory && node.children) {
      for (const child of Object.values(node.children)) {
        if (!child.isDirectory) {
          files.push(child.path);
        } else {
          files = files.concat(getAllFilesInDirectory(child));
        }
      }
    }
    return files;
  };

  // Check if all files in a directory are selected
  const isDirectoryFullySelected = (node: FileNode): boolean => {
    const allFiles = getAllFilesInDirectory(node);
    return allFiles.length > 0 && allFiles.every(file => selectedFiles.has(file));
  };

  // Check if some files in a directory are selected
  const isDirectoryPartiallySelected = (node: FileNode): boolean => {
    const allFiles = getAllFilesInDirectory(node);
    return allFiles.some(file => selectedFiles.has(file)) && !isDirectoryFullySelected(node);
  };

  // Toggle selection for all files in a directory
  const toggleDirectorySelection = (node: FileNode) => {
    const allFiles = getAllFilesInDirectory(node);
    const newSelected = new Set(selectedFiles);
    
    if (isDirectoryFullySelected(node)) {
      // Deselect all files in directory
      allFiles.forEach(file => newSelected.delete(file));
    } else {
      // Select all files in directory
      allFiles.forEach(file => newSelected.add(file));
    }
    
    setSelectedFiles(newSelected);
  };

  // Render file tree recursively
  const renderFileTree = (node: FileNode, level: number = 0) => {
    if (!node.isDirectory && !node.path) return null

    const hasChildren = Object.keys(node.children).length > 0
    const isExpanded = expandedDirs.has(node.path)
    const isFullySelected = hasChildren && isDirectoryFullySelected(node);
    const isPartiallySelected = hasChildren && isDirectoryPartiallySelected(node);

    return (
      <div 
        key={node.path} 
        className="file-tree-item"
        style={{ paddingLeft: `${level * 16}px` }}
      >
        <div className="file-tree-content">
          {node.isDirectory ? (
            <div 
              className="directory-header"
              onClick={() => hasChildren && toggleDirectory(node.path)}
              style={{ cursor: hasChildren ? 'pointer' : 'default' }}
            >
              <div className="directory-icon">
                {hasChildren && (
                  <span
                    className={`collapse-arrow ${isExpanded ? 'expanded' : ''}`}
                    onClick={() => toggleDirectory(node.path)}
                  >
                    ▶
                  </span>
                )}
                <input
                  type="checkbox"
                  className="directory-checkbox"
                  checked={isFullySelected}
                  ref={input => {
                    if (input) {
                      input.indeterminate = isPartiallySelected;
                    }
                  }}
                  onChange={() => toggleDirectorySelection(node)}
                />
                📁
              </div>
              <span className="directory-name">{node.name}</span>
              {hasChildren && (
                <span className="item-count">
                  ({Object.keys(node.children).length} items)
                </span>
              )}
            </div>
          ) : (
            <div className="file-item">
              <div className="file-checkbox">
                <input
                  type="checkbox"
                  checked={selectedFiles.has(node.path)}
                  onChange={() => toggleFile(node.path)}
                />
              </div>
              <div className="file-details">
                <span className="file-name">📄 {node.name}</span>
                <span className="file-info">
                  {formatSize(node.size!)} • {new Date(node.modTime!).toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </div>
        {node.isDirectory && hasChildren && (
          <div className={`directory-children ${isExpanded ? 'expanded' : ''}`}>
            {Object.values(node.children).map(child => 
              renderFileTree(child, level + 1)
            )}
          </div>
        )}
      </div>
    )
  }

  // Scan for files in specified directories
  const scanFiles = async () => {
    try {
      const response = await fetch('http://localhost:8080/api/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          directories: directories.filter(d => d.trim() !== ''),
          daysToLookBack
        }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to scan files')
      }
      
      const data = await response.json()
      setFiles(data)
    } catch (error) {
      console.error('Error scanning files:', error)
      alert('Error scanning files. Please check the console for details.')
    }
  }

  // Transfer selected files
  const transferFiles = async () => {
    const pathToUse = isDevEnvironment ? baseRemotePath : remotePath;
    
    if (!pathToUse) {
      setTransferStatus({
        isLoading: false,
        message: 'Please provide a remote directory path',
        isError: true
      });
      return;
    }

    try {
      setTransferring(true);
      setTransferStatus({
        isLoading: true,
        message: 'Transferring files...',
        isError: false
      });

      // Transform paths for each selected file
      const transformedFiles = Array.from(selectedFiles).map(file => {
        if (isDevEnvironment) {
          // Define common path patterns
          const commonPaths = [
            {
              local: 'fxos/management/boot-cli/cisco/site-packages/cli/common/packaging',
              remote: 'fxos/management/boot-cli/cisco/site-packages/cli/common/packaging'
            },
            {
              local: 'fxos/management/boot-cli/cisco/cli/bin',
              remote: 'fxos/management/boot-cli/cisco/cli/bin'
            }
          ];

          for (const { local } of commonPaths) {
            const index = file.indexOf(local);
            if (index !== -1) {
              // Extract the relative path after the development root
              const relativePath = file.substring(index);
              // Clean up the base remote path (remove any trailing slashes)
              const cleanBasePath = baseRemotePath.replace(/\/+$/, '');
              // Ensure we don't duplicate the remote path
              return {
                localPath: file,
                remotePath: `${cleanBasePath}/${relativePath}`
              };
            }
          }
        }
        
        // If not in dev environment or no common path found
        const cleanPath = pathToUse.replace(/\/+$/, '');
        return {
          localPath: file,
          remotePath: `${cleanPath}/${file.split('/').pop()}`
        };
      });

      console.log('Transformed files:', transformedFiles); // Debug log

      const response = await fetch('http://localhost:8080/api/transfer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          files: transformedFiles,
          isDevEnvironment,
          baseRemotePath: pathToUse.replace(/\/+$/, '') // Clean trailing slashes
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to transfer files');
      }

      setTransferStatus({
        isLoading: false,
        message: 'Files transferred successfully!',
        isError: false
      });
      setSelectedFiles(new Set());
      setShowTransferDialog(false);

      // Auto-hide success message after 3 seconds
      setTimeout(() => {
        setTransferStatus(prev => ({...prev, message: ''}));
      }, 3000);
    } catch (error) {
      console.error('Error transferring files:', error);
      setTransferStatus({
        isLoading: false,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
        isError: true
      });
    } finally {
      setTransferring(false);
    }
  };

  // Get example path for preview based on current directory
  const getExamplePath = () => {
    if (!baseRemotePath) return '';

    // Get the current directory being scanned
    const currentDir = directories[0] || '';
    
    // Check which pattern matches the current directory
    const commonPaths = [
      'fxos/management/boot-cli/cisco/site-packages/cli/common/packaging',
      'fxos/management/boot-cli/cisco/cli/bin'
    ];

    for (const path of commonPaths) {
      if (currentDir.includes(path)) {
        return `${baseRemotePath.replace(/\/$/, '')}/${path}/...`;
      }
    }

    return `${baseRemotePath.replace(/\/$/, '')}/...`;
  };

  // Toggle file selection
  const toggleFile = (path: string) => {
    const newSelected = new Set(selectedFiles)
    if (newSelected.has(path)) {
      newSelected.delete(path)
    } else {
      newSelected.add(path)
    }
    setSelectedFiles(newSelected)
  }

  // Format file size for display
  const formatSize = (size: number) => {
    const units = ['B', 'KB', 'MB', 'GB']
    let i = 0
    while (size >= 1024 && i < units.length - 1) {
      size /= 1024
      i++
    }
    return `${size.toFixed(1)} ${units[i]}`
  }

  const fileTree = organizeFiles(files)

  return (
    <div className="app">
      <div className="directory-input-section">
        <h2>Directories to Scan</h2>
        <div className="directory-input-row">
          <div className="days-input-group">
            <label className="days-label">Days to look back:</label>
            <input
              type="number"
              className="days-input"
              value={daysToLookBack}
              onChange={(e) => setDaysToLookBack(Math.max(1, parseInt(e.target.value) || 7))}
              min="1"
            />
          </div>
        </div>
        <div className="directory-input-row">
          {directories.map((dir, index) => (
            <input
              key={index}
              type="text"
              className="directory-input"
              value={dir}
              onChange={(e) => updateDirectory(index, e.target.value)}
              placeholder="Enter directory path"
            />
          ))}
        </div>
        <div className="directory-actions">
          <button className="button" onClick={addDirectory}>Add Directory</button>
          <button className="button" onClick={scanFiles}>Scan Files</button>
        </div>
      </div>

      {/* File tree */}
      {files.length > 0 && (
        <div className="files">
          <h2>Found Files</h2>
          <div className="file-tree">
            {renderFileTree(fileTree)}
          </div>
        </div>
      )}

      {/* Fixed transfer button */}
      {selectedFiles.size > 0 && (
        <div className="transfer-button-fixed">
          <button 
            onClick={() => setShowTransferDialog(true)}
            className="primary"
          >
            Transfer Selected Files ({selectedFiles.size})
          </button>
        </div>
      )}

      {/* Status message */}
      {transferStatus.message && (
        <div className={`status-message ${transferStatus.isError ? 'error' : 'success'} ${transferStatus.isLoading ? 'loading' : ''}`}>
          {transferStatus.isLoading && (
            <div className="loading-spinner"></div>
          )}
          <span>{transferStatus.message}</span>
        </div>
      )}

      {/* Transfer Dialog */}
      {showTransferDialog && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Transfer Files</h2>
            <div className="transfer-form">
              <div className="environment-toggle">
                <label>
                  <input
                    type="checkbox"
                    checked={isDevEnvironment}
                    onChange={(e) => {
                      setIsDevEnvironment(e.target.checked);
                      // Clear the paths when switching modes
                      setRemotePath('');
                      setBaseRemotePath('');
                    }}
                  />
                  Development Environment
                </label>
                <div className="help-text">
                  Enable this if you're transferring between development and remote environments
                </div>
              </div>
              
              <label>
                {isDevEnvironment ? 'Remote Base Path:' : 'Remote Directory Path:'}
                <input
                  type="text"
                  className="remote-path-input"
                  value={isDevEnvironment ? baseRemotePath : remotePath}
                  onChange={(e) => isDevEnvironment 
                    ? setBaseRemotePath(e.target.value)
                    : setRemotePath(e.target.value)
                  }
                  placeholder={isDevEnvironment 
                    ? "/workspace/new_fxos_18" 
                    : "/path/to/remote/directory"
                  }
                />
                {isDevEnvironment && baseRemotePath && (
                  <div className="path-preview">
                    Example path: {getExamplePath()}
                  </div>
                )}
              </label>
            </div>
            <div className="modal-buttons">
              <button onClick={() => {
                setShowTransferDialog(false);
                setTransferStatus({ isLoading: false, message: '', isError: false });
              }}>
                Cancel
              </button>
              <button
                onClick={transferFiles}
                disabled={transferring || (!isDevEnvironment && !remotePath) || (isDevEnvironment && !baseRemotePath)}
                className="primary"
              >
                {transferring ? 'Transferring...' : 'Start Transfer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
