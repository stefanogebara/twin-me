import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, Loader2, Check, ChevronRight, X, Clipboard } from 'lucide-react';
import { enrichmentService, ResumeUploadResponse } from '@/services/enrichmentService';

interface ResumeUploadStepProps {
  userId: string;
  userName?: string;
  onComplete: (data: ResumeUploadResponse['data']) => void;
  onSkip: () => void;
}

type UploadMode = 'choose' | 'file' | 'paste';

export const ResumeUploadStep: React.FC<ResumeUploadStepProps> = ({
  userId,
  userName,
  onComplete,
  onSkip
}) => {
  const [mode, setMode] = useState<UploadMode>('choose');
  const [isUploading, setIsUploading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<ResumeUploadResponse['data'] | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = async (file: File) => {
    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (!allowedTypes.includes(file.type)) {
      setError('Please upload a PDF, TXT, DOC, or DOCX file.');
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB.');
      return;
    }

    setSelectedFile(file);
    setError(null);
    setMode('file');
  };

  const uploadFile = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setError(null);

    try {
      const result = await enrichmentService.uploadResume(userId, selectedFile, userName);

      if (result.success && result.data) {
        setParsedData(result.data);
      } else {
        setError(result.error || 'Failed to parse resume');
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload resume');
    } finally {
      setIsUploading(false);
    }
  };

  const parseText = async () => {
    if (pastedText.trim().length < 50) {
      setError('Please paste at least 50 characters of resume text.');
      return;
    }

    setIsParsing(true);
    setError(null);

    try {
      const result = await enrichmentService.parseResumeText(userId, pastedText, userName);

      if (result.success && result.data) {
        setParsedData(result.data);
      } else {
        setError(result.error || 'Failed to parse resume text');
      }
    } catch (err) {
      console.error('Parse error:', err);
      setError(err instanceof Error ? err.message : 'Failed to parse resume');
    } finally {
      setIsParsing(false);
    }
  };

  const handleConfirm = () => {
    if (parsedData) {
      onComplete(parsedData);
    }
  };

  // Show parsed results
  if (parsedData) {
    return (
      <div className="min-h-screen flex flex-col bg-[#0C0C0C]">
        <style>
          {`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,400&family=Space+Grotesk:wght@300;400;500&display=swap');`}
        </style>

        <div className="flex justify-between items-center px-8 py-6">
          <div
            className="text-xl tracking-tight"
            style={{ fontFamily: "'Cormorant Garamond', serif", color: '#E8D5B7' }}
          >
            Twin Me
          </div>
        </div>

        <div className="flex-1 px-6 md:px-8">
          <div className="max-w-2xl mx-auto py-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-3 mb-8">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(232, 213, 183, 0.1)' }}
                >
                  <Check className="w-6 h-6" style={{ color: '#E8D5B7' }} />
                </div>
                <div>
                  <h2
                    className="text-2xl"
                    style={{ fontFamily: "'Cormorant Garamond', serif", color: '#E8D5B7' }}
                  >
                    Resume Parsed Successfully
                  </h2>
                  <p
                    className="text-sm opacity-60"
                    style={{ fontFamily: "'Space Grotesk', sans-serif", color: '#E8D5B7' }}
                  >
                    Here's what I found
                  </p>
                </div>
              </div>

              {/* Summary Card */}
              {parsedData.summary && (
                <div
                  className="p-6 rounded-xl"
                  style={{
                    backgroundColor: 'rgba(232, 213, 183, 0.05)',
                    border: '1px solid rgba(232, 213, 183, 0.15)'
                  }}
                >
                  <h3
                    className="text-lg mb-4"
                    style={{ fontFamily: "'Cormorant Garamond', serif", color: '#E8D5B7' }}
                  >
                    {parsedData.summary.name || userName}
                  </h3>

                  {parsedData.summary.current_role && (
                    <p
                      className="text-sm mb-2"
                      style={{ fontFamily: "'Space Grotesk', sans-serif", color: 'rgba(232, 213, 183, 0.8)' }}
                    >
                      {parsedData.summary.current_role}
                      {parsedData.summary.current_company && ` at ${parsedData.summary.current_company}`}
                    </p>
                  )}

                  {parsedData.summary.education_summary && (
                    <p
                      className="text-sm mb-2"
                      style={{ fontFamily: "'Space Grotesk', sans-serif", color: 'rgba(232, 213, 183, 0.6)' }}
                    >
                      {parsedData.summary.education_summary}
                    </p>
                  )}

                  <div className="flex gap-4 mt-4 text-xs" style={{ color: 'rgba(232, 213, 183, 0.5)' }}>
                    {parsedData.summary.experience_count && parsedData.summary.experience_count > 0 && (
                      <span>{parsedData.summary.experience_count} experience{parsedData.summary.experience_count > 1 ? 's' : ''}</span>
                    )}
                    {parsedData.summary.skills_count && parsedData.summary.skills_count > 0 && (
                      <span>{parsedData.summary.skills_count} skills</span>
                    )}
                  </div>
                </div>
              )}

              {/* Experience Preview */}
              {parsedData.experience && parsedData.experience.length > 0 && (
                <div>
                  <h4
                    className="text-sm uppercase tracking-wider mb-3"
                    style={{ fontFamily: "'Space Grotesk', sans-serif", color: 'rgba(232, 213, 183, 0.5)', letterSpacing: '0.1em' }}
                  >
                    Experience
                  </h4>
                  <div className="space-y-3">
                    {parsedData.experience.slice(0, 3).map((exp, i) => (
                      <div
                        key={i}
                        className="p-4 rounded-lg"
                        style={{ backgroundColor: 'rgba(232, 213, 183, 0.03)' }}
                      >
                        <p
                          className="text-sm"
                          style={{ fontFamily: "'Space Grotesk', sans-serif", color: '#E8D5B7' }}
                        >
                          <span className="font-medium">{exp.title}</span>
                          {exp.company && <span className="opacity-60"> at {exp.company}</span>}
                        </p>
                        {exp.start_date && (
                          <p
                            className="text-xs mt-1"
                            style={{ color: 'rgba(232, 213, 183, 0.4)' }}
                          >
                            {exp.start_date} - {exp.end_date || 'Present'}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Skills Preview */}
              {parsedData.skills && (
                <div>
                  <h4
                    className="text-sm uppercase tracking-wider mb-3"
                    style={{ fontFamily: "'Space Grotesk', sans-serif", color: 'rgba(232, 213, 183, 0.5)', letterSpacing: '0.1em' }}
                  >
                    Skills
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {[
                      ...(parsedData.skills.technical || []),
                      ...(parsedData.skills.tools || [])
                    ].slice(0, 8).map((skill, i) => (
                      <span
                        key={i}
                        className="px-3 py-1 rounded-full text-xs"
                        style={{
                          backgroundColor: 'rgba(232, 213, 183, 0.08)',
                          color: 'rgba(232, 213, 183, 0.8)',
                          fontFamily: "'Space Grotesk', sans-serif"
                        }}
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Continue Button */}
              <button
                onClick={handleConfirm}
                className="w-full px-6 py-4 rounded-xl text-base font-medium transition-all duration-200 flex items-center justify-center gap-2 mt-8"
                style={{
                  background: 'linear-gradient(135deg, #E8D5B7 0%, #D4C4A8 100%)',
                  color: '#0C0C0C',
                  fontFamily: "'Space Grotesk', sans-serif"
                }}
              >
                Continue
                <ChevronRight className="w-5 h-5" />
              </button>
            </motion.div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0C0C0C]">
      <style>
        {`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,400&family=Space+Grotesk:wght@300;400;500&display=swap');`}
      </style>

      {/* Header */}
      <div className="flex justify-between items-center px-8 py-6">
        <div
          className="text-xl tracking-tight"
          style={{ fontFamily: "'Cormorant Garamond', serif", color: '#E8D5B7' }}
        >
          Twin Me
        </div>
        <button
          onClick={onSkip}
          className="text-sm tracking-wide uppercase opacity-40 hover:opacity-80 transition-opacity"
          style={{ fontFamily: "'Space Grotesk', sans-serif", color: '#E8D5B7', letterSpacing: '0.1em' }}
        >
          Skip
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 px-6 md:px-8">
        <div className="max-w-2xl mx-auto py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h1
              className="text-3xl md:text-4xl mb-4"
              style={{ fontFamily: "'Cormorant Garamond', serif", color: '#E8D5B7' }}
            >
              Share your resume
            </h1>
            <p
              className="text-base mb-8 opacity-70"
              style={{ fontFamily: "'Space Grotesk', sans-serif", color: '#E8D5B7' }}
            >
              Help me understand your background better by sharing your resume or CV.
            </p>

            <AnimatePresence mode="wait">
              {mode === 'choose' && (
                <motion.div
                  key="choose"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4"
                >
                  {/* Upload File Option */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    className={`w-full p-8 rounded-xl transition-all duration-200 ${
                      dragActive ? 'scale-[1.02]' : ''
                    }`}
                    style={{
                      backgroundColor: dragActive ? 'rgba(232, 213, 183, 0.1)' : 'rgba(232, 213, 183, 0.05)',
                      border: `2px dashed ${dragActive ? 'rgba(232, 213, 183, 0.4)' : 'rgba(232, 213, 183, 0.15)'}`
                    }}
                  >
                    <Upload
                      className="w-8 h-8 mx-auto mb-4"
                      style={{ color: 'rgba(232, 213, 183, 0.6)' }}
                    />
                    <p
                      className="text-base mb-2"
                      style={{ fontFamily: "'Space Grotesk', sans-serif", color: '#E8D5B7' }}
                    >
                      Drop your resume here or click to browse
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: 'rgba(232, 213, 183, 0.4)' }}
                    >
                      PDF, DOC, DOCX, or TXT (max 10MB)
                    </p>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.txt"
                    onChange={handleFileInput}
                    className="hidden"
                  />

                  <div className="flex items-center gap-4 my-6">
                    <div className="flex-1 h-px" style={{ backgroundColor: 'rgba(232, 213, 183, 0.1)' }} />
                    <span
                      className="text-xs uppercase tracking-wider"
                      style={{ color: 'rgba(232, 213, 183, 0.4)' }}
                    >
                      or
                    </span>
                    <div className="flex-1 h-px" style={{ backgroundColor: 'rgba(232, 213, 183, 0.1)' }} />
                  </div>

                  {/* Paste Text Option */}
                  <button
                    onClick={() => setMode('paste')}
                    className="w-full p-6 rounded-xl transition-all duration-200 flex items-center gap-4"
                    style={{
                      backgroundColor: 'rgba(232, 213, 183, 0.05)',
                      border: '1px solid rgba(232, 213, 183, 0.15)'
                    }}
                  >
                    <Clipboard
                      className="w-6 h-6"
                      style={{ color: 'rgba(232, 213, 183, 0.6)' }}
                    />
                    <div className="text-left">
                      <p
                        className="text-base"
                        style={{ fontFamily: "'Space Grotesk', sans-serif", color: '#E8D5B7' }}
                      >
                        Paste resume text
                      </p>
                      <p
                        className="text-xs"
                        style={{ color: 'rgba(232, 213, 183, 0.4)' }}
                      >
                        Copy and paste from your resume
                      </p>
                    </div>
                  </button>
                </motion.div>
              )}

              {mode === 'file' && selectedFile && (
                <motion.div
                  key="file"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-6"
                >
                  {/* Selected File Display */}
                  <div
                    className="p-6 rounded-xl flex items-center gap-4"
                    style={{
                      backgroundColor: 'rgba(232, 213, 183, 0.05)',
                      border: '1px solid rgba(232, 213, 183, 0.15)'
                    }}
                  >
                    <FileText className="w-8 h-8" style={{ color: '#E8D5B7' }} />
                    <div className="flex-1">
                      <p
                        className="text-base truncate"
                        style={{ fontFamily: "'Space Grotesk', sans-serif", color: '#E8D5B7' }}
                      >
                        {selectedFile.name}
                      </p>
                      <p
                        className="text-xs"
                        style={{ color: 'rgba(232, 213, 183, 0.4)' }}
                      >
                        {(selectedFile.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedFile(null);
                        setMode('choose');
                      }}
                      className="p-2 rounded-lg transition-colors hover:bg-white/5"
                    >
                      <X className="w-5 h-5" style={{ color: 'rgba(232, 213, 183, 0.6)' }} />
                    </button>
                  </div>

                  <button
                    onClick={uploadFile}
                    disabled={isUploading}
                    className="w-full px-6 py-4 rounded-xl text-base font-medium transition-all duration-200 disabled:opacity-50"
                    style={{
                      background: 'linear-gradient(135deg, #E8D5B7 0%, #D4C4A8 100%)',
                      color: '#0C0C0C',
                      fontFamily: "'Space Grotesk', sans-serif"
                    }}
                  >
                    {isUploading ? (
                      <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                    ) : (
                      'Parse Resume'
                    )}
                  </button>

                  <button
                    onClick={() => {
                      setSelectedFile(null);
                      setMode('choose');
                    }}
                    className="w-full text-sm opacity-50 hover:opacity-80 transition-opacity"
                    style={{ color: '#E8D5B7' }}
                  >
                    Choose a different file
                  </button>
                </motion.div>
              )}

              {mode === 'paste' && (
                <motion.div
                  key="paste"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-6"
                >
                  <textarea
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="Paste your resume text here..."
                    rows={12}
                    className="w-full px-5 py-4 rounded-xl text-base focus:outline-none resize-none"
                    style={{
                      backgroundColor: 'rgba(232, 213, 183, 0.05)',
                      border: '1px solid rgba(232, 213, 183, 0.15)',
                      color: '#E8D5B7',
                      fontFamily: "'Space Grotesk', sans-serif"
                    }}
                  />

                  <button
                    onClick={parseText}
                    disabled={isParsing || pastedText.trim().length < 50}
                    className="w-full px-6 py-4 rounded-xl text-base font-medium transition-all duration-200 disabled:opacity-50"
                    style={{
                      background: 'linear-gradient(135deg, #E8D5B7 0%, #D4C4A8 100%)',
                      color: '#0C0C0C',
                      fontFamily: "'Space Grotesk', sans-serif"
                    }}
                  >
                    {isParsing ? (
                      <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                    ) : (
                      'Parse Text'
                    )}
                  </button>

                  <button
                    onClick={() => {
                      setPastedText('');
                      setMode('choose');
                    }}
                    className="w-full text-sm opacity-50 hover:opacity-80 transition-opacity"
                    style={{ color: '#E8D5B7' }}
                  >
                    Go back
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error Display */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 p-4 rounded-xl"
                style={{
                  backgroundColor: 'rgba(220, 38, 38, 0.1)',
                  border: '1px solid rgba(220, 38, 38, 0.3)'
                }}
              >
                <p className="text-sm text-red-400">{error}</p>
              </motion.div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default ResumeUploadStep;
