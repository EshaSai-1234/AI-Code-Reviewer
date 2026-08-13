import React, { useState, useEffect, useRef } from 'react'
import Head from 'next/head'
import axios from 'axios'

interface FileItem {
  path: string;
  content: string;
}

interface Finding {
  id: string;
  title: string;
  cwe?: string;
  cvss?: number;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: 'security' | 'bug' | 'performance' | 'quality' | 'architecture' | 'test';
  file: string;
  lineStart: number;
  lineEnd: number;
  description: string;
  impact: string;
  suggestion: string;
  originalSnippet?: string;
  fixedSnippet?: string;
  generatedTest?: string;
}

interface CodebaseMetrics {
  securityScore: number;
  reliabilityScore: number;
  performanceScore: number;
  maintainabilityScore: number;
  testCoverageEstimate: number;
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  maintainabilityIndex: number;
  technicalDebtHours: number;
}

interface AnalysisResult {
  overallScore: number;
  grade: string;
  metrics: CodebaseMetrics;
  totalFiles: number;
  totalLines: number;
  totalCharacters: number;
  findingCounts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  findings: Finding[];
  architectureOverview: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<'editor' | 'analysis' | 'chat'>('editor');
  // Starts with NO pre-filled files - takes user input!
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedFileIdx, setSelectedFileIdx] = useState<number>(0);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisProgress, setAnalysisProgress] = useState<string>('');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

  // Input Hub States (for adding files / pasting code / scanning path)
  const [inputTab, setInputTab] = useState<'upload' | 'paste' | 'path'>('upload');
  const [pasteFilename, setPasteFilename] = useState<string>('sample.ts');
  const [pasteContent, setPasteContent] = useState<string>('');
  const [localDirPath, setLocalDirPath] = useState<string>('');
  const [isScanningPath, setIsScanningPath] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Filters
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedFindingId, setExpandedFindingId] = useState<string | null>(null);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: "👋 Hello! I'm your AI Code Review Assistant. Once you upload or paste your codebase files, I can evaluate security vulnerabilities (CWE/OWASP), detect logic bugs, calculate maintainability metrics, and generate test suites."
    }
  ]);
  const [chatInput, setChatInput] = useState<string>('');
  const [isChatLoading, setIsChatLoading] = useState<boolean>(false);
  const [backendOnline, setBackendOnline] = useState<boolean>(false);

  // Modal State for adding more files
  const [showNewFileModal, setShowNewFileModal] = useState<boolean>(false);
  const [newFilePath, setNewFilePath] = useState<string>('');
  const [newFileContent, setNewFileContent] = useState<string>('');

  const chatEndRef = useRef<HTMLDivElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  useEffect(() => {
    // Check backend health
    axios.get(`${API_URL}/health`)
      .then(() => setBackendOnline(true))
      .catch(() => setBackendOnline(false));
  }, [API_URL]);

  useEffect(() => {
    if (activeTab === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab]);

  // File Upload Handler (Files or Folder)
  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;
    processFileList(Array.from(selected));
  };

  const processFileList = (fileArray: File[]) => {
    const newItems: FileItem[] = [];
    let processed = 0;

    fileArray.forEach((file) => {
      const relativePath = (file as any).webkitRelativePath || file.name;
      
      if (
        relativePath.includes('node_modules/') ||
        relativePath.includes('.git/') ||
        relativePath.includes('.next/') ||
        relativePath.endsWith('.png') ||
        relativePath.endsWith('.jpg') ||
        relativePath.endsWith('.ico') ||
        relativePath.endsWith('.pdf')
      ) {
        processed++;
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (text) {
          newItems.push({
            path: relativePath.replace(/\\/g, '/'),
            content: text
          });
        }
        processed++;
        if (processed === fileArray.length) {
          if (newItems.length > 0) {
            setFiles(prev => [...prev, ...newItems]);
            setSelectedFileIdx(files.length);
            setAnalysisResult(null);
          }
        }
      };
      reader.readAsText(file);
    });
  };

  // Drag and Drop Handler
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFileList(Array.from(e.dataTransfer.files));
    }
  };

  // Paste Code Handler
  const handleAddPastedCode = () => {
    if (!pasteFilename.trim() || !pasteContent.trim()) {
      alert('Please provide both a filename and code content.');
      return;
    }
    setFiles(prev => [...prev, { path: pasteFilename.trim(), content: pasteContent }]);
    setSelectedFileIdx(files.length);
    setPasteContent('');
    setAnalysisResult(null);
  };

  // Local Path Scanner Handler
  const handleScanLocalPath = async () => {
    if (!localDirPath.trim()) {
      alert('Please enter a valid directory path.');
      return;
    }

    setIsScanningPath(true);
    try {
      const res = await axios.post(`${API_URL}/api/scan-dir`, {
        directoryPath: localDirPath.trim()
      });

      if (res.data && res.data.files && res.data.files.length > 0) {
        setFiles(res.data.files);
        setSelectedFileIdx(0);
        setAnalysisResult(null);
        alert(`✅ Successfully loaded ${res.data.files.length} file(s) from ${res.data.scannedPath}!`);
      } else {
        alert('No readable source code files found in the specified path.');
      }
    } catch (err: any) {
      console.error('Scan error:', err);
      alert(err?.response?.data?.error || 'Failed to scan directory. Make sure the path exists on this system.');
    } finally {
      setIsScanningPath(false);
    }
  };

  // Multi-Agent Analysis Execution
  const handleRunAnalysis = async () => {
    if (files.length === 0) {
      alert('Please upload or paste at least one code file to analyze.');
      return;
    }

    setIsAnalyzing(true);
    setActiveTab('analysis');

    const steps = [
      '🔍 Agent 1: Parsing Abstract Syntax Trees & Calculating Cyclomatic Complexity...',
      '🛡️ Agent 2: Scanning Security Vulnerabilities (CWE/OWASP / Secrets / Injection)...',
      '🐛 Agent 3: Detecting Logic Flaws, Race Conditions & Memory Leaks...',
      '⚡ Agent 4: Profiling Asynchronous Bottlenecks & Efficiency...',
      '🧹 Agent 5: Auditing Maintainability Index & Cognitive Debt...',
      '🧪 Agent 6: Synthesizing Automated Framework Test Suites...',
      '📊 Agent 7: Computing Final Evaluation Matrix...'
    ];

    let stepIdx = 0;
    const interval = setInterval(() => {
      if (stepIdx < steps.length) {
        setAnalysisProgress(steps[stepIdx]);
        stepIdx++;
      }
    }, 450);

    try {
      const res = await axios.post(`${API_URL}/api/analyze`, { files });
      clearInterval(interval);
      setTimeout(() => {
        setAnalysisResult(res.data);
        setIsAnalyzing(false);
      }, 1000);
    } catch (err) {
      clearInterval(interval);
      setIsAnalyzing(false);
      console.error('Analysis error:', err);
      alert('Analysis error occurred.');
    }
  };

  // Codebase Q&A Chat
  const handleSendMessage = async (customPrompt?: string) => {
    const text = customPrompt || chatInput;
    if (!text.trim() || isChatLoading) return;

    const userMessage: ChatMessage = { role: 'user', content: text };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    if (!customPrompt) setChatInput('');
    setIsChatLoading(true);

    try {
      const res = await axios.post(`${API_URL}/api/chat`, {
        messages: updatedMessages,
        files
      });
      setMessages([...updatedMessages, { role: 'assistant', content: res.data.reply }]);
    } catch (err: any) {
      setMessages([
        ...updatedMessages,
        {
          role: 'assistant',
          content: '⚠️ Unable to connect to the backend chat API. Please ensure the backend server is running on ' + API_URL
        }
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Apply Remediation Fix to File in Memory
  const handleApplyFix = (finding: Finding) => {
    if (!finding.fixedSnippet) return;
    const targetIdx = files.findIndex(f => f.path === finding.file);
    if (targetIdx === -1) return;

    const currentFile = files[targetIdx];
    if (finding.originalSnippet && currentFile.content.includes(finding.originalSnippet)) {
      const newContent = currentFile.content.replace(finding.originalSnippet, finding.fixedSnippet);
      const updatedFiles = [...files];
      updatedFiles[targetIdx] = { ...currentFile, content: newContent };
      setFiles(updatedFiles);
      alert(`✅ Successfully applied fix to ${finding.file}!`);
    } else {
      alert('Snippet was already modified or applied.');
    }
  };

  const handleCreateNewFile = () => {
    if (!newFilePath.trim()) return;
    setFiles(prev => [...prev, { path: newFilePath.trim(), content: newFileContent }]);
    setSelectedFileIdx(files.length);
    setNewFilePath('');
    setNewFileContent('');
    setShowNewFileModal(false);
  };

  const handleDeleteFile = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = files.filter((_, i) => i !== idx);
    setFiles(updated);
    if (selectedFileIdx >= updated.length) {
      setSelectedFileIdx(Math.max(0, updated.length - 1));
    }
    if (updated.length === 0) {
      setAnalysisResult(null);
    }
  };

  const activeFile = files[selectedFileIdx] || { path: '', content: '' };

  const filteredFindings = (analysisResult?.findings || []).filter(f => {
    if (severityFilter !== 'all' && f.severity !== severityFilter) return false;
    if (categoryFilter !== 'all' && f.category !== categoryFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        f.title.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q) ||
        f.file.toLowerCase().includes(q) ||
        (f.cwe && f.cwe.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <Head>
        <title>AI Code Review — High-Precision Evaluation & Multi-Agent Audit</title>
        <meta name="description" content="Upload or paste your source code files to run automated multi-agent code reviews with precision metrics." />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      {/* Hidden file & folder inputs */}
      <input
        type="file"
        multiple
        ref={fileInputRef}
        onChange={handleFilesSelected}
        className="hidden"
      />
      <input
        type="file"
        multiple
        {...({ webkitdirectory: '', directory: '' } as any)}
        ref={folderInputRef}
        onChange={handleFilesSelected}
        className="hidden"
      />

      {/* Top Navigation Bar */}
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur-md sticky top-0 z-50 px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-violet-600 to-cyan-500 flex items-center justify-center shadow-md shadow-indigo-500/20 font-black text-white text-lg">
            ⚡
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-base tracking-tight text-slate-900">AI Code Review</h1>
              <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                Multi-Agent
              </span>
            </div>
            <p className="text-xs text-slate-500">Security (CWE/OWASP), Reliability, Maintainability & Test Intelligence</p>
          </div>
        </div>

        {/* Center Tabs (Visible when files are loaded) */}
        {files.length > 0 && (
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setActiveTab('editor')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                activeTab === 'editor'
                  ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>📁</span> Code Explorer ({files.length})
            </button>
            <button
              onClick={() => setActiveTab('analysis')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                activeTab === 'analysis'
                  ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>🔍</span> AI Review
              {analysisResult && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-100 text-indigo-800 font-bold border border-indigo-200">
                  {analysisResult.findings.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                activeTab === 'chat'
                  ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>💬</span> Codebase Q&A
            </button>
          </div>
        )}

        {/* Right Actions & Health status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs">
            <span className={`h-2 w-2 rounded-full ${backendOnline ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50 animate-pulse' : 'bg-rose-500'}`} />
            <span className="text-slate-700 font-medium text-[11px]">{backendOnline ? 'API Online' : 'API Offline'}</span>
          </div>

          {files.length > 0 && (
            <>
              <button
                onClick={() => {
                  if (confirm('Clear all uploaded files?')) {
                    setFiles([]);
                    setAnalysisResult(null);
                  }
                }}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-700 border border-slate-200 transition"
              >
                🗑️ Clear
              </button>

              <button
                onClick={handleRunAnalysis}
                disabled={isAnalyzing}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-md shadow-indigo-500/20 transition disabled:opacity-50 flex items-center gap-2"
              >
                {isAnalyzing ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <>
                    <span>✨</span> Run AI Review
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main Workspace Body */}
      <main className="flex-1 flex overflow-hidden">
        {/* VIEW 1: NO FILES LOADED YET -> INPUT & UPLOAD HUB */}
        {files.length === 0 && (
          <div className="flex-1 overflow-y-auto p-8 max-w-4xl mx-auto w-full flex flex-col justify-center my-auto space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold text-slate-900">Input Your Project Files</h2>
              <p className="text-sm text-slate-500 max-w-lg mx-auto">
                Upload your code files, select a whole project folder, paste source code, or scan a local directory to run privacy-first AI analysis.
              </p>
            </div>

            {/* Input Selection Tabs */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
              <div className="flex items-center justify-center gap-2 border-b border-slate-100 pb-4">
                <button
                  onClick={() => setInputTab('upload')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                    inputTab === 'upload'
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span>📁</span> Upload Files / Folder
                </button>
                <button
                  onClick={() => setInputTab('paste')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                    inputTab === 'paste'
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span>✍️</span> Paste Source Code
                </button>
                <button
                  onClick={() => setInputTab('path')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                    inputTab === 'path'
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span>💻</span> Scan Local Folder Path
                </button>
              </div>

              {/* INPUT TAB 1: FILE & FOLDER UPLOAD DROPZONE */}
              {inputTab === 'upload' && (
                <div className="space-y-4">
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center text-center gap-3 transition-all ${
                      isDragging
                        ? 'border-indigo-500 bg-indigo-50/50 scale-[1.01]'
                        : 'border-slate-300 hover:border-indigo-400 bg-slate-50/50'
                    }`}
                  >
                    <div className="h-14 w-14 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-2xl shadow-sm">
                      📥
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">Drag & Drop your code files or directory here</h4>
                      <p className="text-xs text-slate-500 mt-1">
                        Supports TypeScript, JavaScript, Python, Go, Java, C++, Rust, HTML, CSS, JSON, SQL
                      </p>
                    </div>

                    <div className="flex items-center gap-3 mt-2">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
                      >
                        <span>📄</span> Select Files
                      </button>
                      <button
                        onClick={() => folderInputRef.current?.click()}
                        className="px-4 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
                      >
                        <span>📂</span> Select Entire Folder
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* INPUT TAB 2: PASTE CODE */}
              {inputTab === 'paste' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Target Filename</label>
                    <input
                      type="text"
                      placeholder="e.g. authService.ts, server.py, utils.js"
                      value={pasteFilename}
                      onChange={(e) => setPasteFilename(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 font-mono outline-none focus:border-indigo-500 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Source Code Content</label>
                    <textarea
                      rows={10}
                      placeholder="// Paste your source code here..."
                      value={pasteContent}
                      onChange={(e) => setPasteContent(e.target.value)}
                      className="w-full p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 font-mono outline-none focus:border-indigo-500 focus:bg-white resize-none leading-relaxed"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={handleAddPastedCode}
                      disabled={!pasteContent.trim()}
                      className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
                    >
                      <span>➕</span> Add Code to Project
                    </button>
                  </div>
                </div>
              )}

              {/* INPUT TAB 3: SCAN LOCAL PATH */}
              {inputTab === 'path' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Local Directory Path</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="e.g. C:\Users\eshas\Downloads\AI Code Review\apps\backend\src"
                        value={localDirPath}
                        onChange={(e) => setLocalDirPath(e.target.value)}
                        className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 font-mono outline-none focus:border-indigo-500 focus:bg-white"
                      />
                      <button
                        onClick={handleScanLocalPath}
                        disabled={isScanningPath || !localDirPath.trim()}
                        className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold shadow-sm transition flex items-center gap-1.5 whitespace-nowrap"
                      >
                        {isScanningPath ? 'Scanning...' : '🚀 Scan Directory'}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1.5">
                      Fast-scans all files in the directory excluding node_modules, build caches, and binary files.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW 2: FILES ARE LOADED -> WORKSPACE TABS */}
        {files.length > 0 && activeTab === 'editor' && (
          <div className="flex-1 flex">
            {/* Sidebar: File Explorer */}
            <div className="w-80 border-r border-slate-200 bg-white flex flex-col">
              <div className="p-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <span>📂</span> Files ({files.length})
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="p-1 rounded-md hover:bg-slate-200 text-slate-600 cursor-pointer text-xs transition"
                    title="Upload More Files"
                  >
                    <span>⬆️</span>
                  </button>
                  <button
                    onClick={() => setShowNewFileModal(true)}
                    className="p-1 rounded-md hover:bg-slate-200 text-slate-600 text-xs transition"
                    title="Add File"
                  >
                    <span>➕</span>
                  </button>
                </div>
              </div>

              {/* File List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {files.map((file, idx) => {
                  const isSelected = selectedFileIdx === idx;
                  const ext = file.path.split('.').pop() || '';
                  return (
                    <div
                      key={idx}
                      onClick={() => setSelectedFileIdx(idx)}
                      className={`group px-3 py-2 rounded-xl text-xs flex items-center justify-between cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span className="text-sm">
                          {ext === 'ts' || ext === 'tsx' ? '🔷' : ext === 'js' || ext === 'jsx' ? '🟨' : ext === 'py' ? '🐍' : '📄'}
                        </span>
                        <span className="truncate font-mono">{file.path}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 font-mono">
                          {file.content.split('\n').length}L
                        </span>
                        <button
                          onClick={(e) => handleDeleteFile(idx, e)}
                          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 text-xs transition"
                          title="Delete file"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add More Files Footer */}
              <div className="p-3 border-t border-slate-200 bg-slate-50/70 flex gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-700 shadow-sm transition"
                >
                  + Add Files
                </button>
                <button
                  onClick={() => folderInputRef.current?.click()}
                  className="flex-1 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-700 shadow-sm transition"
                >
                  + Add Folder
                </button>
              </div>
            </div>

            {/* Code Viewer / Editor Area */}
            <div className="flex-1 flex flex-col bg-white">
              {/* File Header */}
              <div className="px-6 py-2.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-3 font-mono text-xs text-slate-700">
                  <span className="text-indigo-600">📄</span>
                  <span className="font-bold text-slate-900">{activeFile.path || 'Select a file'}</span>
                  {activeFile.path && (
                    <>
                      <span className="text-slate-300">•</span>
                      <span className="text-slate-500">{activeFile.content.split('\n').length} lines</span>
                      <span className="text-slate-300">•</span>
                      <span className="text-slate-500">{new Blob([activeFile.content]).size} bytes</span>
                    </>
                  )}
                </div>
                {activeFile.path && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(activeFile.content);
                        alert('Code copied to clipboard!');
                      }}
                      className="px-3 py-1 text-xs font-medium rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 transition shadow-sm"
                    >
                      📋 Copy Code
                    </button>
                  </div>
                )}
              </div>

              {/* Editor Textarea with Line Numbers */}
              <div className="flex-1 flex overflow-hidden font-mono text-xs">
                {/* Line numbers gutter */}
                <div className="w-12 bg-slate-50 text-slate-400 select-none py-4 text-right pr-3 border-r border-slate-200 font-mono text-xs overflow-hidden leading-relaxed">
                  {activeFile.content.split('\n').map((_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </div>

                {/* Editable Code Box */}
                <textarea
                  value={activeFile.content}
                  onChange={(e) => {
                    const newText = e.target.value;
                    const updated = [...files];
                    updated[selectedFileIdx] = { ...activeFile, content: newText };
                    setFiles(updated);
                  }}
                  spellCheck={false}
                  className="flex-1 bg-white text-slate-900 p-4 outline-none resize-none overflow-auto font-mono text-xs leading-relaxed border-none focus:ring-0"
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: AI REVIEW & ANALYSIS DASHBOARD */}
        {files.length > 0 && activeTab === 'analysis' && (
          <div className="flex-1 overflow-y-auto p-6 max-w-7xl mx-auto w-full space-y-6">
            {/* Loading / Analyzing State */}
            {isAnalyzing && (
              <div className="bg-white p-8 rounded-2xl flex flex-col items-center justify-center text-center space-y-4 border border-indigo-200 shadow-lg">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center text-xl">⚡</div>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Running Multi-Agent Code Review</h3>
                  <p className="text-sm text-indigo-600 font-mono mt-1 font-medium animate-pulse">{analysisProgress}</p>
                </div>
              </div>
            )}

            {/* If no analysis has been run yet */}
            {!isAnalyzing && !analysisResult && (
              <div className="bg-white p-12 rounded-2xl text-center space-y-4 border border-slate-200 shadow-sm">
                <div className="text-4xl">🛡️</div>
                <h3 className="text-xl font-bold text-slate-900">Ready to Analyze {files.length} File(s)</h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  Click the button below to initiate multi-agent security, bug, performance, and test coverage audit across your codebase.
                </p>
                <button
                  onClick={handleRunAnalysis}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-md shadow-indigo-500/20 transition"
                >
                  🚀 Start Multi-Agent Analysis
                </button>
              </div>
            )}

            {/* Analysis Results View */}
            {!isAnalyzing && analysisResult && (
              <div className="space-y-6">
                {/* Primary Score & Summary Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* Overall Quality Score Dial */}
                  <div className="bg-white p-6 rounded-2xl flex flex-col justify-between border border-slate-200 shadow-sm">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Overall Quality Score</span>
                    <div className="my-4 flex items-baseline gap-3">
                      <span className="text-5xl font-black gradient-text">{analysisResult.overallScore}</span>
                      <span className="text-slate-400 font-semibold">/ 100</span>
                      <span className={`ml-auto text-xl font-black px-3 py-1 rounded-xl border ${
                        analysisResult.grade === 'A+' || analysisResult.grade === 'A'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : analysisResult.grade === 'B'
                          ? 'bg-cyan-50 text-cyan-700 border-cyan-200'
                          : analysisResult.grade === 'C'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}>
                        {analysisResult.grade}
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-cyan-500 transition-all duration-1000"
                        style={{ width: `${analysisResult.overallScore}%` }}
                      />
                    </div>
                  </div>

                  {/* Security Score */}
                  <div className="bg-white p-5 rounded-2xl flex flex-col justify-between border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500">🛡️ Security Health</span>
                      <span className="text-xs font-bold text-indigo-600">{analysisResult.metrics.securityScore}%</span>
                    </div>
                    <div className="my-2">
                      <span className="text-2xl font-bold text-slate-900">{analysisResult.findingCounts.critical} Critical</span>
                      <p className="text-[11px] text-slate-500 mt-0.5">{analysisResult.findingCounts.high} High severity risks</p>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div className="h-full bg-rose-500" style={{ width: `${analysisResult.metrics.securityScore}%` }} />
                    </div>
                  </div>

                  {/* Reliability Score */}
                  <div className="bg-white p-5 rounded-2xl flex flex-col justify-between border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500">🐛 Reliability</span>
                      <span className="text-xs font-bold text-cyan-600">{analysisResult.metrics.reliabilityScore}%</span>
                    </div>
                    <div className="my-2">
                      <span className="text-2xl font-bold text-slate-900">{analysisResult.findingCounts.medium} Medium</span>
                      <p className="text-[11px] text-slate-500 mt-0.5">Logic & runtime stability</p>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-500" style={{ width: `${analysisResult.metrics.reliabilityScore}%` }} />
                    </div>
                  </div>

                  {/* Performance Score */}
                  <div className="bg-white p-5 rounded-2xl flex flex-col justify-between border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500">⚡ Performance</span>
                      <span className="text-xs font-bold text-emerald-600">{analysisResult.metrics.performanceScore}%</span>
                    </div>
                    <div className="my-2">
                      <span className="text-2xl font-bold text-slate-900">{analysisResult.totalFiles} Files</span>
                      <p className="text-[11px] text-slate-500 mt-0.5">{analysisResult.totalLines} Lines indexed</p>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500" style={{ width: `${analysisResult.metrics.performanceScore}%` }} />
                    </div>
                  </div>
                </div>

                {/* Secondary Deep Evaluation Metrics Bar */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">📈 Maintainability Index</span>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-2xl font-black text-indigo-600">{analysisResult.metrics.maintainabilityIndex}</span>
                      <span className="text-xs text-slate-400 font-medium">/ 100</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">SEI Halstead standard metric</p>
                  </div>

                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">🔄 Cyclomatic Complexity</span>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-2xl font-black text-slate-800">{analysisResult.metrics.cyclomaticComplexity}</span>
                      <span className="text-xs text-slate-400 font-medium">total branches</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">Decision points across files</p>
                  </div>

                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">⏱️ Est. Technical Debt</span>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-2xl font-black text-amber-600">{analysisResult.metrics.technicalDebtHours}h</span>
                      <span className="text-xs text-slate-400 font-medium">remediation</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">Estimated effort to fix issues</p>
                  </div>

                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">🧪 Test Coverage Estimate</span>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-2xl font-black text-emerald-600">{analysisResult.metrics.testCoverageEstimate}%</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">Unit test readiness estimate</p>
                  </div>
                </div>

                {/* Architecture Overview Banner */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-start gap-3">
                  <span className="text-xl">💡</span>
                  <div className="text-xs leading-relaxed text-slate-700">
                    <span className="font-bold text-slate-900 block mb-0.5">Multi-Agent Architecture & Evaluation Summary</span>
                    {analysisResult.architectureOverview}
                  </div>
                </div>

                {/* Findings Filter Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white rounded-xl border border-slate-200 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500 mr-1">Severity:</span>
                    {['all', 'critical', 'high', 'medium', 'low', 'info'].map((sev) => (
                      <button
                        key={sev}
                        onClick={() => setSeverityFilter(sev)}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition ${
                          severityFilter === sev
                            ? sev === 'critical'
                              ? 'bg-rose-600 text-white'
                              : sev === 'high'
                              ? 'bg-amber-500 text-white'
                              : 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {sev}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Search findings, CWE, or files..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-500 focus:bg-white w-64"
                    />
                  </div>
                </div>

                {/* Findings Cards List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-500 px-1 font-medium">
                    <span>Showing {filteredFindings.length} of {analysisResult.findings.length} findings</span>
                  </div>

                  {filteredFindings.length === 0 ? (
                    <div className="p-8 text-center bg-white rounded-xl border border-slate-200 text-slate-500 text-xs">
                      No findings match the selected filters.
                    </div>
                  ) : (
                    filteredFindings.map((finding) => {
                      const isExpanded = expandedFindingId === finding.id;
                      const sevBadge = {
                        critical: 'bg-rose-50 text-rose-700 border-rose-200',
                        high: 'bg-amber-50 text-amber-700 border-amber-200',
                        medium: 'bg-cyan-50 text-cyan-700 border-cyan-200',
                        low: 'bg-slate-100 text-slate-700 border-slate-200',
                        info: 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      }[finding.severity];

                      return (
                        <div
                          key={finding.id}
                          className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden transition-all duration-200"
                        >
                          {/* Finding Header */}
                          <div
                            onClick={() => setExpandedFindingId(isExpanded ? null : finding.id)}
                            className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 select-none"
                          >
                            <div className="flex items-center gap-3">
                              <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider border ${sevBadge}`}>
                                {finding.severity}
                              </span>
                              <span className="text-xs uppercase tracking-wider text-slate-600 font-bold px-2 py-0.5 rounded bg-slate-100 border border-slate-200">
                                {finding.category}
                              </span>
                              {finding.cwe && (
                                <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                                  {finding.cwe} {finding.cvss ? `(CVSS ${finding.cvss})` : ''}
                                </span>
                              )}
                              <h4 className="text-sm font-bold text-slate-900 hover:text-indigo-600 transition">
                                {finding.title}
                              </h4>
                            </div>

                            <div className="flex items-center gap-3 text-xs font-mono text-slate-600">
                              <span className="bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
                                📍 {finding.file}:{finding.lineStart}
                              </span>
                              <span className="text-slate-400 text-sm">{isExpanded ? '▲' : '▼'}</span>
                            </div>
                          </div>

                          {/* Expanded Details */}
                          {isExpanded && (
                            <div className="p-5 border-t border-slate-200 bg-slate-50/70 space-y-4 text-xs">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <span className="font-bold text-slate-800 block mb-1">Issue Description</span>
                                  <p className="text-slate-600 leading-relaxed">{finding.description}</p>
                                </div>
                                <div>
                                  <span className="font-bold text-slate-800 block mb-1">Security / Reliability Impact</span>
                                  <p className="text-slate-600 leading-relaxed">{finding.impact}</p>
                                </div>
                              </div>

                              <div>
                                <span className="font-bold text-slate-800 block mb-1">Recommended Remediation</span>
                                <p className="text-indigo-700 font-medium leading-relaxed">{finding.suggestion}</p>
                              </div>

                              {/* Diff Code Viewer */}
                              {(finding.originalSnippet || finding.fixedSnippet) && (
                                <div className="space-y-2">
                                  <span className="font-bold text-slate-800 block">Proposed Code Diff</span>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 font-mono text-[11px]">
                                    {finding.originalSnippet && (
                                      <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 overflow-x-auto">
                                        <div className="text-[10px] text-rose-700 font-bold uppercase mb-1">- Original Code</div>
                                        <pre>{finding.originalSnippet}</pre>
                                      </div>
                                    )}
                                    {finding.fixedSnippet && (
                                      <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 overflow-x-auto">
                                        <div className="text-[10px] text-emerald-700 font-bold uppercase mb-1">+ Remediated Code</div>
                                        <pre>{finding.fixedSnippet}</pre>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Generated Test */}
                              {finding.generatedTest && (
                                <div className="p-3 rounded-lg bg-slate-900 text-slate-100 border border-slate-800 font-mono text-[11px]">
                                  <div className="flex items-center justify-between text-[10px] text-indigo-400 font-bold uppercase mb-1">
                                    <span>🧪 Auto-Generated Unit Test Suite</span>
                                    <button
                                      onClick={() => {
                                        navigator.clipboard.writeText(finding.generatedTest || '');
                                        alert('Test suite copied!');
                                      }}
                                      className="hover:text-indigo-300"
                                    >
                                      Copy Test
                                    </button>
                                  </div>
                                  <pre className="text-slate-200 overflow-x-auto">{finding.generatedTest}</pre>
                                </div>
                              )}

                              {/* Action Buttons */}
                              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                                {finding.fixedSnippet && (
                                  <>
                                    <button
                                      onClick={() => {
                                        navigator.clipboard.writeText(finding.fixedSnippet || '');
                                        alert('Fix snippet copied!');
                                      }}
                                      className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold transition"
                                    >
                                      Copy Fix
                                    </button>
                                    <button
                                      onClick={() => handleApplyFix(finding)}
                                      className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm transition flex items-center gap-1.5"
                                    >
                                      <span>⚡</span> Apply Fix to File
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: CODEBASE Q&A CHAT */}
        {files.length > 0 && activeTab === 'chat' && (
          <div className="flex-1 flex flex-col bg-slate-50 max-w-4xl mx-auto w-full p-4">
            {/* Quick Prompt Chips */}
            <div className="mb-3 flex flex-wrap gap-2">
              {[
                '🛡️ Find top security risks and CWE vulnerabilities',
                '⚡ Identify blocking async operations & bottlenecks',
                '🧪 Generate automated unit test suite',
                '📈 Explain Maintainability Index & Cyclomatic Complexity'
              ].map((chip, i) => (
                <button
                  key={i}
                  onClick={() => handleSendMessage(chip)}
                  className="px-3 py-1 rounded-full bg-white hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 text-xs font-medium border border-slate-200 hover:border-indigo-200 transition shadow-sm"
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Chat Messages Log */}
            <div className="flex-1 overflow-y-auto space-y-4 p-4 rounded-2xl bg-white border border-slate-200 shadow-sm mb-3">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-3 text-xs leading-relaxed ${
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {msg.role === 'assistant' && (
                    <div className="h-7 w-7 rounded-lg bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm">
                      ⚡
                    </div>
                  )}

                  <div
                    className={`max-w-2xl p-4 rounded-2xl whitespace-pre-wrap font-sans ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-br-none shadow-sm'
                        : 'bg-slate-50 text-slate-800 border border-slate-200 rounded-bl-none shadow-sm'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {isChatLoading && (
                <div className="flex gap-3 text-xs">
                  <div className="h-7 w-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-xs animate-pulse">
                    ⚡
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-slate-500 italic">
                    AI Assistant is analyzing codebase context...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Chat Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                placeholder="Ask anything about your uploaded codebase (e.g. security flaws, tests, performance)..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={isChatLoading}
                className="flex-1 px-4 py-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-sm"
              />
              <button
                type="submit"
                disabled={isChatLoading || !chatInput.trim()}
                className="px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold shadow-md shadow-indigo-500/20 transition flex items-center gap-1.5"
              >
                <span>Send</span> ➔
              </button>
            </form>
          </div>
        )}
      </main>

      {/* New File Modal */}
      {showNewFileModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">Add New File to Project</h3>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">File Path / Name</label>
              <input
                type="text"
                placeholder="e.g. src/services/auth.ts"
                value={newFilePath}
                onChange={(e) => setNewFilePath(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-900 outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Initial Code Content (Optional)</label>
              <textarea
                rows={6}
                placeholder="// Paste or write initial code here..."
                value={newFileContent}
                onChange={(e) => setNewFileContent(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-900 outline-none focus:border-indigo-500 font-mono resize-none"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowNewFileModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateNewFile}
                disabled={!newFilePath.trim()}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-xs font-semibold text-white shadow-sm transition"
              >
                Create File
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
