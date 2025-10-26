import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File, X, CheckCircle, AlertCircle, FileText, Video, Music, Image, Folder } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '../../contexts/AuthContext';

interface UploadedFile {
  fileName: string;
  chunksProcessed: number;
  totalCharacters: number;
  processedAt: string;
}

interface EnhancedFileUploadProps {
  twinId: string;
  onUploadComplete?: (file: UploadedFile) => void;
  acceptedFileTypes?: {
    [key: string]: string[];
  };
  maxFileSize?: number;
  maxFiles?: number;
  className?: string;
  title?: string;
  description?: string;
  allowMultiple?: boolean;
}

interface UploadingFile {
  file: File;
  progress: number;
  status: 'uploading' | 'completed' | 'error';
  id: string;
  errorMessage?: string;
}

const EnhancedFileUpload: React.FC<EnhancedFileUploadProps> = ({
  twinId,
  onUploadComplete,
  acceptedFileTypes = {
    'application/pdf': ['.pdf'],
    'text/plain': ['.txt'],
    'application/msword': ['.doc'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'audio/mpeg': ['.mp3'],
    'audio/wav': ['.wav'],
    'audio/mp4': ['.m4a'],
    'video/mp4': ['.mp4'],
    'video/quicktime': ['.mov'],
    'video/x-msvideo': ['.avi']
  },
  maxFileSize = 50 * 1024 * 1024, // 50MB
  maxFiles = 10,
  className = "",
  title = "Upload Training Materials",
  description = "Drag and drop files here, or click to select files",
  allowMultiple = true
}) => {
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [completedFiles, setCompletedFiles] = useState<UploadedFile[]>([]);
  const { toast } = useToast();
  const { getToken } = useAuth();

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!twinId || twinId === 'placeholder') {
      toast({
        title: "Cannot upload files",
        description: "Please save your twin first before uploading files.",
        variant: "destructive"
      });
      return;
    }

    // Check file limits
    if (uploadingFiles.length + completedFiles.length + acceptedFiles.length > maxFiles) {
      toast({
        title: "Too many files",
        description: `You can only upload a maximum of ${maxFiles} files.`,
        variant: "destructive"
      });
      return;
    }

    const newUploadingFiles: UploadingFile[] = acceptedFiles.map(file => ({
      file,
      progress: 0,
      status: 'uploading' as const,
      id: Math.random().toString(36).substr(2, 9)
    }));

    setUploadingFiles(prev => [...prev, ...newUploadingFiles]);

    // Upload files sequentially to avoid overwhelming the server
    for (const uploadingFile of newUploadingFiles) {
      try {
        await uploadFile(uploadingFile);
      } catch (error) {
        console.error('Upload failed:', error);
        setUploadingFiles(prev =>
          prev.map(f =>
            f.id === uploadingFile.id
              ? {
                  ...f,
                  status: 'error',
                  errorMessage: error instanceof Error ? error.message : 'Upload failed'
                }
              : f
          )
        );
      }
    }
  }, [twinId, uploadingFiles.length, completedFiles.length, maxFiles]);

  const uploadFile = async (uploadingFile: UploadingFile) => {
    const { file } = uploadingFile;

    try {
      // Get authentication token
      const token = await getToken();
      if (!token) {
        throw new Error('Authentication required. Please sign in.');
      }

      // Validate file
      if (file.size === 0) {
        throw new Error('File is empty');
      }

      if (file.size > maxFileSize) {
        throw new Error(`File is too large. Maximum size is ${formatFileSize(maxFileSize)}`);
      }

      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setUploadingFiles(prev =>
          prev.map(f =>
            f.id === uploadingFile.id && f.status === 'uploading'
              ? { ...f, progress: Math.min(f.progress + Math.random() * 20, 85) }
              : f
          )
        );
      }, 300);

      // Create FormData for file upload
      const formData = new FormData();
      formData.append('document', file);
      formData.append('twinId', twinId);
      formData.append('title', file.name);
      formData.append('description', `Uploaded training material: ${file.name}`);

      // Upload through secure API with retry logic
      let retries = 3;
      let response: Response | null = null;

      while (retries > 0) {
        try {
          response = await fetch(`${API_BASE_URL}/documents/upload`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`
            },
            body: formData
          });
          break;
        } catch (fetchError) {
          retries--;
          if (retries === 0) throw fetchError;
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
        }
      }

      clearInterval(progressInterval);

      if (!response || !response.ok) {
        let errorMessage = `HTTP ${response?.status || 'Network Error'}`;
        try {
          const errorData = await response?.json();
          errorMessage = errorData?.error || errorMessage;
        } catch (e) {
          // Ignore JSON parsing errors
        }
        throw new Error(errorMessage);
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

      // Move to completed files after a delay
      setTimeout(() => {
        setCompletedFiles(prev => [...prev, result]);
        setUploadingFiles(prev => prev.filter(f => f.id !== uploadingFile.id));
      }, 1000);

      toast({
        title: "File uploaded successfully",
        description: `${file.name} has been uploaded and will be processed shortly.`,
      });

      onUploadComplete?.(result);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';

      setUploadingFiles(prev =>
        prev.map(f =>
          f.id === uploadingFile.id
            ? { ...f, status: 'error', errorMessage }
            : f
        )
      );

      toast({
        title: "Upload failed",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  const removeFile = (fileId: string) => {
    setUploadingFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const retryUpload = async (fileId: string) => {
    const uploadingFile = uploadingFiles.find(f => f.id === fileId);
    if (uploadingFile) {
      setUploadingFiles(prev =>
        prev.map(f =>
          f.id === fileId
            ? { ...f, status: 'uploading', progress: 0, errorMessage: undefined }
            : f
        )
      );
      await uploadFile(uploadingFile);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptedFileTypes,
    maxSize: maxFileSize,
    multiple: allowMultiple,
    disabled: !twinId || twinId === 'placeholder',
    onDropRejected: (rejectedFiles) => {
      rejectedFiles.forEach(({ file, errors }) => {
        const errorMessages = errors.map(e => {
          if (e.code === 'file-too-large') {
            return `File is too large. Maximum size is ${formatFileSize(maxFileSize)}`;
          }
          if (e.code === 'file-invalid-type') {
            return 'File type not supported';
          }
          return e.message;
        }).join(', ');

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
    if (fileType.includes('audio')) return <Music className="w-6 h-6 text-purple-500" />;
    if (fileType.includes('video')) return <Video className="w-6 h-6 text-blue-500" />;
    if (fileType.includes('image')) return <Image className="w-6 h-6 text-green-500" />;
    if (fileType.includes('pdf')) return <FileText className="w-6 h-6 text-red-500" />;
    if (fileType.includes('word') || fileType.includes('document')) return <FileText className="w-6 h-6 text-blue-600" />;
    return <File className="w-6 h-6 text-muted-foreground" />;
  };

  const getSupportedFormats = () => {
    const extensions = Object.values(acceptedFileTypes).flat();
    return extensions.join(', ').toUpperCase();
  };

  const isDisabled = !twinId || twinId === 'placeholder';

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 ${
          isDisabled
            ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-50'
            : isDragActive
            ? 'border-[#FF5722] bg-[#FFF3F0] cursor-pointer'
            : 'border-[#E5E7EB] hover:border-[#FF5722] hover:bg-[#FFFBF8] cursor-pointer'
        }`}
      >
        <input {...getInputProps()} disabled={isDisabled} />
        <Upload className={`w-12 h-12 mx-auto mb-4 ${isDisabled ? 'text-gray-300' : 'text-[#6B7280]'}`} />
        <h3 className={`text-lg font-medium mb-2 ${isDisabled ? 'text-gray-400' : 'text-[#1A1A4B]'}`}>
          {isDragActive ? 'Drop files here' : title}
        </h3>
        <p className={`mb-4 ${isDisabled ? 'text-gray-400' : 'text-[#6B7280]'}`}>
          {isDisabled ? 'Save your twin first to enable file uploads' : description}
        </p>
        <p className={`text-sm ${isDisabled ? 'text-gray-400' : 'text-[#6B7280]'}`}>
          Supports: {getSupportedFormats()} (max {formatFileSize(maxFileSize)})
        </p>
        {!isDisabled && (
          <p className="text-xs text-[#6B7280] mt-2">
            Maximum {maxFiles} files • {allowMultiple ? 'Multiple files allowed' : 'Single file only'}
          </p>
        )}
      </div>

      {/* Uploading Files */}
      {uploadingFiles.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium text-[#1A1A4B] flex items-center gap-2">
            <Folder className="w-4 h-4" />
            Uploading Files ({uploadingFiles.length})
          </h4>
          {uploadingFiles.map((uploadingFile) => (
            <div
              key={uploadingFile.id}
              className="bg-card border border-[#E5E7EB] rounded-lg p-4 shadow-sm"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  {getFileIcon(uploadingFile.file.type)}
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
                    <div className="flex gap-2">
                      <AlertCircle className="w-5 h-5 text-red-500" />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => retryUpload(uploadingFile.id)}
                        className="h-6 px-2 text-xs"
                      >
                        Retry
                      </Button>
                    </div>
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
                <div className="space-y-1">
                  <Progress value={uploadingFile.progress} className="h-2" />
                  <p className="text-xs text-[#6B7280]">
                    Uploading... {Math.round(uploadingFile.progress)}%
                  </p>
                </div>
              )}

              {uploadingFile.status === 'error' && (
                <p className="text-sm text-red-500">
                  {uploadingFile.errorMessage || 'Upload failed'}
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

      {/* Completed Files Summary */}
      {completedFiles.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h4 className="font-medium text-green-800 mb-2">
            ✅ Successfully Uploaded ({completedFiles.length} files)
          </h4>
          <div className="space-y-1">
            {completedFiles.map((file, index) => (
              <p key={index} className="text-sm text-green-700">
                {file.fileName} - {file.chunksProcessed} chunks processed
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedFileUpload;