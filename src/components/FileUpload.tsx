import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File, X, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '../contexts/AuthContext';

interface UploadedFile {
  fileName: string;
  chunksProcessed: number;
  totalCharacters: number;
  processedAt: string;
}

interface FileUploadProps {
  twinId: string;
  onUploadComplete?: (file: UploadedFile) => void;
  acceptedFileTypes?: {
    [key: string]: string[];
  };
  maxFileSize?: number;
  className?: string;
}

interface UploadingFile {
  file: File;
  progress: number;
  status: 'uploading' | 'completed' | 'error';
  id: string;
  errorMessage?: string;
}

const FileUpload = ({
  twinId,
  onUploadComplete,
  acceptedFileTypes = {
    'application/pdf': ['.pdf'],
    'text/plain': ['.txt'],
    'application/msword': ['.doc'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
  },
  maxFileSize = 10 * 1024 * 1024, // 10MB (matching API limit)
  className = ""
}: FileUploadProps) => {
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const { toast } = useToast();
  const { getToken } = useAuth();

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const newUploadingFiles: UploadingFile[] = acceptedFiles.map(file => ({
      file,
      progress: 0,
      status: 'uploading' as const,
      id: Math.random().toString(36).substr(2, 9)
    }));

    setUploadingFiles(prev => [...prev, ...newUploadingFiles]);

    for (const uploadingFile of newUploadingFiles) {
      try {
        await uploadFile(uploadingFile);
      } catch (error) {
        console.error('Upload failed:', error);
        setUploadingFiles(prev =>
          prev.map(f =>
            f.id === uploadingFile.id
              ? { ...f, status: 'error', errorMessage: 'Upload failed' }
              : f
          )
        );
      }
    }
  }, [twinId]);

  const uploadFile = async (uploadingFile: UploadingFile) => {
    const { file } = uploadingFile;

    try {
      // Get authentication token
      const token = await getToken();
      if (!token) {
        throw new Error('Authentication required');
      }

      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setUploadingFiles(prev =>
          prev.map(f =>
            f.id === uploadingFile.id
              ? { ...f, progress: Math.min(f.progress + Math.random() * 30, 90) }
              : f
          )
        );
      }, 500);

      // Create FormData for file upload
      const formData = new FormData();
      formData.append('document', file);
      formData.append('twinId', twinId);
      formData.append('title', file.name);
      formData.append('description', `Uploaded training material: ${file.name}`);

      // Upload through secure API
      const response = await fetch(`${API_BASE_URL}/documents/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();

      // Update progress to completed
      setUploadingFiles(prev =>
        prev.map(f =>
          f.id === uploadingFile.id
            ? { ...f, progress: 100, status: 'completed' }
            : f
        )
      );

      toast({
        title: "File uploaded successfully",
        description: `${file.name} has been uploaded and will be processed shortly.`,
      });

      onUploadComplete?.(result);

    } catch (error: unknown) {
      setUploadingFiles(prev =>
        prev.map(f =>
          f.id === uploadingFile.id
            ? { ...f, status: 'error', errorMessage: error instanceof Error ? error.message : 'Upload failed' }
            : f
        )
      );

      toast({
        title: "Upload failed",
        description: error.message || 'An error occurred while uploading the file.',
        variant: "destructive"
      });
    }
  };

  const removeFile = (fileId: string) => {
    setUploadingFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptedFileTypes,
    maxSize: maxFileSize,
    onDropRejected: (rejectedFiles) => {
      rejectedFiles.forEach(({ file, errors }) => {
        const errorMessages = errors.map(e => e.message).join(', ');
        toast({
          title: "File rejected",
          description: `${file.name}: ${errorMessages}`,
          variant: "destructive"
        });
      });
    }
  });

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.includes('audio')) return '🎵';
    if (fileType.includes('video')) return '🎬';
    if (fileType.includes('pdf')) return '📄';
    if (fileType.includes('word') || fileType.includes('document')) return '📝';
    return '📁';
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300 ${
          isDragActive
            ? 'border-[#FF5722] bg-[#FFF3F0]'
            : 'border-[#E5E7EB] hover:border-[#FF5722] hover:bg-[#FFFBF8]'
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="w-12 h-12 mx-auto mb-4 text-[#6B7280]" />
        <h3 className="text-lg font-medium text-[#1A1A4B] mb-2">
          {isDragActive ? 'Drop files here' : 'Upload Training Materials'}
        </h3>
        <p className="text-[#6B7280] mb-4">
          Drag and drop files here, or click to select files
        </p>
        <p className="text-sm text-[#6B7280]">
          Supports: PDF, DOC, DOCX, TXT (max {formatFileSize(maxFileSize)})
        </p>
      </div>

      {/* Uploading Files */}
      {uploadingFiles.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium text-[#1A1A4B]">Uploading Files</h4>
          {uploadingFiles.map((uploadingFile) => (
            <div
              key={uploadingFile.id}
              className="bg-card border border-[#E5E7EB] rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">
                    {getFileIcon(uploadingFile.file.type)}
                  </span>
                  <div>
                    <h5 className="font-medium text-[#1A1A4B] text-sm">
                      {uploadingFile.file.name}
                    </h5>
                    <p className="text-xs text-[#6B7280]">
                      {formatFileSize(uploadingFile.file.size)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {uploadingFile.status === 'completed' && (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  )}
                  {uploadingFile.status === 'error' && (
                    <AlertCircle className="w-5 h-5 text-red-500" />
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(uploadingFile.id)}
                    className="h-8 w-8 p-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {uploadingFile.status === 'uploading' && (
                <Progress value={uploadingFile.progress} className="h-2" />
              )}

              {uploadingFile.status === 'error' && (
                <p className="text-sm text-red-500">
                  {uploadingFile.errorMessage}
                </p>
              )}

              {uploadingFile.status === 'completed' && (
                <p className="text-sm text-green-600">
                  Upload completed successfully
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileUpload;