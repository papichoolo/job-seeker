'use client';

import { useCallback, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, FileText } from 'lucide-react';

interface DropZoneProps {
    onFileSelect: (file: File) => void;
    isDisabled?: boolean;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export function DropZone({ onFileSelect, isDisabled = false }: DropZoneProps) {
    const [isDragOver, setIsDragOver] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const validateFile = (file: File): string | null => {
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            return 'Only PDF files are supported';
        }
        if (file.size > MAX_FILE_SIZE) {
            return 'File size must be less than 5MB';
        }
        return null;
    };

    const handleFile = useCallback((file: File) => {
        const validationError = validateFile(file);
        if (validationError) {
            setError(validationError);
            return;
        }
        setError(null);
        setSelectedFile(file);
        onFileSelect(file);
    }, [onFileSelect]);

    const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragOver(false);

        if (isDisabled) return;

        const file = e.dataTransfer.files[0];
        if (file) {
            handleFile(file);
        }
    }, [handleFile, isDisabled]);

    const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (!isDisabled) {
            setIsDragOver(true);
        }
    }, [isDisabled]);

    const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragOver(false);
    }, []);

    const handleClick = useCallback(() => {
        if (isDisabled) return;

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.pdf';
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
                handleFile(file);
            }
        };
        input.click();
    }, [handleFile, isDisabled]);

    return (
        <Card
            className={`
        relative cursor-pointer transition-all duration-300 ease-out
        border-2 border-dashed
        ${isDragOver
                    ? 'border-white bg-white/10 scale-[1.02]'
                    : 'border-neutral-700 hover:border-neutral-500 bg-neutral-900/50'
                }
        ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${error ? 'border-red-500' : ''}
      `}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={handleClick}
        >
            <CardContent className="flex flex-col items-center justify-center py-16 px-8">
                <div className={`
          mb-6 p-4 rounded-full transition-all duration-300
          ${isDragOver ? 'bg-white/20 scale-110' : 'bg-neutral-800'}
        `}>
                    {selectedFile ? (
                        <FileText className="w-12 h-12 text-white" />
                    ) : (
                        <Upload className={`w-12 h-12 transition-colors ${isDragOver ? 'text-white' : 'text-neutral-400'}`} />
                    )}
                </div>

                {selectedFile ? (
                    <>
                        <p className="text-xl font-medium text-white mb-2">
                            {selectedFile.name}
                        </p>
                        <p className="text-sm text-neutral-400">
                            {(selectedFile.size / 1024).toFixed(1)} KB
                        </p>
                    </>
                ) : (
                    <>
                        <p className="text-xl font-medium text-white mb-2">
                            Drop your resume here
                        </p>
                        <p className="text-sm text-neutral-400 text-center">
                            or click to browse • PDF only • Max 5MB
                        </p>
                    </>
                )}

                {error && (
                    <p className="mt-4 text-sm text-red-400 font-medium">
                        {error}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
